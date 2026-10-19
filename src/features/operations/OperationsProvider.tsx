import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, Platform } from 'react-native';
import { usePermissions } from '@/features/permissions/PermissionsProvider';
import {
  startTracking,
  stopTracking,
  restoreTracking,
  subscribeTracking,
  flushCapturedReadings,
} from '@/features/tracking/runtime';
import type { ArchivedReading } from '@/core/telemetry/queue';
import { useNetInfo } from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import { getTrips, startTrip } from '@/features/trips/service';
import { env } from '@/core/config/env';
import { TelemetryQueue } from '@/core/telemetry/queue';
import { queueStore } from '@/core/telemetry/store';
import type { Sensor, SensorAdapter, SensorSample, SensorStatus } from '@/features/sensors/model';
import { createSensorAdapter } from '@/features/sensors/adapter';
import { alertsForDriver, finishDelivery, sendTelemetry, bindTripSensor } from './service';
import { mergeReadings, thermalState, type Packet, type Reading, type ThermalAlert } from './model';

export function useOperationsState() {
  const { session } = useAuth();
  const { ready } = usePermissions();
  const driverId = String(session!.user.id);
  const client = useQueryClient();
  const network = useNetInfo();
  const [simulateOffline, setSimulateOffline] = useState(false);
  const online =
    network.isConnected === true &&
    network.isInternetReachable !== false &&
    !(env.demo && simulateOffline);
  const onlineRef = useRef(online);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);
  const alive = useRef(true);
  const [sensor, setSensor] = useState<Sensor | null>(null);
  const [sensorStatus, setSensorStatus] = useState<SensorStatus>('disconnected');
  const [devices, setDevices] = useState<Sensor[]>([]);
  const [sensorError, setSensorError] = useState<string | null>(null);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [queueCount, setQueueCount] = useState<Record<string, number>>({});
  const [syncing, setSyncing] = useState(false);
  const [archivedReadings, setArchivedReadings] = useState<ArchivedReading[]>([]);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [liveReadings, setLiveReadings] = useState<Record<string, Reading[]>>({});
  const [critical, setCritical] = useState<ThermalAlert | null>(null);
  const [scenario, setScenario] = useState<'normal' | 'critical'>('normal');
  const [busyTrip, setBusyTrip] = useState<string | null>(null);
  const adapter = useRef<SensorAdapter | null>(null);
  const scanStop = useRef<(() => void) | undefined>(undefined);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scanGeneration = useRef(0);
  const ingestChain = useRef(Promise.resolve());
  const failedWrites = useRef(new Map<string, Packet>());
  const closedTrips = useRef(new Set<string>());
  const mutationLock = useRef(false);
  const alertOpen = useRef(new Map<string, ThermalAlert>());
  const trips = useQuery({
    queryKey: ['trips', driverId],
    queryFn: ({ signal }) => getTrips(signal),
    retry: 1,
    refetchInterval: online && !env.demo ? 15000 : false,
  });
  const alerts = useQuery({
    queryKey: ['alerts', driverId],
    queryFn: alertsForDriver,
    refetchInterval: online && !env.demo ? 15000 : false,
  });
  const upload = useCallback(async (packets: Packet[]) => {
    if (!alive.current || !onlineRef.current)
      throw new Error('Sem conexão com a central. As leituras permanecem no aparelho.');
    return sendTelemetry(packets);
  }, []);
  // Constructor stores the callback; refs are only read later by flush().
  // eslint-disable-next-line react-hooks/refs
  const queue = useMemo(() => new TelemetryQueue(queueStore, driverId, upload), [driverId, upload]);
  const refreshQueue = useCallback(async () => {
    const pending = await queue.pending();
    const archived = await queue.archived();
    const counts: Record<string, number> = {};
    pending.forEach((packet) => {
      counts[packet.tripId] = (counts[packet.tripId] ?? 0) + 1;
    });
    if (alive.current) {
      setQueueCount(counts);
      setArchivedReadings(archived);
      if (pending.length)
        setLiveReadings((previous) => {
          const next = { ...previous };
          pending.forEach((packet) => {
            next[packet.tripId] = mergeReadings(next[packet.tripId] ?? [], [packet]);
          });
          return next;
        });
    }
  }, [queue]);
  const sync = useCallback(async () => {
    if (!onlineRef.current)
      throw new Error('Conecte-se à internet para sincronizar com a central.');
    setSyncing(true);
    try {
      for (const packet of failedWrites.current.values()) {
        await queue.add(packet);
        failedWrites.current.delete(packet.id);
      }
      await queue.flush();
      if (alive.current) setTelemetryError(null);
    } finally {
      if (alive.current) {
        setSyncing(false);
        await refreshQueue();
      }
    }
  }, [queue, refreshQueue]);
  useEffect(() => {
    alive.current = true;
    // Queue restoration reads persistent storage asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshQueue().catch(() =>
      setTelemetryError('Não foi possível abrir a fila de leituras.'),
    );
    return () => {
      alive.current = false;
      clearTimeout(scanTimer.current);
      scanStop.current?.();
      // The native runtime owns the adapter while a background trip is active.
      if (env.demo) void adapter.current?.destroy();
    };
  }, [refreshQueue]);
  useEffect(() => {
    if (!online) return;
    const run = () => {
      void sync().catch((error: Error) => {
        if (alive.current) setTelemetryError(error.message);
      });
    };
    run();
    const timer = setInterval(run, 15000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [online, sync]);
  const getAdapter = useCallback(
    async () => adapter.current ?? (adapter.current = await createSensorAdapter()),
    [],
  );
  const scan = useCallback(
    async (empty = false) => {
      const generation = ++scanGeneration.current;
      scanStop.current?.();
      clearTimeout(scanTimer.current);
      setDevices([]);
      setSensorError(null);
      setSensorStatus('scanning');
      try {
        if (env.demo) {
          const { demoSensors } = await import('@/dev/operations');
          if (alive.current && generation === scanGeneration.current)
            setDevices(empty ? [] : demoSensors);
          if (alive.current && generation === scanGeneration.current)
            setSensorStatus(sensor ? 'connected' : 'disconnected');
        } else {
          const native = await getAdapter();
          if (!alive.current || generation !== scanGeneration.current) return;
          scanStop.current = await native.scan(
            (found) => {
              if (alive.current && generation === scanGeneration.current)
                setDevices((previous) =>
                  [...previous.filter((item) => item.id !== found.id), found].sort(
                    (a, b) => (b.rssi ?? -120) - (a.rssi ?? -120),
                  ),
                );
            },
            (message) => {
              if (alive.current) {
                setSensorError(message);
                setSensorStatus(sensor ? 'connected' : 'disconnected');
              }
            },
          );
          scanTimer.current = setTimeout(() => {
            scanStop.current?.();
            if (alive.current) setSensorStatus(sensor ? 'connected' : 'disconnected');
          }, 10000);
        }
      } catch (error) {
        if (alive.current) {
          setSensorError(
            error instanceof Error
              ? error.message
              : 'Busca indisponível. Use um development build.',
          );
          setSensorStatus('disconnected');
        }
      }
    },
    [getAdapter, sensor],
  );
  const connect = useCallback(
    async (device: Sensor, tripId?: string) => {
      scanGeneration.current++;
      scanStop.current?.();
      clearTimeout(scanTimer.current);
      setSensorStatus('connecting');
      setSensorError(null);
      try {
        if (!env.demo && Platform.OS !== 'web') {
          await stopTracking(true);
          if (tripId) await bindTripSensor(tripId, device.id);
        }
        if (!env.demo)
          await (
            await getAdapter()
          ).connect(
            device.id,
            () => {
              if (alive.current) {
                setSensorStatus('disconnected');
                setSensorError('Sensor desconectado. Reconexão automática em andamento.');
              }
            },
            () => {
              if (alive.current) {
                setSensorStatus('connected');
                setSensorError(null);
              }
            },
          );
        if (!env.demo && tripId) {
          await client.invalidateQueries({ queryKey: ['trips'] });
        }
        if (alive.current) {
          setSensor(device);
          setSensorStatus('connected');
        }
      } catch (error) {
        await adapter.current?.disconnect().catch(() => {});
        if (alive.current) {
          setSensor(null);
          setSensorStatus('disconnected');
          setSensorError(error instanceof Error ? error.message : 'Não foi possível conectar.');
        }
      } finally {
        const active = trips.data?.find((t) => ['in_transit', 'at_warehouse'].includes(t.status));
        if (!env.demo && Platform.OS !== 'web' && active) {
          // Re-read the binding after a failed response as the central may have
          // committed it. Never capture from a merely selected local device.
          const latest = await client
            .fetchQuery({ queryKey: ['trips', driverId], queryFn: () => getTrips(), staleTime: 0 })
            .catch(() => null);
          const trip = latest?.find((t) => t.id === active.id);
          if (trip && ['in_transit', 'at_warehouse'].includes(trip.status))
            await startTracking({
              driverId,
              tripId: trip.id,
              sensor: trip.sensorId
                ? {
                    id: trip.sensorId,
                    name: trip.sensorId === device.id ? device.name : 'Sensor da viagem',
                    rssi: null,
                  }
                : null,
              minTemperature: trip.minTemperature,
              maxTemperature: trip.maxTemperature,
            }).catch((e: Error) => setTelemetryError(e.message));
        }
      }
    },
    [getAdapter, client, trips.data, driverId],
  );
  const disconnect = useCallback(async () => {
    scanGeneration.current++;
    scanStop.current?.();
    clearTimeout(scanTimer.current);
    await adapter.current?.disconnect();
    setSensor(null);
    setSensorStatus('disconnected');
  }, []);
  const ingest = useCallback(
    (tripId: string, sample: SensorSample) => {
      const trip = trips.data?.find((item) => item.id === tripId);
      if (
        !trip ||
        !['in_transit', 'at_warehouse'].includes(trip.status) ||
        closedTrips.current.has(tripId)
      )
        return;
      ingestChain.current = ingestChain.current
        .then(async () => {
          if (!alive.current) return;
          let latitude: number | null = null;
          let longitude: number | null = null;
          if (env.demo) {
            latitude = -22.95;
            longitude = -46.98;
          } else {
            try {
              const permission = await Location.getForegroundPermissionsAsync();
              if (permission.granted) {
                const location = await Location.getLastKnownPositionAsync({
                  maxAge: 30000,
                  requiredAccuracy: 100,
                });
                if (location) {
                  latitude = location.coords.latitude;
                  longitude = location.coords.longitude;
                }
              }
            } catch {
              /* Preserve temperature even when a location fix is unavailable. */
            }
          }
          if (!alive.current) return;
          const packet: Packet = {
            id: Crypto.randomUUID(),
            driverId,
            tripId,
            ...sample,
            latitude,
            longitude,
          };
          try {
            await queue.add(packet);
          } catch (error) {
            failedWrites.current.set(packet.id, packet);
            throw new Error(
              'Não foi possível salvar uma leitura. Libere espaço no aparelho e tente sincronizar.',
              { cause: error },
            );
          }
          if (!alive.current) return;
          setLiveReadings((previous) => ({
            ...previous,
            [tripId]: mergeReadings(previous[tripId] ?? [], [packet]).slice(-2000),
          }));
          const state = thermalState(packet.temperature, trip.minTemperature, trip.maxTemperature);
          if (env.demo) {
            const demo = await import('@/dev/operations');
            demo.addDemoReading(packet);
            if (state !== 'normal' && !alertOpen.current.has(tripId)) {
              const alert: ThermalAlert = {
                id: `alert-${packet.id}`,
                tripId,
                openedAt: packet.timestamp,
                initialTemperature: packet.temperature,
                peak: packet.temperature,
                resolvedAt: null,
                source: 'demo',
                warehouse: demo.demoWarehouse,
              };
              alertOpen.current.set(tripId, alert);
              demo.addDemoAlert(alert);
              setCritical(alert);
              void client.invalidateQueries({ queryKey: ['alerts'] });
            } else if (state === 'normal' && alertOpen.current.has(tripId)) {
              alertOpen.current.delete(tripId);
              demo.resolveDemoAlerts(tripId);
              void client.invalidateQueries({ queryKey: ['alerts'] });
            }
          }
          await refreshQueue();
          if (onlineRef.current) await sync();
        })
        .catch((error: Error) => {
          if (alive.current) setTelemetryError(error.message);
        });
      return ingestChain.current;
    },
    [trips.data, driverId, queue, refreshQueue, sync, client],
  );
  useEffect(() => {
    if (!activeTripId || sensorStatus !== 'connected') return;
    const boundTrip = trips.data?.find((item) => item.id === activeTripId);
    if (!env.demo && boundTrip?.sensorId && boundTrip.sensorId !== sensor?.id) return;
    let stop: (() => void) | undefined;
    if (!env.demo) return;
    {
      const trip = trips.data?.find((item) => item.id === activeTripId);
      if (!trip) return;
      const timer = setInterval(() => {
        const value =
          scenario === 'critical'
            ? (trip.maxTemperature ?? 8) + 1.6
            : ((trip.minTemperature ?? 2) + (trip.maxTemperature ?? 8)) / 2 +
              Math.sin(Date.now() / 10000) * 0.3;
        void ingest(activeTripId, {
          temperature: Number(value.toFixed(1)),
          timestamp: new Date().toISOString(),
        });
      }, 15000);
      stop = () => clearInterval(timer);
    }
    return () => {
      stop?.();
    };
  }, [activeTripId, sensorStatus, sensor?.id, scenario, trips.data, ingest, getAdapter]);
  const runningTrip = trips.data?.find((trip) =>
    ['in_transit', 'at_warehouse'].includes(trip.status),
  );
  const runningId = runningTrip?.id;
  const selectedSensorId = runningTrip?.sensorId;
  useEffect(() => {
    if (!ready || env.demo || Platform.OS === 'web') return;
    const unsubscribe = subscribeTracking((event) => {
      if (!alive.current || event.driverId !== driverId) return;
      if (event.kind === 'reading') {
        setLiveReadings((previous) => ({
          ...previous,
          [event.packet.tripId]: mergeReadings(previous[event.packet.tripId] ?? [], [
            event.packet,
          ]).slice(-2000),
        }));
        void refreshQueue().catch(() => {});
      } else if (event.kind === 'state') {
        setSensor(event.sensor);
        setSensorStatus(event.connected ? 'connected' : 'disconnected');
        setSensorError(event.error ?? null);
      } else setTelemetryError(event.message);
    });
    void restoreTracking(driverId)
      .then((saved) => {
        if (saved && alive.current) {
          setActiveTripId(saved.tripId);
          if (saved.sensor) setSensor(saved.sensor);
        }
      })
      .catch((e: Error) => setTelemetryError(e.message));
    return unsubscribe;
  }, [ready, driverId, refreshQueue]);
  useEffect(() => {
    if (!ready || env.demo || Platform.OS === 'web' || !trips.data) return;
    if (!runningTrip) {
      void stopTracking(true).catch((e: Error) => setTelemetryError(e.message));
      return;
    }
    const selected = runningTrip.sensorId
      ? sensor?.id === runningTrip.sensorId
        ? sensor
        : { id: runningTrip.sensorId, name: 'Sensor da viagem', rssi: null }
      : null;
    void startTracking({
      driverId,
      tripId: runningTrip.id,
      sensor: selected,
      minTemperature: runningTrip.minTemperature,
      maxTemperature: runningTrip.maxTemperature,
    })
      .then(() => {
        if (alive.current) setActiveTripId(runningTrip.id);
      })
      .catch((e: Error) => setTelemetryError(e.message));
    // Primitive operation identity prevents reconnecting on each list refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    trips.isSuccess,
    driverId,
    runningId,
    selectedSensorId,
    runningTrip?.minTemperature,
    runningTrip?.maxTemperature,
  ]);
  const seenServerAlerts = useRef(new Set<string>());
  useEffect(() => {
    const unseen = alerts.data?.find(
      (alert) =>
        !alert.resolvedAt && !seenServerAlerts.current.has(alert.id) && alert.source === 'server',
    );
    if (unseen) {
      seenServerAlerts.current.add(unseen.id);
      setCritical(unseen);
    }
  }, [alerts.data]);
  const start = useCallback(
    async (id: string) => {
      if (!onlineRef.current) throw new Error('Sem conexão com a central');
      if (mutationLock.current) throw new Error('Aguarde a operação em andamento.');
      mutationLock.current = true;
      setBusyTrip(id);
      try {
        await startTrip(id, sensor?.id);
        if (env.demo) {
          const demo = await import('@/dev/demo');
          await demo.demoUpdateTrip(id, {
            startedAt: new Date().toISOString(),
            sensorId: sensor?.id,
          });
        }
        await client.invalidateQueries({ queryKey: ['trips'] });
        if (alive.current) {
          setActiveTripId(id);
          setScenario('normal');
        }
      } finally {
        mutationLock.current = false;
        if (alive.current) setBusyTrip(null);
      }
    },
    [client, sensor],
  );
  const finish = useCallback(
    async (id: string) => {
      if (!onlineRef.current)
        throw new Error('Conecte-se à internet para sincronizar e confirmar a entrega.');
      if (mutationLock.current) throw new Error('Aguarde a operação em andamento.');
      mutationLock.current = true;
      setBusyTrip(id);
      closedTrips.current.add(id);
      try {
        if (!env.demo && Platform.OS !== 'web') {
          await stopTracking();
          await flushCapturedReadings();
        }
        await ingestChain.current;
        try {
          await sync();
        } catch (error) {
          // An unrelated trip may need another retry. Only this delivery's
          // unpersisted/pending packets are a reason to block its completion.
          if (
            (await queue.pending(id)).length ||
            [...failedWrites.current.values()].some((p) => p.tripId === id)
          )
            throw error;
        }
        if ((await queue.pending(id)).length)
          throw new Error('Ainda há leituras pendentes. Sincronize antes de concluir.');
        const report = await finishDelivery(id);
        client.setQueryData(['report', driverId, id], report);
        await client.invalidateQueries({ queryKey: ['trips'] });
        if (alive.current) {
          setActiveTripId(null);
          setCritical(null);
          await disconnect().catch(() => {
            setSensor(null);
            setSensorStatus('disconnected');
          });
        }
        return report;
      } catch (error) {
        closedTrips.current.delete(id);
        const trip = trips.data?.find((t) => t.id === id);
        if (!env.demo && Platform.OS !== 'web' && trip)
          void startTracking({
            driverId,
            tripId: id,
            sensor: trip.sensorId
              ? { id: trip.sensorId, name: 'Sensor da viagem', rssi: null }
              : null,
            minTemperature: trip.minTemperature,
            maxTemperature: trip.maxTemperature,
          }).catch(() => {});
        throw error;
      } finally {
        mutationLock.current = false;
        if (alive.current) setBusyTrip(null);
      }
    },
    [client, disconnect, driverId, queue, sync, trips.data],
  );
  const demoScenario = useCallback(
    async (id: string, mode: 'normal' | 'critical' | 'offline') => {
      if (!env.demo) return;
      setSimulateOffline(mode === 'offline');
      onlineRef.current =
        mode !== 'offline' && network.isConnected === true && network.isInternetReachable !== false;
      setScenario(mode === 'critical' ? 'critical' : 'normal');
      const trip = trips.data?.find((item) => item.id === id);
      if (trip)
        await ingest(id, {
          temperature:
            mode === 'critical'
              ? (trip.maxTemperature ?? 8) + 1.6
              : ((trip.maxTemperature ?? 8) + (trip.minTemperature ?? 2)) / 2 - 0.2,
          timestamp: new Date().toISOString(),
        });
    },
    [trips.data, ingest, network.isConnected, network.isInternetReachable],
  );
  return {
    trips,
    alerts,
    online,
    sensor,
    sensorStatus,
    devices,
    sensorError,
    telemetryError,
    queueCount,
    archivedReadings,
    syncing,
    sync,
    scan,
    connect,
    disconnect,
    activeTripId,
    setActiveTripId,
    liveReadings,
    critical,
    setCritical,
    busyTrip,
    start,
    finish,
    demoScenario,
    simulateOffline,
    setSimulateOffline,
  };
}
const Context = createContext<ReturnType<typeof useOperationsState> | null>(null);
export function OperationsProvider({ children }: PropsWithChildren) {
  const value = useOperationsState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useOperations() {
  const value = useContext(Context);
  if (!value) throw new Error('OperationsProvider is required');
  return value;
}
