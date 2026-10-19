import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Base64 } from 'js-base64';
import type { SensorAdapter } from '@/features/sensors/model';
const m = vi.hoisted(() => ({
  connect: vi.fn(),
  cancel: vi.fn(),
  destroyed: vi.fn(),
  lost: undefined as (() => void) | undefined,
  monitor: undefined as ((error: unknown, characteristic?: { value: string }) => void) | undefined,
  managerCount: 0,
}));
vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
}));
vi.mock('@/core/config/env', () => ({
  env: { bleServiceUuid: 'service', bleCharacteristicUuid: 'temperature' },
}));
vi.mock('react-native-ble-plx', () => ({
  BleManager: class {
    constructor() {
      m.managerCount++;
    }
    state = async () => 'PoweredOn';
    onStateChange = () => ({ remove() {} });
    stopDeviceScan = async () => {};
    connectToDevice = m.connect;
    cancelDeviceConnection = m.cancel;
    onDeviceDisconnected = (_: string, callback: () => void) => {
      m.lost = callback;
      return {
        remove() {
          if (m.lost === callback) m.lost = undefined;
        },
      };
    };
    destroy = m.destroyed;
  },
}));
function device(id = 'ble-1') {
  const target = {
    id,
    isConnected: async () => true,
    cancelConnection: m.cancel,
    discoverAllServicesAndCharacteristics: async () => target,
    characteristicsForService: async () => [{ uuid: 'temperature', isNotifiable: true }],
    monitorCharacteristicForService: (_: string, __: string, callback: typeof m.monitor) => {
      m.monitor = callback;
      return {
        remove() {
          if (m.monitor === callback) m.monitor = undefined;
        },
      };
    },
  };
  return target;
}
let adapter: SensorAdapter;
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  m.managerCount = 0;
  m.lost = undefined;
  m.monitor = undefined;
  m.cancel.mockResolvedValue(undefined);
  m.connect.mockImplementation(async (id: string) => device(id));
  adapter = await (await import('@/features/sensors/adapter')).createSensorAdapter();
});
afterEach(async () => {
  await adapter.destroy();
  vi.useRealTimers();
});
it('restores notifications after a dropped native BLE connection', async () => {
  const sample = vi.fn(),
    lost = vi.fn(),
    ready = vi.fn();
  await adapter.connect('ble-1', lost, ready);
  await adapter.subscribe(sample, vi.fn());
  m.monitor!(null, { value: Base64.encode('T:4.8C H:60%') });
  m.lost!();
  await adapter.reconnect!();
  m.monitor!(null, { value: Base64.encode('T:5.2C H:60%') });
  expect(m.connect).toHaveBeenCalledTimes(2);
  expect(ready).toHaveBeenCalledTimes(2);
  expect(lost).toHaveBeenCalledOnce();
  expect(sample).toHaveBeenCalledTimes(2);
});
it('reconnects when the notification stream fails even without a disconnect event', async () => {
  const lost = vi.fn(),
    error = vi.fn();
  await adapter.connect('ble-1', lost);
  await adapter.subscribe(vi.fn(), error);
  m.monitor!(new Error('GATT failure'));
  await adapter.reconnect!();
  expect(error).toHaveBeenCalledOnce();
  expect(lost).toHaveBeenCalledOnce();
  expect(m.connect).toHaveBeenCalledTimes(2);
});
it('cancels retries and ignores callbacks from the previous connection on logout', async () => {
  const sample = vi.fn();
  await adapter.connect('ble-1', vi.fn());
  await adapter.subscribe(sample, vi.fn());
  const previous = m.monitor!;
  m.connect.mockRejectedValue(new Error('out of range'));
  m.lost!();
  await adapter.reconnect!();
  await adapter.disconnect();
  previous(null, { value: Base64.encode('T:9.6C H:60%') });
  const attempts = m.connect.mock.calls.length;
  await vi.advanceTimersByTimeAsync(60000);
  expect(m.connect).toHaveBeenCalledTimes(attempts);
  expect(sample).not.toHaveBeenCalled();
});
it('checks permissions using the same native manager without interrupting collection', async () => {
  await adapter.connect('ble-1', vi.fn());
  const cancelCount = m.cancel.mock.calls.length;
  expect(await adapter.permissionStatus!()).toBe(true);
  expect(await (await import('@/features/sensors/adapter')).createSensorAdapter()).toBe(adapter);
  expect(m.managerCount).toBe(1);
  expect(m.cancel).toHaveBeenCalledTimes(cancelCount);
});
