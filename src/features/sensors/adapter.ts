import { AppState } from 'react-native';
import type { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { env } from '@/core/config/env';
import { decodeSample, matchesSensor, type SensorAdapter, type SensorSample } from './model';
import { ReconnectLoop } from './reconnect';
let singleton: Promise<SensorAdapter> | undefined;
export function createSensorAdapter(): Promise<SensorAdapter> {
  return (singleton ??= buildAdapter().catch((error) => {
    singleton = undefined;
    throw error;
  }));
}
async function buildAdapter(): Promise<SensorAdapter> {
  const { BleManager: Manager } = await import('react-native-ble-plx');
  const restored = new Map<string, Device>();
  const manager: BleManager = new Manager({
    restoreStateIdentifier: 'com.kodalogtech.driver.ble',
    restoreStateFunction: (state) => {
      for (const device of state?.connectedPeripherals ?? []) restored.set(device.id, device);
    },
  });
  let device: Device | undefined, desired: string | undefined;
  let generation = 0;
  let disconnectListener: Subscription | undefined, monitor: Subscription | undefined;
  let monitorGeneration = 0;
  let onLost = () => {},
    onReady = () => {};
  const consumers = new Set<{
    sample: (value: SensorSample) => void;
    error: (message: string) => void;
  }>();
  const loop = new ReconnectLoop();
  const stopScan = () => {
    void manager.stopDeviceScan();
  };
  const attachMonitor = () => {
    const monitorEpoch = ++monitorGeneration;
    monitor?.remove();
    monitor = undefined;
    if (!device || !consumers.size) return;
    const target = device;
    monitor = target.monitorCharacteristicForService(
      env.bleServiceUuid,
      env.bleCharacteristicUuid,
      (error, characteristic) => {
        if (monitorEpoch !== monitorGeneration || device !== target || desired !== target.id)
          return;
        if (error) {
          for (const consumer of consumers)
            consumer.error('Leitura interrompida. Reconectando ao sensor.');
          lostConnection(target, generation);
          return;
        }
        if (!characteristic?.value) return;
        try {
          const sample = decodeSample(characteristic.value);
          for (const consumer of consumers) consumer.sample(sample);
        } catch {
          for (const consumer of consumers)
            consumer.error('Uma leitura inválida do sensor foi ignorada.');
        }
      },
    );
  };
  function lostConnection(target: Device, epoch: number) {
    if (epoch !== generation || device !== target || desired !== target.id) return;
    device = undefined;
    monitorGeneration++;
    disconnectListener?.remove();
    monitor?.remove();
    monitor = undefined;
    onLost();
    void loop.start(async (current) => {
      await manager.cancelDeviceConnection(target.id).catch(() => {});
      if (current()) await establish(target.id, epoch);
    });
  }
  const establish = async (id: string, epoch: number) => {
    if (epoch !== generation || desired !== id) return;
    if ((await manager.state()) !== 'PoweredOn')
      throw new Error('Ative o Bluetooth para reconectar o sensor.');
    const previous = restored.get(id);
    restored.delete(id);
    let target =
      previous && (await previous.isConnected())
        ? previous
        : await manager.connectToDevice(id, { timeout: 15000 });
    if (epoch !== generation || desired !== id) {
      await target.cancelConnection().catch(() => {});
      return;
    }
    try {
      target = await target.discoverAllServicesAndCharacteristics();
      const characteristics = await target.characteristicsForService(env.bleServiceUuid);
      if (
        !characteristics.some(
          (c) =>
            c.uuid.toLowerCase() === env.bleCharacteristicUuid.toLowerCase() &&
            (c.isNotifiable || c.isIndicatable),
        )
      )
        throw new Error('Característica de temperatura indisponível.');
      if (epoch !== generation || desired !== id) {
        await target.cancelConnection().catch(() => {});
        return;
      }
      device = target;
      disconnectListener?.remove();
      disconnectListener = manager.onDeviceDisconnected(id, () => lostConnection(target, epoch));
      attachMonitor();
      onReady();
    } catch (error) {
      await target.cancelConnection().catch(() => {});
      throw error;
    }
  };
  const stateListener = manager.onStateChange((state) => {
    if (state === 'PoweredOn') void loop.wake();
  }, false);
  const appListener = AppState.addEventListener('change', (state) => {
    if (state === 'active') void loop.wake();
  });
  const disconnect = async () => {
    const id = desired;
    desired = undefined;
    generation++;
    monitorGeneration++;
    loop.stop();
    disconnectListener?.remove();
    disconnectListener = undefined;
    monitor?.remove();
    monitor = undefined;
    stopScan();
    device = undefined;
    if (id) await manager.cancelDeviceConnection(id).catch(() => {});
  };
  return {
    permissionStatus() {
      return new Promise<boolean>((resolve) => {
        let subscription: Subscription | undefined;
        const finish = (allowed: boolean) => {
          clearTimeout(timer);
          subscription?.remove();
          resolve(allowed);
        };
        const timer = setTimeout(() => finish(false), 30000);
        const handle = (state: string) => {
          if (state === 'PoweredOn' || state === 'PoweredOff') finish(true);
          else if (state === 'Unauthorized' || state === 'Unsupported') finish(false);
        };
        subscription = manager.onStateChange(handle, false);
        void manager
          .state()
          .then(handle)
          .catch(() => finish(false));
      });
    },
    async scan(onDevice, onError) {
      if ((await manager.state()) !== 'PoweredOn')
        throw new Error('Ative o Bluetooth e permita acesso ao sensor.');
      await manager.startDeviceScan(
        AppState.currentState === 'active' ? null : [env.bleServiceUuid],
        { allowDuplicates: false },
        (error, found) => {
          if (error) {
            onError('Não foi possível buscar sensores. Verifique o Bluetooth.');
            stopScan();
            return;
          }
          const name = found?.name ?? found?.localName;
          if (
            found &&
            matchesSensor(
              { id: found.id, name: name ?? null },
              { name: env.bleDeviceName, id: env.bleDeviceId },
            )
          )
            onDevice({ id: found.id, name: name ?? 'Sensor Koda', rssi: found.rssi });
        },
      );
      return stopScan;
    },
    async connect(id, lost, ready) {
      if (desired === id) {
        onLost = lost;
        onReady = ready ?? (() => {});
        if (device && (await device.isConnected())) {
          onReady();
          return;
        }
        await loop.wake();
        if (!device || !(await device.isConnected()))
          throw new Error('Sensor indisponível. Reconexão automática em andamento.');
        return;
      }
      await disconnect();
      desired = id;
      onLost = lost;
      onReady = ready ?? (() => {});
      const epoch = generation;
      try {
        await establish(id, epoch);
      } catch (error) {
        onLost();
        void loop.start(async (current) => {
          if (current()) await establish(id, epoch);
        });
        throw error;
      }
    },
    async subscribe(sample, error) {
      const consumer = { sample, error };
      consumers.add(consumer);
      attachMonitor();
      return () => {
        consumers.delete(consumer);
        if (!consumers.size) {
          monitor?.remove();
          monitor = undefined;
        }
      };
    },
    reconnect: () => loop.wake(),
    disconnect,
    async destroy() {
      await disconnect();
      consumers.clear();
      stateListener.remove();
      appListener.remove();
      await manager.destroy();
      singleton = undefined;
    },
  };
}
