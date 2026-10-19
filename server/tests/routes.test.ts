import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/app';
import type { Auth } from '../src/auth';
import type { Repository } from '../src/repository';
const user = {
  id: 7,
  email: 'driver@koda.test',
  name: 'Motorista',
  role: 'driver',
  is_active: true,
};
const auth = {
  profile: vi.fn(async () => user),
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
} as unknown as Auth;
const repo = {
  trips: vi.fn(async () => []),
  telemetry: vi.fn(async () => ({ acceptedIds: [] })),
  finish: vi.fn(async () => ({})),
  profileCenter: vi.fn(async () => ({})),
} as unknown as Repository;
let server: Server;
let base: string;
beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server = createApp(auth, repo, [])
      .listen(0, '127.0.0.1', () => resolve())
      .on('error', reject);
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
describe('mobile authorization boundary', () => {
  it('requires login before reading trips', async () => {
    expect((await fetch(`${base}/api/entregas/motorista`)).status).toBe(401);
    expect(repo.trips).not.toHaveBeenCalled();
  });
  it('uses the authenticated profile ID, ignoring a query-string driver', async () => {
    const r = await fetch(`${base}/api/entregas/motorista?driverId=99`, {
      headers: { Authorization: 'Bearer token' },
    });
    expect(r.status).toBe(200);
    expect(repo.trips).toHaveBeenCalledWith(7);
  });
  it('rejects telemetry from another account', async () => {
    const r = await fetch(`${base}/api/telemetria/lote`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        readings: [
          {
            id: crypto.randomUUID(),
            driverId: '99',
            tripId: '1042',
            temperature: 5,
            timestamp: new Date().toISOString(),
            latitude: null,
            longitude: null,
          },
        ],
      }),
    });
    expect(r.status).toBe(403);
    expect(repo.telemetry).not.toHaveBeenCalled();
  });
  it('rejects malformed routes before invoking writes', async () => {
    const r = await fetch(`${base}/api/entregas/not-an-id/finalizar`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
    });
    expect(r.status).toBe(400);
    expect(repo.finish).not.toHaveBeenCalled();
  });
});
