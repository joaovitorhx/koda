import { demoTrips, demoUpdateTrip } from './demo';
import type { Reading, ThermalAlert, TripReport, Warehouse } from '@/features/operations/model';
import { timeInRangePercent } from '@/features/operations/model';
import type { Sensor } from '@/features/sensors/model';
export const demoSensors: Sensor[] = [
  { id: 'A4:C1:38:9E:2B:7D', name: 'KODA-IOT-3F2A', rssi: -62 },
  { id: 'C8:F0:9E:12:44:01', name: 'KODA-IOT-91BC', rssi: -84 },
  { id: '5E:2B:71:0A:9F:33', name: 'KODA-IOT-7D40', rssi: -91 },
];
export const demoWarehouse: Warehouse = {
  name: 'Armazém Frio Sul',
  address: 'Rua Anhanguera, 455 · Valinhos/SP',
  distanceKm: 4.2,
  minutes: 9,
  capacityKg: 12000,
  responsible: 'Marcos Lima',
  phone: '+5519998724410',
  coordinate: { latitude: -22.9634, longitude: -46.9956 },
  route: [
    { latitude: -22.95, longitude: -46.98 },
    { latitude: -22.95, longitude: -46.9956 },
    { latitude: -22.9634, longitude: -46.9956 },
  ],
};
const histories = new Map<string, Reading[]>();
const alerts: ThermalAlert[] = [];
const reports = new Map<string, TripReport>();
export async function getDemoReadings(id: string) {
  if (!histories.has(id)) {
    const trip = (await demoTrips()).find((item) => item.id === id);
    if (!trip || trip.status === 'pending') return [];
    const center = ((trip.minTemperature ?? 2) + (trip.maxTemperature ?? 8)) / 2;
    histories.set(
      id,
      Array.from({ length: trip.startedAt ? 1 : 36 }, (_, i) => ({
        id: `seed-${id}-${i}`,
        tripId: id,
        temperature: Number((center + Math.sin(i / 4) * 0.7).toFixed(1)),
        timestamp: new Date(
          trip.startedAt ? Date.now() : Date.now() - (35 - i) * 60_000,
        ).toISOString(),
        latitude: -22.95,
        longitude: -46.98,
      })),
    );
  }
  return [...(histories.get(id) ?? [])];
}
export function addDemoReading(reading: Reading) {
  histories.set(reading.tripId, [...(histories.get(reading.tripId) ?? []), reading]);
}
export async function getDemoAlerts() {
  return [...alerts];
}
export function addDemoAlert(alert: ThermalAlert) {
  if (!alerts.some((item) => item.id === alert.id)) alerts.unshift(alert);
}
export function resolveDemoAlerts(tripId: string) {
  alerts.forEach((alert) => {
    if (alert.tripId === tripId && !alert.resolvedAt) alert.resolvedAt = new Date().toISOString();
  });
}
export async function finishDemo(id: string) {
  const trip = (await demoTrips()).find((item) => item.id === id);
  if (!trip || !['in_transit', 'at_warehouse'].includes(trip.status))
    throw new Error('Apenas uma viagem ativa pode ser concluída.');
  const completedAt = new Date().toISOString();
  const readings = await getDemoReadings(id);
  const tripAlerts = alerts.filter((alert) => alert.tripId === id);
  const startedAt = trip.startedAt ?? readings[0]?.timestamp ?? completedAt;
  const report: TripReport = {
    tripId: id,
    completedAt,
    startedAt,
    readingsSent: readings.length,
    alertCount: tripAlerts.length,
    timeInRange: timeInRangePercent(
      readings,
      trip.minTemperature,
      trip.maxTemperature,
      completedAt,
    ),
    readings,
    events: [
      { timestamp: startedAt, title: 'Viagem iniciada · CD Campinas', tone: 'info' },
      ...tripAlerts.map((alert) => ({
        timestamp: alert.openedAt,
        title: `Alerta térmico · pico ${alert.peak.toFixed(1)}°C`,
        tone: 'danger' as const,
      })),
      { timestamp: completedAt, title: 'Entrega confirmada', tone: 'success' },
    ],
  };
  reports.set(id, report);
  await demoUpdateTrip(id, { status: 'completed', completedAt });
  return report;
}
export async function demoReport(id: string) {
  const report = reports.get(id);
  if (!report) throw new Error('O resumo estará disponível após concluir a viagem.');
  return report;
}
