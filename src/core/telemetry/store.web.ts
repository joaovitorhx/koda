import type { ArchivedReading, QueueStore } from './queue';
import type { Packet } from '@/features/operations/model';
import { storageScope } from '@/core/config/storage-scope';
const key = `koda.${storageScope}.telemetry`;
type Data = { pending: Packet[]; archived: ArchivedReading[] };
const read = (): Data => {
  const data = JSON.parse(localStorage.getItem(key) ?? '[]');
  return Array.isArray(data) ? { pending: data, archived: [] } : data;
};
const write = (data: Data) => localStorage.setItem(key, JSON.stringify(data));
export const queueStore: QueueStore = {
  async put(packet) {
    const data = read();
    if (!data.pending.some((p) => p.id === packet.id)) {
      data.pending.push(packet);
      write(data);
    }
  },
  async pending(driverId, tripId) {
    return read().pending.filter(
      (p) => p.driverId === driverId && (!tripId || p.tripId === tripId),
    );
  },
  async acknowledge(driverId, ids) {
    const data = read();
    data.pending = data.pending.filter((p) => p.driverId !== driverId || !ids.includes(p.id));
    write(data);
  },
  async archive(driverId, rejected) {
    const data = read();
    const reasons = new Map(rejected.map((r) => [r.id, r.reason]));
    for (const p of data.pending)
      if (p.driverId === driverId && reasons.has(p.id) && !data.archived.some((a) => a.id === p.id))
        data.archived.push({ ...p, reason: reasons.get(p.id)! });
    data.pending = data.pending.filter((p) => p.driverId !== driverId || !reasons.has(p.id));
    write(data);
  },
  async archived(driverId) {
    return read().archived.filter((p) => p.driverId === driverId);
  },
};
