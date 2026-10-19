import { z } from 'zod';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const userSchema = z.object({
  id: z.number().int().positive(),
  email: z.email(),
  name: z.string(),
  role: z.string(),
  is_active: z.boolean(),
  phone: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
});
export type User = z.infer<typeof userSchema>;
export function requireDriver(value: unknown): User {
  const user = userSchema.parse(value);
  if (user.role !== 'driver') throw new HttpError(403, 'Acesso permitido apenas para motoristas.');
  if (!user.is_active)
    throw new HttpError(403, 'Seu acesso está inativo. Entre em contato com a central.');
  return user;
}
const number = z
  .union([z.number(), z.string().min(1)])
  .transform(Number)
  .pipe(z.number().finite());
export const tripRowSchema = z.object({
  id: z.number().int(),
  status: z.enum(['pendente', 'em_transito', 'no_armazem', 'entregue', 'cancelada']),
  data_saida: z.string().nullable(),
  data_entrega: z.string().nullable(),
  data_previsao: z.string().nullable(),
  updated_at: z.string().optional(),
  carga_id_mobile: z.number().nullable(),
  sensor_id_mobile: z.string().nullable(),
  id_armazem_parceiro: z.number().nullable(),
  caminhao: z.object({
    id: z.number(),
    id_carga: z.number().nullable(),
    placa: z.string(),
    modelo: z.string(),
    marca: z.string(),
    ano: z.number(),
    capacidade_kg: number,
    id_usuario: z.number(),
  }),
  carga: z
    .object({
      id: z.number().optional(),
      tipo: z.string().optional(),
      temperatura_minima: number.optional(),
      temperatura_maxima: number.optional(),
      temperatura_atual: number.nullable(),
      latitude: number.nullable(),
      longitude: number.nullable(),
    })
    .nullable(),
  cliente: z.object({
    nome: z.string(),
    endereco: z.string().nullable(),
    latitude: number,
    longitude: number,
  }),
  centro: z.object({ nome: z.string(), telefone: z.string().nullable() }).nullable(),
});
export type TripRow = z.infer<typeof tripRowSchema>;
export const packetSchema = z.object({
  id: z.uuid(),
  driverId: z.string(),
  tripId: z.string().regex(/^\d+$/),
  temperature: z.number().min(-100).max(100),
  timestamp: z.iso.datetime(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
});
export const readingSchema = z.object({
  id: z.union([z.number(), z.string()]),
  client_id_mobile: z.uuid().nullable(),
  temperatura: number,
  latitude: number.nullable(),
  longitude: number.nullable(),
  created_at: z.string(),
});
export const alertRowSchema = z.object({
  id: z.number(),
  id_carga: z.number(),
  status: z.enum(['aberto', 'resolvido', 'cancelado']),
  tipo: z.enum(['alta', 'baixa']),
  limite_minimo: number,
  limite_maximo: number,
  temperatura_inicio: number,
  temperatura_pico: number,
  aberto_at: z.string(),
  resolvido_at: z.string().nullable(),
  updated_at: z.string(),
});
// PostgreSQL TIMESTAMP values in the existing Koda schema are UTC without suffix.
export function iso(value: string) {
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`).toISOString();
}
export function mapTrip(row: TripRow) {
  const statuses = {
    pendente: 'pending',
    em_transito: 'in_transit',
    no_armazem: 'at_warehouse',
    entregue: 'completed',
    cancelada: 'cancelled',
  } as const;
  return {
    id: String(row.id),
    status: statuses[row.status],
    client: row.cliente.nome,
    address: row.cliente.endereco ?? 'Endereço não informado',
    plate: row.caminhao.placa,
    cargo: row.carga?.tipo ?? 'Carga não vinculada',
    minTemperature: row.carga?.temperatura_minima ?? null,
    maxTemperature: row.carga?.temperatura_maxima ?? null,
    currentTemperature: row.carga?.temperatura_atual ?? null,
    cargoId: row.carga_id_mobile ?? row.caminhao.id_carga,
    startedAt: row.data_saida ? iso(row.data_saida) : undefined,
    completedAt: row.data_entrega ? iso(row.data_entrega) : null,
    departureAt: row.data_previsao ? iso(row.data_previsao) : undefined,
    sensorId: row.sensor_id_mobile ?? undefined,
    vehicleModel: `${row.caminhao.marca} ${row.caminhao.modelo} · ${row.caminhao.ano}`,
    vehicleCapacityKg: row.caminhao.capacidade_kg,
    latitude: row.cliente.latitude,
    longitude: row.cliente.longitude,
    logisticsCenter: row.centro?.nome,
    centralPhone: row.centro?.telefone ?? undefined,
  };
}
export function mapReading(value: unknown, tripId: number) {
  const r = readingSchema.parse(value);
  return {
    id: r.client_id_mobile ?? `audit-${r.id}`,
    tripId: String(tripId),
    temperature: r.temperatura,
    latitude: r.latitude,
    longitude: r.longitude,
    timestamp: iso(r.created_at),
  };
}
export type Reading = ReturnType<typeof mapReading>;
export function mapAlert(value: unknown, trip: TripRow) {
  const a = alertRowSchema.parse(value);
  return {
    id: String(a.id),
    tripId: String(trip.id),
    openedAt: iso(a.aberto_at),
    initialTemperature: a.temperatura_inicio,
    peak: a.temperatura_pico,
    resolvedAt: a.status === 'aberto' ? null : iso(a.resolvido_at ?? a.updated_at),
    source: 'server' as const,
    warehouse: null,
    minTemperature: a.limite_minimo,
    maxTemperature: a.limite_maximo,
    status: a.status,
  };
}
export function makeReport(
  trip: TripRow,
  readings: Reading[],
  alerts: ReturnType<typeof mapAlert>[],
) {
  if (trip.status !== 'entregue' || !trip.data_entrega || !trip.data_saida)
    throw new HttpError(409, 'O resumo estará disponível após a entrega.');
  const startedAt = iso(trip.data_saida),
    completedAt = iso(trip.data_entrega);
  const min = trip.carga?.temperatura_minima,
    max = trip.carga?.temperatura_maxima;
  let observed = 0,
    normal = 0;
  readings.forEach((r, i) => {
    const ms = Math.max(
      0,
      Date.parse(readings[i + 1]?.timestamp ?? completedAt) - Date.parse(r.timestamp),
    );
    observed += ms;
    if (min != null && max != null && r.temperature >= min && r.temperature <= max) normal += ms;
  });
  return {
    tripId: String(trip.id),
    completedAt,
    startedAt,
    readingsSent: readings.length,
    alertCount: alerts.length,
    timeInRange: observed && min != null && max != null ? (normal / observed) * 100 : null,
    readings,
    events: [
      {
        timestamp: startedAt,
        title: `Viagem iniciada${trip.centro ? ` · ${trip.centro.nome}` : ''}`,
        tone: 'info',
      },
      ...alerts.flatMap((a) => [
        {
          timestamp: Date.parse(a.openedAt) < Date.parse(startedAt) ? startedAt : a.openedAt,
          title: `${Date.parse(a.openedAt) < Date.parse(startedAt) ? 'Alerta já ativo na saída' : 'Alerta térmico'} · pico ${a.peak.toFixed(1)}°C`,
          tone: 'danger',
        },
        ...(a.resolvedAt && Date.parse(a.resolvedAt) <= Date.parse(completedAt)
          ? [
              {
                timestamp: a.resolvedAt,
                title:
                  a.status === 'cancelado'
                    ? 'Alerta cancelado pela central'
                    : 'Temperatura normalizada',
                tone: 'success',
              },
            ]
          : []),
      ]),
      { timestamp: completedAt, title: 'Entrega confirmada', tone: 'success' },
    ].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)),
  };
}
