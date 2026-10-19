import { describe, expect, it, vi } from 'vitest';
import { Base64 } from 'js-base64';
import { TelemetryQueue, type QueueStore } from '@/core/telemetry/queue';
import { decodeSample } from '@/features/sensors/model';
import { thermalState, timeInRangePercent, type Packet } from '@/features/operations/model';
const packet = (id: string, driverId = 'driver-a'): Packet => ({
  id,
  driverId,
  tripId: '1042',
  temperature: 4.8,
  timestamp: new Date().toISOString(),
  latitude: null,
  longitude: null,
});
function memoryStore(): QueueStore {
  const data = new Map<string, Packet>();
  const archived = new Map<string, Packet & { reason: string }>();
  return {
    put: async (p) => {
      data.set(p.id, p);
    },
    pending: async (driverId, tripId) =>
      [...data.values()].filter((p) => p.driverId === driverId && (!tripId || p.tripId === tripId)),
    archived: async (driverId) => [...archived.values()].filter((p) => p.driverId === driverId),
    archive: async (driverId, rejected) => {
      for (const r of rejected) {
        const packet = data.get(r.id);
        if (packet?.driverId === driverId) {
          archived.set(r.id, { ...packet, reason: r.reason });
          data.delete(r.id);
        }
      }
    },
    acknowledge: async (driverId, ids) => {
      ids.forEach((id) => {
        if (data.get(id)?.driverId === driverId) data.delete(id);
      });
    },
  };
}
describe('offline telemetry queue', () => {
  it('retains unacknowledged readings and retries using the same IDs', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce(['a', 'foreign'])
      .mockImplementation(async (packets: Packet[]) => packets.map((p) => p.id));
    const queue = new TelemetryQueue(memoryStore(), 'driver-a', upload);
    await queue.add(packet('a'));
    await queue.add(packet('b'));
    await expect(queue.flush()).rejects.toThrow('aguardam confirmação');
    expect((await queue.pending()).map((p) => p.id)).toEqual(['b']);
    await queue.flush();
    expect(await queue.pending()).toEqual([]);
    expect(upload.mock.calls[1][0][0].id).toBe('b');
  });
  it('keeps every packet when network fails or server confirms none', async () => {
    const upload = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
    const queue = new TelemetryQueue(memoryStore(), 'driver-a', upload);
    await queue.add(packet('a'));
    await expect(queue.flush()).rejects.toThrow('offline');
    await expect(queue.flush()).rejects.toThrow('não confirmou');
    expect(await queue.pending()).toHaveLength(1);
  });
  it('isolates accounts and rejects a packet from another driver', async () => {
    const store = memoryStore();
    const queue = new TelemetryQueue(store, 'driver-a', async (p) => p.map((r) => r.id));
    await store.put(packet('other', 'driver-b'));
    await queue.add(packet('mine'));
    expect(() => queue.add(packet('bad', 'driver-b'))).toThrow('Motorista incompatível');
    await queue.flush();
    expect((await store.pending('driver-b')).map((p) => p.id)).toEqual(['other']);
  });
  it('coalesces concurrent sync requests and limits uploads to 100 packets', async () => {
    const upload = vi.fn(async (p: Packet[]) => p.map((r) => r.id));
    const queue = new TelemetryQueue(memoryStore(), 'driver-a', upload);
    for (let i = 0; i < 205; i++) await queue.add(packet(String(i)));
    const first = queue.flush();
    expect(queue.flush()).toBe(first);
    expect(await first).toBe(205);
    expect(upload.mock.calls.map((c) => c[0].length)).toEqual([100, 100, 5]);
  });
});
describe('sensor and thermal data', () => {
  it('decodes valid BLE samples and rejects invalid, stale or implausible readings', () => {
    const encode = (temperature: number, timestamp = new Date().toISOString()) =>
      Base64.encode(JSON.stringify({ temperature, timestamp }));
    expect(decodeSample(encode(4.8)).temperature).toBe(4.8);
    expect(() => decodeSample('garbage')).toThrow();
    expect(() => decodeSample(encode(999))).toThrow();
    expect(() => decodeSample(encode(4.8, '2020-01-01T00:00:00Z'))).toThrow('Horário');
    expect(() => decodeSample(encode(4.8, new Date(Date.now() + 120000).toISOString()))).toThrow(
      'Horário',
    );
  });
  it('treats missing temperature as unknown and includes the allowed limits', () => {
    expect(thermalState(undefined, 2, 8)).toBe('unknown');
    expect(thermalState(2, 2, 8)).toBe('normal');
    expect(thermalState(8, 2, 8)).toBe('normal');
    expect(thermalState(9.6, 2, 8)).toBe('high');
    expect(thermalState(1, 2, 8)).toBe('low');
  });
  it('weights compliance by elapsed time rather than number of readings', () => {
    const a = { ...packet('a'), timestamp: '2026-09-21T10:00:00Z' };
    const b = { ...packet('b'), temperature: 9.6, timestamp: '2026-09-21T10:09:00Z' };
    expect(timeInRangePercent([b, a], 2, 8, '2026-09-21T10:10:00Z')).toBe(90);
    expect(timeInRangePercent([], 2, 8, '2026-09-21T10:10:00Z')).toBe(0);
  });
});

