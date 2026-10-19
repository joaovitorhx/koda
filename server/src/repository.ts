import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  HttpError,
  tripRowSchema,
  mapTrip,
  mapReading,
  mapAlert,
  makeReport,
  type TripRow,
} from './contracts';
function dbError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === '42501') throw new HttpError(403, 'Você não tem acesso a esta viagem.');
  if (error.code === 'P0001')
    throw new HttpError(
      409,
      'O estado da viagem ou do veículo não permite esta operação. Atualize a lista.',
    );
  if (error.code === '22023') throw new HttpError(400, 'Os dados enviados não são válidos.');
  if (error.code === 'PGRST202' || error.code === '42703' || error.code === '42P01')
    throw new HttpError(503, 'Aplique as migrações mobile no banco usado pela central.');
  throw new HttpError(503, 'Não foi possível acessar os dados da operação.');
}
export function createRepository(db: SupabaseClient, mapboxToken = '') {
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(name, args);
    dbError(error);
    return data;
  };
  const rows = async (driver: number, trip?: number) =>
    z
      .array(tripRowSchema)
      .parse(await rpc('koda_mobile_trips', { p_driver: driver, p_trip: trip ?? null }));
  const row = async (driver: number, id: number) => {
    const result = (await rows(driver, id))[0];
    if (!result) throw new HttpError(404, 'Viagem não encontrada para este motorista.');
    return result;
  };
  // Keyset pagination avoids Supabase's 1,000-row cap without silently losing history.
  const readings = async (trip: TripRow) => {
    const result: ReturnType<typeof mapReading>[] = [];
    let cursor = 0;
    const cargoId = trip.carga_id_mobile ?? trip.caminhao.id_carga;
    if (!cargoId || !trip.data_saida) return result;
    for (;;) {
      let query = db
        .from('carga_telemetria_auditoria')
        .select('id,client_id_mobile,temperatura,latitude,longitude,created_at')
        .eq('id_carga', cargoId)
        .gte('created_at', trip.data_saida)
        .or(`id_entrega_mobile.eq.${trip.id},id_entrega_mobile.is.null`)
        .gt('id', cursor)
        .order('id')
        .limit(500);
      if (trip.data_entrega) query = query.lte('created_at', trip.data_entrega);
      else if (trip.status === 'cancelada' && trip.updated_at)
        query = query.lte('created_at', trip.updated_at);
      const { data, error } = await query;
      dbError(error);
      if (!data?.length) break;
      result.push(...data.map((r) => mapReading(r, trip.id)));
      cursor = data[data.length - 1].id;
      if (data.length < 500) break;
    }
    return result.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  };
  const alerts = async (driver: number, trip: TripRow) => {
    const data = await rpc('koda_mobile_alerts', { p_driver: driver, p_trip: trip.id });
    return z
      .array(z.unknown())
      .parse(data)
      .map((a) => mapAlert(a, trip));
  };
  const report = async (driver: number, id: number) => {
    const trip = await row(driver, id);
    const [history, events] = await Promise.all([readings(trip), alerts(driver, trip)]);
    return makeReport(trip, history, events);
  };
  const directions = async (
    origin: { latitude: number | null; longitude: number | null } | null,
    destination: { latitude: number; longitude: number },
  ) => {
    if (!mapboxToken || origin?.latitude == null || origin.longitude == null)
      return { route: [], distanceKm: null, minutes: null };
    const coords = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}`);
    url.searchParams.set('access_token', mapboxToken);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      const body = z
        .object({
          routes: z.array(
            z.object({
              distance: z.number(),
              duration: z.number(),
              geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])) }),
            }),
          ),
        })
        .parse(await response.json());
      const r = body.routes[0];
      if (!r) throw new Error();
      return {
        route: r.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
        distanceKm: Math.round(r.distance / 100) / 10,
        minutes: Math.ceil(r.duration / 60),
      };
    } catch {
      return { route: [], distanceKm: null, minutes: null };
    }
  };
  return {
    trips: async (driver: number) => (await rows(driver)).map(mapTrip),
    trip: async (driver: number, id: number) => mapTrip(await row(driver, id)),
    profileCenter: async (driver: number) => {
      const list = await rows(driver);
      const trip = list.find((t) => ['em_transito', 'no_armazem', 'pendente'].includes(t.status));
      return {
        logistics_center: trip?.centro?.nome,
        central_phone: trip?.centro?.telefone ?? undefined,
      };
    },
    start: async (
      driver: number,
      id: number,
      position: { latitude: number; longitude: number; timestamp: string },
      sensor?: string,
    ) =>
      rpc('koda_mobile_start', {
        p_driver: driver,
        p_trip: id,
        p_sensor: sensor ?? null,
        p_position: position,
      }),
    bindSensor: async (driver: number, id: number, sensor: string) =>
      rpc('koda_mobile_sensor', { p_driver: driver, p_trip: id, p_sensor: sensor }),
    telemetry: async (driver: number, packets: unknown[]) =>
      rpc('koda_mobile_telemetry', { p_driver: driver, p_readings: packets }),
    readings: async (driver: number, id: number) => readings(await row(driver, id)),
    alerts: async (driver: number) => {
      const list = await rows(driver);
      const result = [];
      for (const trip of list) result.push(...(await alerts(driver, trip)));
      // A continuous cargo alert can overlap two trips; show it once, on the
      // latest assigned trip (rows are already ordered descending by trip id).
      return [...new Map(result.reverse().map((alert) => [alert.id, alert])).values()].sort(
        (a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt),
      );
    },
    finish: async (driver: number, id: number) => {
      await rpc('koda_mobile_finish', { p_driver: driver, p_trip: id });
      return report(driver, id);
    },
    report,
    contingency: async (driver: number, id: number) => {
      const trip = await row(driver, id);
      if (!trip.id_armazem_parceiro) return null;
      const { data, error } = await db
        .from('armazens_parceiros')
        .select('nome,endereco,telefone,capacidade_kg,latitude,longitude,is_ativo')
        .eq('id', trip.id_armazem_parceiro)
        .single();
      dbError(error);
      if (!data?.is_ativo) return null;
      // Coordinates are validated separately because transforms do not expose number methods.
      const latitude = Number(data.latitude),
        longitude = Number(data.longitude);
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      )
        throw new HttpError(503, 'Coordenadas do armazém inválidas.');
      const coordinate = { latitude, longitude };
      const route = await directions(trip.carga, coordinate);
      return {
        name: String(data.nome),
        address: data.endereco ?? 'Endereço não informado',
        phone: data.telefone ?? '',
        capacityKg: data.capacidade_kg == null ? null : Number(data.capacidade_kg),
        responsible: null,
        coordinate,
        ...route,
      };
    },
  };
}
export type Repository = ReturnType<typeof createRepository>;
