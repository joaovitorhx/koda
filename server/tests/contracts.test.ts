import { describe, expect, it } from 'vitest';
import { iso, makeReport, mapAlert, mapReading, mapTrip, tripRowSchema } from '../src/contracts';
const row = tripRowSchema.parse({
  id: 1042,
  status: 'entregue',
  data_saida: '2026-10-05T10:00:00',
  data_entrega: '2026-10-05T10:10:00',
  data_previsao: null,
  carga_id_mobile: 3,
  sensor_id_mobile: null,
  id_armazem_parceiro: null,
  caminhao: {
    id: 1,
    id_carga: 3,
    placa: 'KDA-0001',
    modelo: 'FH',
    marca: 'Volvo',
    ano: 2021,
    capacidade_kg: '12000.00',
    id_usuario: 1,
  },
  carga: {
    id: 3,
    tipo: 'Vacinas',
    temperatura_minima: '2.00',
    temperatura_maxima: '8.00',
    temperatura_atual: null,
    latitude: null,
    longitude: null,
  },
  cliente: { nome: 'Cliente da web', endereco: null, latitude: '-22.9', longitude: '-47.1' },
  centro: null,
});
describe('web database to mobile contracts', () => {
  it('maps Portuguese columns and decimals without inventing unavailable values', () => {
    expect(mapTrip(row)).toMatchObject({
      id: '1042',
      status: 'completed',
      minTemperature: 2,
      maxTemperature: 8,
      currentTemperature: null,
      latitude: -22.9,
      vehicleCapacityKg: 12000,
    });
    expect(mapTrip(row)).not.toHaveProperty('weightKg');
    expect(mapTrip({ ...row, carga: null })).toMatchObject({
      cargo: 'Carga não vinculada',
      minTemperature: null,
      maxTemperature: null,
    });
  });
  it('normalizes UTC database timestamps and preserves audit IDs for deduplication', () => {
    expect(iso('2026-10-05T10:00:00')).toBe('2026-10-05T10:00:00.000Z');
    const r = {
      id: 12,
      client_id_mobile: null,
      temperatura: '4.80',
      latitude: null,
      longitude: null,
      created_at: '2026-10-05T10:00:00',
    };
    expect(mapReading(r, 1042)).toMatchObject({ id: 'audit-12', temperature: 4.8, tripId: '1042' });
    const uuid = 'bb079566-263a-4e2b-8df6-9627820e3b38';
    expect(mapReading({ ...r, client_id_mobile: uuid }, 1042).id).toBe(uuid);
  });
  it('reports the observed duration and leaves missing compliance unknown', () => {
    const first = {
      id: 'a',
      tripId: '1042',
      timestamp: '2026-10-05T10:00:00Z',
      temperature: 4.8,
      latitude: null,
      longitude: null,
    };
    const second = { ...first, id: 'b', timestamp: '2026-10-05T10:09:00Z', temperature: 9.6 };
    expect(makeReport(row, [first, second], [])).toMatchObject({
      timeInRange: 90,
      readingsSent: 2,
      alertCount: 0,
    });
    expect(makeReport(row, [], []).timeInRange).toBeNull();
    expect(() => makeReport({ ...row, status: 'em_transito' }, [], [])).toThrow('após a entrega');
  });
  it('keeps the original alert thresholds and cancellation status from the central', () => {
    expect(
      mapAlert(
        {
          id: 311,
          id_carga: 3,
          status: 'cancelado',
          tipo: 'alta',
          limite_minimo: '1',
          limite_maximo: '7',
          temperatura_inicio: '8.4',
          temperatura_pico: '9.6',
          aberto_at: '2026-10-05T10:01:00',
          resolvido_at: null,
          updated_at: '2026-10-05T10:09:00',
        },
        row,
      ),
    ).toMatchObject({
      status: 'cancelado',
      minTemperature: 1,
      maxTemperature: 7,
      warehouse: null,
      resolvedAt: '2026-10-05T10:09:00.000Z',
    });
  });
  it('keeps pre-existing alerts in the report without placing events outside the trip', () => {
    const alert = {
      id: '311',
      tripId: '1042',
      openedAt: '2026-10-05T09:00:00Z',
      resolvedAt: '2026-10-05T11:00:00Z',
      initialTemperature: 9,
      peak: 10,
      minTemperature: 2,
      maxTemperature: 8,
      source: 'server' as const,
      warehouse: null,
      status: 'resolvido' as const,
    };
    const report = makeReport(row, [], [alert]);
    expect(report.alertCount).toBe(1);
    expect(report.events).toHaveLength(3);
    expect(report.events[1]).toMatchObject({
      timestamp: report.startedAt,
      title: 'Alerta já ativo na saída · pico 10.0°C',
    });
    expect(report.events.at(-1)?.timestamp).toBe(report.completedAt);
  });
});
