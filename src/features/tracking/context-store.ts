import { telemetryDb } from '@/core/telemetry/store';
import { trackingSchema, type TrackingContext } from './model';
export const trackingStore = {
  async read() {
    const row = await (
      await telemetryDb()
    ).getFirstAsync<{ payload: string }>("SELECT payload FROM tracking_context WHERE key='active'");
    return row ? trackingSchema.parse(JSON.parse(row.payload)) : null;
  },
  async write(context: TrackingContext | null) {
    const db = await telemetryDb();
    if (context)
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_context(key,payload) VALUES('active',?)",
        JSON.stringify(context),
      );
    else await db.runAsync("DELETE FROM tracking_context WHERE key='active'");
  },
};
