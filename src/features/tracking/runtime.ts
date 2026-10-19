import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Crypto from 'expo-crypto';
import { env } from '@/core/config/env';
import { ApiError, request } from '@/core/api/client';
import { sessionStorage } from '@/core/storage/session-storage';
import { persistSession } from '@/core/storage/session-lock';
import { restoreSession, parseLoginResponse, type Session } from '@/features/auth/model';
import { TelemetryQueue } from '@/core/telemetry/queue';
import { queueStore } from '@/core/telemetry/store';
import { createSensorAdapter } from '@/features/sensors/adapter';
import type { SensorSample } from '@/features/sensors/model';
import { receiptSchema } from '@/features/operations/service';
import type { Packet } from '@/features/operations/model';
import { trackingStore } from './context-store';
import type { TrackingContext, TrackingEvent } from './model';
const TASK = 'koda-active-trip-location-v1';
let context: TrackingContext | null = null,
  generation = 0,
  stopGeneration = 0;
let capturing = Promise.resolve(),
  lifecycle = Promise.resolve();
let stopping = 0;
let stopSamples: (() => void) | undefined;
let latestLocation: Location.LocationObject | undefined;
let lastSync = 0,
  syncing: Promise<void> | undefined;
let lastState: TrackingEvent | undefined;
const failedWrites = new Map<string, Packet>();
const observers = new Set<(event: TrackingEvent) => void>();
const emit = (event: TrackingEvent) => {
  if (event.kind !== 'reading') lastState = event;
  if (AppState.currentState === 'active') for (const observer of observers) observer(event);
};
const serialize = (operation: () => Promise<void>) => {
  const next = lifecycle.catch(() => {}).then(operation);
  lifecycle = next;
  return next;
};
function same(a: TrackingContext | null, b: TrackingContext) {
  return a?.driverId === b.driverId && a.tripId === b.tripId && a.sensor?.id === b.sensor?.id;
}
async function storedSession(driverId: string) {
  const raw = await sessionStorage.read();
  const session = raw ? restoreSession(raw) : null;
  return session && String(session.user.id) === driverId ? session : null;
}
async function authorized(
  path: string,
  options: RequestInit,
  session: Session,
  epoch: number,
): Promise<unknown> {
  const send = (token: string) =>
    request(
      path,
      { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } },
      false,
    );
  try {
    return await send(session.accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !session.refreshToken) throw error;
    const renewed = parseLoginResponse(
      await request(
        env.refreshPath,
        { method: 'POST', body: JSON.stringify({ refreshToken: session.refreshToken }) },
        false,
      ),
    );
    await persistSession(async () => {
      if (
        epoch !== generation ||
        !context ||
        String(renewed.user.id) !== context.driverId ||
        !(await storedSession(context.driverId))
      )
        throw new Error('Monitoramento encerrado.');
      await sessionStorage.write(JSON.stringify(renewed));
    });
    if (epoch !== generation) throw new Error('Monitoramento encerrado.');
    return send(renewed.accessToken);
  }
}
async function syncBackground() {
  if (syncing) return syncing;
  const current = context,
    epoch = generation;
  if (!current) return;
  syncing = (async () => {
    const session = await storedSession(current.driverId);
    if (!session) {
      await stopTracking();
      return;
    }
    const queue = new TelemetryQueue(queueStore, current.driverId, async (packets) => {
      if (epoch !== generation) throw new Error('Monitoramento encerrado.');
      return receiptSchema.parse(
        await authorized(
          env.telemetryPath,
          { method: 'POST', body: JSON.stringify({ readings: packets }) },
          session,
          epoch,
        ),
      );
    });
    let uploadError: unknown;
    try {
      await flushCapturedReadings();
      await queue.flush();
    } catch (error) {
      uploadError = error;
    }
    // Consult the central on wake/regular samples so a remotely closed trip
    // stops collecting; offline failures preserve the last authorized context.
    const result = (await authorized(
      `/entregas/${encodeURIComponent(current.tripId)}/completo`,
      {},
      session,
      epoch,
    ).catch(async (error) => {
      if (
        epoch === generation &&
        error instanceof ApiError &&
        [401, 403, 404].includes(error.status)
      )
        await stopTracking();
      throw error;
    })) as { status?: string };
    if (epoch === generation && ['completed', 'cancelled', 'pending'].includes(result.status ?? ''))
      await stopTracking();
    if (uploadError) throw uploadError;
  })()
    .catch((error) => {
      if (epoch === generation && error instanceof ApiError && error.status === 401)
        void stopTracking();
      if (epoch === generation)
        emit({
          driverId: current.driverId,
          kind: 'error',
          message: error instanceof Error ? error.message : 'Aguardando conexão com a central.',
        });
    })
    .finally(() => {
      syncing = undefined;
    });
  return syncing;
}
function scheduleSync() {
  if (Date.now() - lastSync < 15000) return;
  lastSync = Date.now();
  void syncBackground();
}
function capture(sample: SensorSample) {
  const current = context;
  if (!current) return;
  // Keep the sample time and context captured at the native callback, even when
  // SQLite writes are delayed. Never wait for HTTP before persisting the next sample.
  const location =
    latestLocation && Date.now() - latestLocation.timestamp <= 30000 ? latestLocation : null;
  const packet: Packet = {
    id: Crypto.randomUUID(),
    driverId: current.driverId,
    tripId: current.tripId,
    ...sample,
    latitude: location?.coords.latitude ?? null,
    longitude: location?.coords.longitude ?? null,
  };
  capturing = capturing.then(async () => {
    try {
      await queueStore.put(packet);
      emit({ driverId: current.driverId, kind: 'reading', packet });
    } catch {
      failedWrites.set(packet.id, packet);
      emit({
        driverId: current.driverId,
        kind: 'error',
        message:
          'Falha ao salvar leitura. Libere espaço; a entrega ficará bloqueada até a gravação.',
      });
    }
  });
  // Queue the upload outside the capturing promise to avoid a self-await cycle.
  void capturing.then(scheduleSync);
}
export async function flushCapturedReadings() {
  await capturing;
  for (const [id, packet] of failedWrites) {
    await queueStore.put(packet);
    failedWrites.delete(id);
  }
}
async function resumeSensor(current: TrackingContext) {
  const adapter = await createSensorAdapter();
  stopSamples?.();
  stopSamples = undefined;
  if (!current.sensor) {
    await adapter.disconnect();
    return;
  }
  const state = (connected: boolean) => {
    if (same(context, current))
      emit({
        driverId: current.driverId,
        kind: 'state',
        sensor: current.sensor,
        connected,
        error: connected ? undefined : 'Sensor desconectado. Reconexão automática em andamento.',
      });
  };
  try {
    await adapter.connect(
      current.sensor.id,
      () => state(false),
      () => state(true),
    );
  } catch {
    state(false);
  }
  if (same(context, current))
    stopSamples = await adapter.subscribe(capture, (message) =>
      emit({ driverId: current.driverId, kind: 'error', message }),
    );
}
export function startTracking(next: TrackingContext) {
  const requested = stopGeneration;
  return serialize(async () => {
    if (env.demo || !(await storedSession(next.driverId))) return;
    if (requested !== stopGeneration) return;
    if (same(context, next)) {
      context = next;
      await trackingStore.write(next);
      return;
    }
    const permission = await Location.getBackgroundPermissionsAsync();
    if (!permission.granted)
      throw new Error('Permita localização “Sempre” para acompanhar a viagem com a tela apagada.');
    if (!(await TaskManager.isAvailableAsync()))
      throw new Error('Instale um development build para monitorar em segundo plano.');
    if (requested !== stopGeneration) return;
    const epoch = ++generation;
    stopSamples?.();
    stopSamples = undefined;
    context = next;
    latestLocation = undefined;
    try {
      await trackingStore.write(next);
      if (!(await Location.hasStartedLocationUpdatesAsync(TASK)))
        await Location.startLocationUpdatesAsync(TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000,
          distanceInterval: 10,
          pausesUpdatesAutomatically: false,
          activityType: Location.ActivityType.AutomotiveNavigation,
          showsBackgroundLocationIndicator: true,
          ...(Platform.OS === 'android'
            ? {
                foregroundService: {
                  notificationTitle: 'Koda · viagem em monitoramento',
                  notificationBody: 'Localização e sensor ativos durante a viagem.',
                  notificationColor: '#147D92',
                  killServiceOnDestroy: false,
                },
              }
            : {}),
        });
      if (epoch === generation) await resumeSensor(next);
    } catch (error) {
      context = null;
      generation++;
      await cleanupTracking().catch(() => {});
      throw error;
    }
  });
}
async function cleanupTracking() {
  // A storage failure must never keep Bluetooth/location collecting after logout.
  const results = await Promise.allSettled([
    trackingStore.write(null),
    (async () => {
      if (await Location.hasStartedLocationUpdatesAsync(TASK))
        await Location.stopLocationUpdatesAsync(TASK);
    })(),
    createSensorAdapter().then((adapter) => adapter.disconnect()),
  ]);
  const failed = results.find((r) => r.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}
export function stopTracking(onlyIfActive = false) {
  // Invalidate callbacks immediately, even when a native connect is still pending.
  const previous = context;
  stopping++;
  stopGeneration++;
  generation++;
  context = null;
  stopSamples?.();
  stopSamples = undefined;
  if (previous)
    emit({ driverId: previous.driverId, kind: 'state', sensor: previous.sensor, connected: false });
  return serialize(async () => {
    if (onlyIfActive && !previous && !(await Location.hasStartedLocationUpdatesAsync(TASK))) {
      await trackingStore.write(null);
      return;
    }
    await cleanupTracking();
  }).finally(() => {
    stopping--;
  });
}
export async function restoreTracking(driverId?: string) {
  if (env.demo || stopping) return null;
  const restoring = stopGeneration;
  const saved = await trackingStore.read();
  if (!saved) return null;
  if ((driverId && saved.driverId !== driverId) || !(await storedSession(saved.driverId))) {
    await stopTracking();
    return null;
  }
  if (restoring !== stopGeneration) return null;
  await startTracking(saved);
  return same(context, saved) ? saved : null;
}
export function subscribeTracking(callback: (event: TrackingEvent) => void) {
  observers.add(callback);
  if (lastState) callback(lastState);
  return () => {
    observers.delete(callback);
  };
}
// Native background handlers are registered at module scope, independent of React.
if (!TaskManager.isTaskDefined(TASK))
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
    TASK,
    async ({ data, error }) => {
      if (env.demo) return;
      try {
        if (!context) await restoreTracking();
        if (!context) {
          if (await Location.hasStartedLocationUpdatesAsync(TASK))
            await Location.stopLocationUpdatesAsync(TASK);
          return;
        }
        if (error) {
          emit({
            driverId: context.driverId,
            kind: 'error',
            message: 'Localização em segundo plano indisponível. Verifique as permissões.',
          });
          return;
        }
        if (data?.locations.length) latestLocation = data.locations.at(-1);
        await (await createSensorAdapter()).reconnect?.();
        scheduleSync();
      } catch {
        /* A failed task is retried on the next native wake; persisted readings stay in SQLite. */
      }
    },
  );
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    if (lastState) emit(lastState);
    void restoreTracking().catch(() => {});
    scheduleSync();
  }
});

// Also restore on a native BLE relaunch where no React screen is mounted.
if (!env.demo) void restoreTracking().catch(() => {});
