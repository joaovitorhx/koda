import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Packet } from '@/features/operations/model';
import type { SensorSample } from '@/features/sensors/model';
import type { TrackingContext } from '@/features/tracking/model';

const m = vi.hoisted(() => ({
  session: null as string | null,
  context: null as TrackingContext | null,
  sample: undefined as ((value: SensorSample) => void) | undefined,
  task: undefined as ((event: any) => Promise<void>) | undefined,
  started: false,
  packets: new Map<string, Packet>(),
  permission: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  disconnect: vi.fn(),
  reconnect: vi.fn(),
  put: vi.fn(),
  write: vi.fn(),
  request: vi.fn(),
  connect: vi.fn(),
}));
vi.mock('react-native', () => ({
  AppState: { currentState: 'background', addEventListener: () => ({ remove() {} }) },
  Platform: { OS: 'android' },
}));
vi.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  ActivityType: { AutomotiveNavigation: 1 },
  getBackgroundPermissionsAsync: m.permission,
  hasStartedLocationUpdatesAsync: async () => m.started,
  startLocationUpdatesAsync: m.start,
  stopLocationUpdatesAsync: m.stop,
}));
vi.mock('expo-task-manager', () => ({
  isTaskDefined: () => false,
  isAvailableAsync: async () => true,
  defineTask: (_: string, task: typeof m.task) => {
    m.task = task;
  },
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock('@/core/config/env', () => ({
  env: { demo: false, telemetryPath: '/telemetria/lote', refreshPath: '/users/refresh' },
}));
vi.mock('@/core/storage/session-storage', () => ({
  sessionStorage: {
    read: async () => m.session,
    write: async (value: string) => {
      m.session = value;
    },
    clear: async () => {
      m.session = null;
    },
  },
}));
vi.mock('@/features/tracking/context-store', () => ({
  trackingStore: { read: async () => m.context, write: m.write },
}));
vi.mock('@/core/api/client', async (original) => ({
  ...(await original<typeof import('@/core/api/client')>()),
  request: m.request,
}));
vi.mock('@/features/sensors/adapter', () => ({
  createSensorAdapter: async () => ({
    connect: m.connect,
    disconnect: m.disconnect,
    reconnect: m.reconnect,
    subscribe: async (callback: typeof m.sample) => {
      m.sample = callback;
      return () => {
        m.sample = undefined;
      };
    },
  }),
}));
vi.mock('@/core/telemetry/store', () => ({
  queueStore: {
    put: m.put,
    pending: async (driver: string, trip?: string) =>
      [...m.packets.values()].filter((p) => p.driverId === driver && (!trip || p.tripId === trip)),
    acknowledge: async (_: string, ids: string[]) => {
      ids.forEach((id) => m.packets.delete(id));
    },
    archived: async () => [],
    archive: async () => {},
  },
}));
const context: TrackingContext = {
  driverId: '1',
  tripId: '1042',
  sensor: { id: 'ble-1', name: 'Sensor', rssi: -60 },
  minTemperature: 2,
  maxTemperature: 8,
};
const sample = () => ({ temperature: 4.8, timestamp: new Date().toISOString() });
const session = () => ({
  accessToken: `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.x`,
  expiresAt: Date.now() + 3600000,
  user: { id: 1, email: 'driver@koda.test', name: 'Driver', role: 'driver', is_active: true },
});
let runtime: typeof import('@/features/tracking/runtime');
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
beforeEach(async () => {
  vi.resetModules();
  m.session = JSON.stringify(session());
  m.context = null;
  m.started = false;
  m.sample = undefined;
  m.packets.clear();
  m.permission.mockResolvedValue({ granted: true });
  m.start.mockImplementation(async () => {
    m.started = true;
  });
  m.stop.mockImplementation(async () => {
    m.started = false;
  });
  m.write.mockImplementation(async (value: TrackingContext | null) => {
    m.context = value;
  });
  m.put.mockImplementation(async (packet: Packet) => {
    m.packets.set(packet.id, packet);
  });
  m.connect.mockImplementation(async (_: string, __: unknown, ready: () => void) => ready());
  m.request.mockRejectedValue(new Error('offline'));
  runtime = await import('@/features/tracking/runtime');
  await tick();
});
afterEach(async () => {
  await runtime.stopTracking().catch(() => {});
  await tick();
});
describe('native trip collector independent of screens', () => {
  it('persists sensor readings while the app is backgrounded and offline', async () => {
    await runtime.startTracking(context);
    m.sample!(sample());
    await runtime.flushCapturedReadings();
    await tick();
    expect([...m.packets.values()]).toMatchObject([
      { driverId: '1', tripId: '1042', temperature: 4.8 },
    ]);
    expect(m.start).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        foregroundService: expect.objectContaining({ killServiceOnDestroy: false }),
      }),
    );
    expect(m.context).toEqual(context);
  });
  it('keeps samples captured before stop and rejects later callbacks', async () => {
    await runtime.startTracking(context);
    const callback = m.sample!;
    callback(sample());
    const stopping = runtime.stopTracking();
    callback(sample());
    await stopping;
    await runtime.flushCapturedReadings();
    expect(m.packets.size).toBe(1);
    expect(m.context).toBeNull();
    expect(m.started).toBe(false);
    expect(m.disconnect).toHaveBeenCalled();
  });
  it('retries failed disk writes instead of silently completing a delivery', async () => {
    await runtime.startTracking(context);
    m.put.mockRejectedValue(new Error('disk full'));
    m.sample!(sample());
    await expect(runtime.flushCapturedReadings()).rejects.toThrow('disk full');
    await tick();
    m.put.mockImplementation(async (packet: Packet) => {
      m.packets.set(packet.id, packet);
    });
    await runtime.flushCapturedReadings();
    expect(m.packets.size).toBe(1);
  });
  it('uses native location wakes to reconnect and attaches a fresh position', async () => {
    await runtime.startTracking(context);
    await m.task!({
      data: {
        locations: [{ timestamp: Date.now(), coords: { latitude: -22.9, longitude: -47.1 } }],
      },
    });
    m.sample!(sample());
    await runtime.flushCapturedReadings();
    await tick();
    expect(m.reconnect).toHaveBeenCalled();
    expect([...m.packets.values()][0]).toMatchObject({ latitude: -22.9, longitude: -47.1 });
  });
  it('stops a centrally completed trip even when another batch fails', async () => {
    const { ApiError } = await import('@/core/api/client');
    m.request.mockImplementation(async (path: string) => {
      if (path === '/telemetria/lote')
        throw new ApiError('A viagem anterior não está disponível', 403);
      return { status: 'completed' };
    });
    await runtime.startTracking(context);
    m.sample!(sample());
    await runtime.flushCapturedReadings();
    await tick();
    expect(m.context).toBeNull();
    expect(m.started).toBe(false);
    expect(m.packets.size).toBe(1);
  });
  it('cleans up GPS and BLE even if clearing SQLite fails', async () => {
    await runtime.startTracking(context);
    m.write.mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(runtime.stopTracking()).rejects.toThrow('disk unavailable');
    expect(m.stop).toHaveBeenCalled();
    expect(m.disconnect).toHaveBeenCalled();
  });
  it('does not restore a trip into a different account', async () => {
    m.context = { ...context, driverId: '2' };
    expect(await runtime.restoreTracking('1')).toBeNull();
    expect(m.connect).not.toHaveBeenCalled();
    expect(m.context).toBeNull();
  });
  it('requires background permission before starting collection', async () => {
    m.permission.mockResolvedValueOnce({ granted: false });
    await expect(runtime.startTracking(context)).rejects.toThrow('Sempre');
    expect(m.context).toBeNull();
    expect(m.start).not.toHaveBeenCalled();
  });
  it('does not disconnect a prepared sensor when no trip is active', async () => {
    await runtime.stopTracking(true);
    expect(m.disconnect).not.toHaveBeenCalled();
  });
  it('cancels a queued start when logout occurs before permissions resolve', async () => {
    let resolve!: (permission: { granted: boolean }) => void;
    m.permission.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const starting = runtime.startTracking(context);
    await tick();
    const stopping = runtime.stopTracking();
    resolve({ granted: true });
    await starting;
    await stopping;
    expect(m.start).not.toHaveBeenCalled();
    expect(m.context).toBeNull();
  });
});

it('does not restore stale persisted context while shutdown is clearing storage', async () => {
  await runtime.startTracking(context);
  let release!: () => void;
  m.write.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = () => {
          m.context = null;
          resolve();
        };
      }),
  );
  const stopping = runtime.stopTracking();
  await tick();
  expect(m.context).not.toBeNull();
  expect(await runtime.restoreTracking()).toBeNull();
  release();
  await stopping;
  expect(m.connect).toHaveBeenCalledOnce();
  expect(m.context).toBeNull();
});
