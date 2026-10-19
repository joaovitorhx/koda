import { z } from 'zod';
export const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type Coordinate = z.infer<typeof coordinateSchema>;
export const readingSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  temperature: z.number().min(-100).max(100),
  timestamp: z.iso.datetime(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
});
export type Reading = z.infer<typeof readingSchema>;
export type Packet = Reading & { driverId: string };
export const warehouseSchema = z.object({
  name: z.string(),
  address: z.string(),
  distanceKm: z.number().nullable(),
  minutes: z.number().nullable(),
  capacityKg: z.number().nullable(),
  responsible: z.string().nullable(),
  phone: z.string(),
  coordinate: coordinateSchema,
  route: z.array(coordinateSchema),
});
export type Warehouse = z.infer<typeof warehouseSchema>;
export const thermalAlertSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  openedAt: z.iso.datetime(),
  initialTemperature: z.number(),
  peak: z.number(),
  resolvedAt: z.iso.datetime().nullable(),
  source: z.enum(['local', 'server', 'demo']),
  warehouse: warehouseSchema.nullable(),
  minTemperature: z.number().optional(),
  maxTemperature: z.number().optional(),
  status: z.enum(['aberto', 'resolvido', 'cancelado']).optional(),
});
export type ThermalAlert = z.infer<typeof thermalAlertSchema>;
export const summarySchema = z.object({
  tripId: z.string(),
  completedAt: z.iso.datetime(),
  startedAt: z.iso.datetime(),
  readingsSent: z.number().int().nonnegative(),
  alertCount: z.number().int().nonnegative(),
  timeInRange: z.number().min(0).max(100).nullable(),
  readings: z.array(readingSchema),
  events: z.array(
    z.object({
      timestamp: z.iso.datetime(),
      title: z.string(),
      tone: z.enum(['info', 'success', 'danger']),
    }),
  ),
});
export type TripReport = z.infer<typeof summarySchema>;
export function thermalState(
  value: number | null | undefined,
  min: number | null,
  max: number | null,
): 'normal' | 'high' | 'low' | 'unknown' {
  return value == null || min == null || max == null || !Number.isFinite(value)
    ? 'unknown'
    : value > max
      ? 'high'
      : value < min
        ? 'low'
        : 'normal';
}
export function durationLabel(start: string, end = new Date().toISOString()) {
  const minutes = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60000));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}min`;
}
export function mergeReadings(...groups: Reading[][]): Reading[] {
  const map = new Map<string, Reading>();
  groups.flat().forEach((reading) => map.set(reading.id, reading));
  return [...map.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

// Time weighted over the observed period. Each reading holds until the next sample.
export function timeInRangePercent(
  readings: Reading[],
  min: number | null,
  max: number | null,
  end: string,
) {
  const sorted = mergeReadings(readings);
  let total = 0;
  let normal = 0;
  sorted.forEach((reading, index) => {
    const duration = Math.max(
      0,
      Date.parse(sorted[index + 1]?.timestamp ?? end) - Date.parse(reading.timestamp),
    );
    total += duration;
    if (thermalState(reading.temperature, min, max) === 'normal') normal += duration;
  });
  return total
    ? (normal / total) * 100
    : sorted.length && thermalState(sorted[0].temperature, min, max) === 'normal'
      ? 100
      : 0;
}
