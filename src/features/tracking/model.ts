import { z } from 'zod';
import type { Packet } from '@/features/operations/model';
export const trackingSchema = z.object({
  driverId: z.string(),
  tripId: z.string(),
  sensor: z.object({ id: z.string(), name: z.string(), rssi: z.number().nullable() }).nullable(),
  minTemperature: z.number().nullable(),
  maxTemperature: z.number().nullable(),
});
export type TrackingContext = z.infer<typeof trackingSchema>;
export type TrackingEvent =
  | {
      driverId: string;
      kind: 'state';
      connected: boolean;
      sensor: TrackingContext['sensor'];
      error?: string;
    }
  | { driverId: string; kind: 'reading'; packet: Packet }
  | { driverId: string; kind: 'error'; message: string };
