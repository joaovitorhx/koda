import { z } from 'zod';

export const tripSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  status: z.enum(['pending', 'in_transit', 'at_warehouse', 'completed', 'cancelled']),
  client: z.string(),
  address: z.string(),
  plate: z.string(),
  cargo: z.string(),
  minTemperature: z.number().nullable(),
  maxTemperature: z.number().nullable(),
  currentTemperature: z.number().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  startedAt: z.string().optional(),
  departureAt: z.string().optional(),
  weightKg: z.number().optional(),
  vehicleModel: z.string().optional(),
  vehicleCapacityKg: z.number().optional(),
  sensorId: z.string().optional(),
  cargoId: z.number().nullable().optional(),
  logisticsCenter: z.string().optional(),
  centralPhone: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type Trip = z.infer<typeof tripSchema>;
export type TripFilter = 'all' | 'pending' | 'in_transit' | 'at_warehouse' | 'completed';
export const statusLabels: Record<Trip['status'], string> = {
  pending: 'PENDENTE',
  in_transit: 'EM TRÂNSITO',
  at_warehouse: 'NO ARMAZÉM',
  completed: 'CONCLUÍDA',
  cancelled: 'CANCELADA',
};
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function filterTrips(trips: Trip[], filter: TripFilter, search: string) {
  const term = normalize(search.trim());
  return trips.filter(
    (trip) =>
      (filter === 'completed' || trip.status !== 'completed') &&
      trip.status !== 'cancelled' &&
      (filter === 'all' || trip.status === filter) &&
      normalize(`${trip.client} ${trip.plate} ${trip.cargo}`).includes(term),
  );
}
export function tripSummary(trips: Trip[], today = new Date()) {
  return {
    pending: trips.filter((trip) => trip.status === 'pending').length,
    completedToday: trips.filter(
      (trip) =>
        trip.status === 'completed' &&
        trip.completedAt &&
        new Date(trip.completedAt).toDateString() === today.toDateString(),
    ).length,
  };
}
export const temperature = (value: number | null) =>
  value == null ? '—' : `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}`;