it('reads the ESP32-DHT11 protocol used by the existing Koda prototype', async () => {
  expect(decodeSample(Base64.encode('T: 4.8 C H: 60 %')).temperature).toBe(4.8);
  expect(decodeSample(Base64.encode('T: -18.5 C H: 99 %')).temperature).toBe(-18.5);
  expect(() => decodeSample(Base64.encode('T: 4.8 C H: 101 %'))).toThrow();
  const { matchesSensor } = await import('@/features/sensors/model');
  expect(matchesSensor({ id: 'ble1', name: 'ESP32-DHT11' }, { name: 'ESP32-DHT11', id: '' })).toBe(
    true,
  );
  expect(
    matchesSensor({ id: 'ble2', name: 'ESP32-DHT11' }, { name: 'ESP32-DHT11', id: 'ble1' }),
  ).toBe(false);
});

it('archives out-of-period packets only after server acknowledgement and continues other trips', async () => {
  const store = memoryStore();
  const upload = vi.fn(async (packets: Packet[]) =>
    packets[0].tripId === 'closed'
      ? { acceptedIds: [], rejected: packets.map((p) => ({ id: p.id, reason: 'outside_trip' })) }
      : { acceptedIds: packets.map((p) => p.id) },
  );
  const queue = new TelemetryQueue(store, 'driver-a', upload);
  await queue.add({ ...packet('old'), tripId: 'closed' });
  await queue.add(packet('current'));
  expect(await queue.flush()).toBe(1);
  expect(await queue.pending()).toEqual([]);
  expect(await queue.archived()).toMatchObject([
    { id: 'old', temperature: 4.8, reason: 'outside_trip' },
  ]);
});
it('does not let one failing trip starve another and preserves the failed packet', async () => {
  const queue = new TelemetryQueue(memoryStore(), 'driver-a', async (packets) => {
    if (packets[0].tripId === 'closed') throw new Error('conflict');
    return packets.map((p) => p.id);
  });
  await queue.add({ ...packet('old'), tripId: 'closed' });
  await queue.add(packet('current'));
  await expect(queue.flush()).rejects.toThrow('conflict');
  expect((await queue.pending()).map((p) => p.id)).toEqual(['old']);
});
it('retains a rejected packet when the local archive cannot be written', async () => {
  const store = memoryStore();
  store.archive = async () => {
    throw new Error('disk full');
  };
  const queue = new TelemetryQueue(store, 'driver-a', async () => ({
    acceptedIds: [],
    rejected: [{ id: 'old', reason: 'outside_trip' }],
  }));
  await queue.add(packet('old'));
  await expect(queue.flush()).rejects.toThrow('disk full');
  expect(await queue.pending()).toHaveLength(1);
});
