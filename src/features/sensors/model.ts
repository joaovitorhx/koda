import { Base64 } from 'js-base64';
import { z } from 'zod';
export interface Sensor {
  id: string;
  name: string;
  rssi: number | null;
}
export type SensorStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected';
export interface SensorSample {
  temperature: number;
  timestamp: string;
}
export interface SensorAdapter {
  permissionStatus?(): Promise<boolean>;
  scan(onDevice: (device: Sensor) => void, onError: (message: string) => void): Promise<() => void>;
  connect(id: string, onDisconnect: () => void, onReconnect?: () => void): Promise<void>;
  reconnect?(): Promise<void>;
  subscribe(
    onSample: (sample: SensorSample) => void,
    onError: (message: string) => void,
  ): Promise<() => void>;
  disconnect(): Promise<void>;
  destroy(): Promise<void>;
}
const sampleSchema = z.object({
  temperature: z.number().min(-100).max(100),
  timestamp: z.iso.datetime(),
});
export function decodeSample(value: string): SensorSample {
  const payload = Base64.decode(value).trim();
  const dht = payload.match(/^T:\s*(-?\d+(?:\.\d+)?)\s*C\s+H:\s*(\d+(?:\.\d+)?)\s*%$/i);
  if (dht) {
    const humidity = Number(dht[2]);
    if (humidity < 0 || humidity > 100) throw new Error('Umidade do sensor inválida.');
    return sampleSchema.parse({ temperature: Number(dht[1]), timestamp: new Date().toISOString() });
  }
  const sample = sampleSchema.parse(JSON.parse(payload));
  if (
    Date.parse(sample.timestamp) > Date.now() + 60_000 ||
    Date.parse(sample.timestamp) < Date.now() - 86_400_000
  )
    throw new Error('Horário do sensor inválido.');
  return sample;
}

export function matchesSensor(
  device: { id: string; name: string | null },
  target: { name: string; id: string },
) {
  if (target.id) return device.id.toLowerCase() === target.id.toLowerCase();
  return (
    !!device.name &&
    (device.name.toLowerCase() === target.name.toLowerCase() || device.name.startsWith('KODA-IOT-'))
  );
}
