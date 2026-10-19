import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tripRowSchema, mapTrip } from '../src/contracts';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await db.exec(
    await readFile(new URL('../migrations/000_reference_schema.sql', import.meta.url), 'utf8'),
  );
  const install = await readFile(new URL('../supabase-setup.sql', import.meta.url), 'utf8');
  await db.exec(install);
  await db.exec(install); // Verify the exact installer is safe to reapply.
  await db.exec(`INSERT INTO users(id,name,email,password,role,is_active) VALUES(1,'João','joao@test.com','hash','driver',true),(2,'Outro','outro@test.com','hash','driver',true),(3,'Operador','operador@test.com','hash','user',true);
    INSERT INTO carga(id,tipo,temperatura_minima,temperatura_maxima,temperatura_atual,latitude,longitude) VALUES(1,'Vacinas',2,8,5,-22.9,-47.1),(2,'Alimentos',1,5,3,-22.9,-47.1);
    INSERT INTO clientes(id,nome,latitude,longitude) VALUES(1,'Cliente',-22.9,-47.1);
    INSERT INTO centro_logistica(id,nome,telefone,latitude,longitude) VALUES(1,'CD Campinas','+5519999999999',-22.9,-47.1);
    INSERT INTO caminhao(id,placa,modelo,marca,ano,capacidade_kg,id_usuario,id_carga,id_centro_logistica) VALUES(1,'RTA-2C41','FH','Volvo',2021,12000,1,1,1),(2,'ABC-1234','FH','Volvo',2021,12000,2,2,1);
    INSERT INTO entregas(id,id_caminhao,id_cliente) VALUES(1042,1,1),(1043,2,1),(1044,1,1);`);
}, 30000);
afterAll(async () => db.close());
async function query<T>(sql: string, args: unknown[] = []) {
  return (await db.query<T>(sql, args)).rows;
}
describe('real PostgreSQL mobile operations', () => {
  it('scopes trips on the server and maps the existing Portuguese schema', async () => {
    const [{ data }] = await query<{ data: unknown[] }>('SELECT koda_mobile_trips(1) AS data');
    expect(data).toHaveLength(2);
    const trip = mapTrip(tripRowSchema.parse(data.find((r: any) => r.id === 1042)));
    expect(trip).toMatchObject({
      id: '1042',
      cargo: 'Vacinas',
      minTemperature: 2,
      maxTemperature: 8,
      plate: 'RTA-2C41',
      logisticsCenter: 'CD Campinas',
    });
    expect(
      (await query<{ data: unknown[] }>('SELECT koda_mobile_trips(3) AS data'))[0].data,
    ).toEqual([]);
  });
  it('rejects another driver and starts trip + vehicle atomically', async () => {
    await expect(query('SELECT koda_mobile_start(2,1042,NULL)')).rejects.toThrow('indisponível');
    await query("SELECT koda_mobile_start(1,1042,'ESP32',$1::jsonb)", [
      JSON.stringify({ latitude: -22.8, longitude: -47.0, timestamp: new Date().toISOString() }),
    ]);
    await query("SELECT koda_mobile_start(1,1042,'ESP32')");
    expect(
      (await query<{ status: string }>('SELECT status FROM caminhao WHERE id=1'))[0].status,
    ).toBe('em_rota');
    expect(
      (
        await query<{ motorista_id_mobile: number }>(
          'SELECT motorista_id_mobile FROM entregas WHERE id=1042',
        )
      )[0].motorista_id_mobile,
    ).toBe(1);
    expect(
      Number(
        (await query<{ latitude: string }>('SELECT latitude FROM carga WHERE id=1'))[0].latitude,
      ),
    ).toBe(-22.8);
    await expect(query('SELECT koda_mobile_start(1,1044,NULL)')).rejects.toThrow();
  });
  it('includes alerts already open when the trip began and excludes earlier resolved events', async () => {
    await db.exec('BEGIN');
    try {
      await db.exec(`INSERT INTO carga_alertas(id_carga,tipo,status,limite_minimo,limite_maximo,temperatura_inicio,temperatura_pico,aberto_at) VALUES(1,'alta','aberto',2,8,9,10,timezone('utc',now())-interval '1 hour');
      INSERT INTO carga_alertas(id_carga,tipo,status,limite_minimo,limite_maximo,temperatura_inicio,temperatura_pico,aberto_at,resolvido_at) VALUES(1,'alta','resolvido',2,8,9,10,timezone('utc',now())-interval '2 hours',timezone('utc',now())-interval '1 hour');`);
      const [{ alerts }] = await query<{ alerts: { status: string }[] }>(
        'SELECT koda_mobile_alerts(1,1042) AS alerts',
      );
      expect(alerts).toHaveLength(1);
      expect(alerts[0].status).toBe('aberto');
      expect(
        (await query<{ alerts: unknown[] }>('SELECT koda_mobile_alerts(2,1042) AS alerts'))[0]
          .alerts,
      ).toEqual([]);
    } finally {
      await db.exec('ROLLBACK');
    }
  });
  it('binds sensors only for the owning driver', async () => {
    await expect(query("SELECT koda_mobile_sensor(2,1042,'bad')")).rejects.toThrow();
    await query("SELECT koda_mobile_sensor(1,1042,'ESP32-DHT11')");
    expect(
      (
        await query<{ sensor_id_mobile: string }>(
          'SELECT sensor_id_mobile FROM entregas WHERE id=1042',
        )
      )[0].sensor_id_mobile,
    ).toBe('ESP32-DHT11');
  });
  it('deduplicates acknowledgements, updates the same web tables and triggers thermal alerts', async () => {
    const first = {
      id: randomUUID(),
      driverId: '1',
      tripId: '1042',
      temperature: 9.6,
      timestamp: new Date().toISOString(),
      latitude: -22.95,
      longitude: -47.05,
    };
    const [{ data }] = await query<{ data: { acceptedIds: string[] } }>(
      'SELECT koda_mobile_telemetry(1,$1::jsonb) AS data',
      [JSON.stringify([first])],
    );
    expect(data.acceptedIds).toEqual([first.id]);
    await query('SELECT koda_mobile_telemetry(1,$1::jsonb)', [JSON.stringify([first])]);
    expect(await query('SELECT * FROM carga_telemetria_auditoria')).toHaveLength(1);
    expect((await query<{ status: string }>('SELECT status FROM carga_alertas'))[0].status).toBe(
      'aberto',
    );
    expect(
      Number(
        (
          await query<{ temperatura_atual: string }>(
            'SELECT temperatura_atual FROM carga WHERE id=1',
          )
        )[0].temperatura_atual,
      ),
    ).toBe(9.6);
    await expect(
      query('SELECT koda_mobile_telemetry(2,$1::jsonb)', [JSON.stringify([first])]),
    ).rejects.toThrow();
    await expect(
      query('SELECT koda_mobile_telemetry(1,$1::jsonb)', [
        JSON.stringify([{ ...first, temperature: 10 }]),
      ]),
    ).rejects.toThrow('Identificador');
    await expect(
      query('SELECT koda_mobile_telemetry(1,$1::jsonb)', [
        JSON.stringify([{ ...first, latitude: 0 }]),
      ]),
    ).rejects.toThrow('Identificador');
    await query('SELECT koda_mobile_telemetry(1,$1::jsonb)', [
      JSON.stringify([
        {
          ...first,
          id: randomUUID(),
          temperature: 4.8,
          timestamp: new Date().toISOString(),
          latitude: null,
          longitude: null,
        },
      ]),
    ]);
    expect((await query<{ status: string }>('SELECT status FROM carga_alertas'))[0].status).toBe(
      'resolvido',
    );
  });
  it('preserves late offline readings without rolling back current temperature or alerts', async () => {
    const packet = {
      id: randomUUID(),
      driverId: '1',
      tripId: '1042',
      temperature: 12.123,
      timestamp: new Date(Date.now() - 10000).toISOString(),
      latitude: -22.95012345,
      longitude: -47.05,
    };
    await query('SELECT koda_mobile_telemetry(1,$1::jsonb)', [JSON.stringify([packet])]);
    await query('SELECT koda_mobile_telemetry(1,$1::jsonb)', [JSON.stringify([packet])]);
    expect(await query("SELECT * FROM carga_alertas WHERE status='aberto'")).toHaveLength(0);
    expect(
      Number(
        (
          await query<{ temperatura_atual: string }>(
            'SELECT temperatura_atual FROM carga WHERE id=1',
          )
        )[0].temperatura_atual,
      ),
    ).toBe(4.8);
    expect(
      await query('SELECT * FROM carga_telemetria_auditoria WHERE client_id_mobile=$1', [
        packet.id,
      ]),
    ).toHaveLength(1);
  });
  it('rolls back the entire invalid batch', async () => {
    const before = (await query('SELECT * FROM carga_telemetria_auditoria')).length;
    const first = {
      id: randomUUID(),
      driverId: '1',
      tripId: '1042',
      temperature: 4.8,
      timestamp: new Date().toISOString(),
      latitude: null,
      longitude: null,
    };
    await expect(
      query('SELECT koda_mobile_telemetry(1,$1::jsonb)', [
        JSON.stringify([first, { ...first, id: randomUUID(), tripId: '1043' }]),
      ]),
    ).rejects.toThrow();
    expect(await query('SELECT * FROM carga_telemetria_auditoria')).toHaveLength(before);
  });
  it('finishes idempotently and reconciles late/off-period readings without changing current cargo', async () => {
    await query('SELECT koda_mobile_finish(1,1042)');
    const [{ data_entrega }] = await query<{ data_entrega: Date }>(
      'SELECT data_entrega FROM entregas WHERE id=1042',
    );
    await query('SELECT koda_mobile_finish(1,1042)');
    expect(
      (await query<{ data_entrega: Date }>('SELECT data_entrega FROM entregas WHERE id=1042'))[0]
        .data_entrega,
    ).toEqual(data_entrega);
    expect(
      (await query<{ status: string }>('SELECT status FROM caminhao WHERE id=1'))[0].status,
    ).toBe('disponivel');
    const outside = {
      id: randomUUID(),
      driverId: '1',
      tripId: '1042',
      temperature: 5,
      timestamp: new Date(Date.now() + 1000).toISOString(),
      latitude: null,
      longitude: null,
    };
    const [{ receipt }] = await query<{
      receipt: { acceptedIds: string[]; rejected: { id: string; reason: string }[] };
    }>('SELECT koda_mobile_telemetry(1,$1::jsonb) AS receipt', [JSON.stringify([outside])]);
    expect(receipt.acceptedIds).toEqual([]);
    expect(receipt.rejected).toEqual([{ id: outside.id, reason: 'outside_trip' }]);
    await query('SELECT koda_mobile_telemetry(1,$1::jsonb)', [JSON.stringify([outside])]);
    expect(
      await query('SELECT * FROM mobile_telemetry_conflicts WHERE client_id=$1', [outside.id]),
    ).toHaveLength(1);
    const [{ stamp }] = await query<{ stamp: string }>(
      `SELECT to_char(data_saida + (data_entrega-data_saida)/2, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS stamp FROM entregas WHERE id=1042`,
    );
    const inside = { ...outside, id: randomUUID(), temperature: 12, timestamp: stamp };
    const [{ late }] = await query<{ late: { acceptedIds: string[] } }>(
      'SELECT koda_mobile_telemetry(1,$1::jsonb) AS late',
      [JSON.stringify([inside])],
    );
    expect(late.acceptedIds).toEqual([inside.id]);
    expect(await query("SELECT * FROM carga_alertas WHERE status='aberto'")).toHaveLength(0);
    expect(
      Number(
        (
          await query<{ temperatura_atual: string }>(
            'SELECT temperatura_atual FROM carga WHERE id=1',
          )
        )[0].temperatura_atual,
      ),
    ).toBe(4.8);
    await db.exec('UPDATE caminhao SET id_usuario=2,id_carga=2 WHERE id=1;');
    const [{ data }] = await query<{ data: any[] }>('SELECT koda_mobile_trips(1,1042) AS data');
    expect(data[0].carga.tipo).toBe('Vacinas');
    expect(data[0].motorista_id_mobile).toBe(1);
  });
  it('denies RPC execution to public/mobile Supabase keys', async () => {
    expect(
      (await query<{ version: number }>('SELECT koda_mobile_schema_version() AS version'))[0]
        .version,
    ).toBe(5);
    expect(
      (
        await query<{ allowed: boolean }>(
          "SELECT has_function_privilege('anon','koda_mobile_schema_version()','EXECUTE') AS allowed",
        )
      )[0].allowed,
    ).toBe(false);
    expect(
      (
        await query<{ allowed: boolean }>(
          "SELECT has_table_privilege('authenticated','mobile_telemetry_conflicts','SELECT') AS allowed",
        )
      )[0].allowed,
    ).toBe(false);
    const grants = await query<{ allowed: boolean }>(
      "SELECT has_function_privilege('anon','koda_mobile_trips(integer,integer)','EXECUTE') AS allowed",
    );
    expect(grants[0].allowed).toBe(false);
    expect(
      (
        await query<{ allowed: boolean }>(
          "SELECT has_function_privilege('authenticated','koda_mobile_telemetry(integer,jsonb)','EXECUTE') AS allowed",
        )
      )[0].allowed,
    ).toBe(false);
  });
});
