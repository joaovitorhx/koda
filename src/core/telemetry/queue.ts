import type { Packet } from '@/features/operations/model';
export type RejectedReading = { id: string; reason: string };
export type ArchivedReading = Packet & { reason: string };
export interface UploadReceipt {
  acceptedIds: string[];
  rejected?: RejectedReading[];
}
export interface QueueStore {
  put(packet: Packet): Promise<void>;
  pending(driverId: string, tripId?: string): Promise<Packet[]>;
  acknowledge(driverId: string, ids: string[]): Promise<void>;
  archive(driverId: string, readings: RejectedReading[]): Promise<void>;
  archived(driverId: string): Promise<ArchivedReading[]>;
}
// Each trip drains independently. A closed/invalid trip cannot starve another.
export class TelemetryQueue {
  private syncing?: Promise<number>;
  constructor(
    private store: QueueStore,
    private driverId: string,
    private upload: (packets: Packet[]) => Promise<UploadReceipt | string[]>,
  ) {}
  add(packet: Packet) {
    if (packet.driverId !== this.driverId) throw new Error('Motorista incompatível com a fila.');
    return this.store.put(packet);
  }
  pending(tripId?: string) {
    return this.store.pending(this.driverId, tripId);
  }
  archived() {
    return this.store.archived(this.driverId);
  }
  flush() {
    if (this.syncing) return this.syncing;
    this.syncing = this.drain().finally(() => {
      this.syncing = undefined;
    });
    return this.syncing;
  }
  private async drain() {
    let sent = 0;
    const errors: unknown[] = [];
    const trips = new Set((await this.pending()).map((packet) => packet.tripId));
    for (const tripId of trips) {
      try {
        for (;;) {
          const packets = (await this.pending(tripId)).slice(0, 100);
          if (!packets.length) break;
          const response = await this.upload(packets);
          const receipt = Array.isArray(response) ? { acceptedIds: response } : response;
          const accepted = new Set(receipt.acceptedIds);
          const ids = packets
            .filter((packet) => accepted.has(packet.id))
            .map((packet) => packet.id);
          const rejected = (receipt.rejected ?? []).filter(
            (r) => !accepted.has(r.id) && packets.some((p) => p.id === r.id),
          );
          // Move to a durable archive before removing from pending. Failed local
          // persistence leaves the original packet available for an idempotent retry.
          if (rejected.length) await this.store.archive(this.driverId, rejected);
          if (ids.length) await this.store.acknowledge(this.driverId, ids);
          sent += ids.length;
          const resolved = new Set([...ids, ...rejected.map((r) => r.id)]);
          if (!resolved.size)
            throw new Error('A central ainda não confirmou as leituras. Tente novamente.');
          if (resolved.size < packets.length)
            throw new Error('Algumas leituras ainda aguardam confirmação da central.');
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw errors[0];
    return sent;
  }
}
