import { z } from 'zod';
import { request } from '@/core/api/client';
import { env } from '@/core/config/env';
import {
  readingSchema,
  summarySchema,
  thermalAlertSchema,
  warehouseSchema,
  type Packet,
} from './model';
const path = (template: string, id: string) => template.replace(':id', encodeURIComponent(id));
export async function readingsFor(id: string) {
  if (env.demo) return (await import('@/dev/operations')).getDemoReadings(id);
  return z.array(readingSchema).parse(await request(path(env.readingsPath, id)));
}
export async function alertsForDriver() {
  if (env.demo) return (await import('@/dev/operations')).getDemoAlerts();
  return z.array(thermalAlertSchema).parse(await request(env.alertsPath));
}
export const receiptSchema = z.object({
  acceptedIds: z.array(z.string()),
  rejected: z.array(z.object({ id: z.string(), reason: z.string() })).default([]),
});
export async function sendTelemetry(packets: Packet[]) {
  if (env.demo) return { acceptedIds: packets.map((packet) => packet.id), rejected: [] };
  const result = await request(env.telemetryPath, {
    method: 'POST',
    body: JSON.stringify({ readings: packets }),
  });
  return receiptSchema.parse(result);
}
export async function finishDelivery(id: string) {
  if (env.demo) return (await import('@/dev/operations')).finishDemo(id);
  // Stable idempotency key prevents duplicate completion when a response is lost.
  return summarySchema.parse(
    await request(path(env.finishPath, id), {
      method: 'POST',
      headers: { 'Idempotency-Key': `finish-${id}` },
    }),
  );
}
export async function reportFor(id: string) {
  if (env.demo) return (await import('@/dev/operations')).demoReport(id);
  return summarySchema.parse(await request(path(env.reportPath, id)));
}

export async function bindTripSensor(id: string, sensorId: string) {
  if (env.demo) return;
  await request(path(env.sensorPath, id), { method: 'PATCH', body: JSON.stringify({ sensorId }) });
}
export async function contingencyFor(id: string) {
  if (env.demo) {
    const alerts = await (await import('@/dev/operations')).getDemoAlerts();
    return alerts.find((a) => a.tripId === id)?.warehouse ?? null;
  }
  return warehouseSchema.nullable().parse(await request(path(env.contingencyPath, id)));
}
