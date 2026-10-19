import * as SQLite from 'expo-sqlite';
import type { QueueStore } from './queue';
import type { Packet } from '@/features/operations/model';
import { storageScope } from '@/core/config/storage-scope';
let database: Promise<SQLite.SQLiteDatabase> | undefined;
export function telemetryDb() {
  return (database ??= SQLite.openDatabaseAsync(`koda-${storageScope}-telemetry.db`).then(
    async (database) => {
      await database.execAsync(
        'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS pending_telemetry (id TEXT PRIMARY KEY NOT NULL, driver_id TEXT NOT NULL, trip_id TEXT NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS archived_telemetry (id TEXT PRIMARY KEY NOT NULL, driver_id TEXT NOT NULL, payload TEXT NOT NULL, reason TEXT NOT NULL); CREATE TABLE IF NOT EXISTS tracking_context (key TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL);',
      );
      return database;
    },
  ));
}
export const queueStore: QueueStore = {
  async put(packet) {
    await (
      await telemetryDb()
    ).runAsync(
      'INSERT OR IGNORE INTO pending_telemetry (id, driver_id, trip_id, payload) VALUES (?, ?, ?, ?)',
      packet.id,
      packet.driverId,
      packet.tripId,
      JSON.stringify(packet),
    );
  },
  async pending(driverId, tripId) {
    const sql = tripId
      ? 'SELECT payload FROM pending_telemetry WHERE driver_id = ? AND trip_id = ? ORDER BY rowid'
      : 'SELECT payload FROM pending_telemetry WHERE driver_id = ? ORDER BY rowid';
    const rows = await (
      await telemetryDb()
    ).getAllAsync<{ payload: string }>(sql, ...(tripId ? [driverId, tripId] : [driverId]));
    return rows.map((row) => JSON.parse(row.payload) as Packet);
  },
  async archive(driverId, rejected) {
    const database = await telemetryDb();
    await database.withExclusiveTransactionAsync(async (tx) => {
      for (const reading of rejected) {
        await tx.runAsync(
          'INSERT OR IGNORE INTO archived_telemetry (id, driver_id, payload, reason) SELECT id, driver_id, payload, ? FROM pending_telemetry WHERE id = ? AND driver_id = ?',
          reading.reason,
          reading.id,
          driverId,
        );
        await tx.runAsync(
          'DELETE FROM pending_telemetry WHERE id = ? AND driver_id = ?',
          reading.id,
          driverId,
        );
      }
    });
  },
  async archived(driverId) {
    const rows = await (
      await telemetryDb()
    ).getAllAsync<{ payload: string; reason: string }>(
      'SELECT payload, reason FROM archived_telemetry WHERE driver_id = ? ORDER BY rowid DESC',
      driverId,
    );
    return rows.map((row) => ({ ...JSON.parse(row.payload), reason: row.reason }));
  },
  async acknowledge(driverId, ids) {
    if (!ids.length) return;
    await (
      await telemetryDb()
    ).runAsync(
      `DELETE FROM pending_telemetry WHERE driver_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
      driverId,
      ...ids,
    );
  },
};
