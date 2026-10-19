import { beforeEach, describe, expect, it, vi } from 'vitest';
import { filterTrips, tripSummary, type Trip } from '@/features/trips/model';

const mocks = vi.hoisted(() => ({
  network: vi.fn(),
  location: vi.fn(),
  permission: vi.fn(),
  request: vi.fn(),
}));
vi.mock('@react-native-community/netinfo', () => ({ default: { fetch: mocks.network } }));
vi.mock('expo-location', () => ({
  getCurrentPositionAsync: mocks.location,
  getForegroundPermissionsAsync: mocks.permission,
  Accuracy: { High: 4 },
}));
vi.mock('@/core/api/client', () => ({ request: mocks.request }));
vi.mock('@/core/config/env', () => ({ env: { demo: false, startPath: '/deliveries/:id/start' } }));
import { startTrip } from '@/features/trips/service';

const trip: Trip = {
  id: '1',
  client: 'Frigorífico Vale Verde',
  address: 'Campinas',
  plate: 'RTA-2C41',
  cargo: 'Vacinas',
  minTemperature: 2,
  maxTemperature: 8,
  status: 'pending',
};
describe('trip list', () => {
  it('searches accents, client, plate and cargo and intersects the status', () => {
    expect(filterTrips([trip], 'all', 'frigorifico')).toHaveLength(1);
    expect(filterTrips([trip], 'all', 'rta-2c41')).toHaveLength(1);
    expect(filterTrips([trip], 'pending', 'vacinas')).toHaveLength(1);
    expect(filterTrips([trip], 'in_transit', '')).toHaveLength(0);
  });
  it('excludes completed trips and counts only completions today', () => {
    const completed: Trip = { ...trip, status: 'completed', completedAt: '2026-09-07T12:00:00' };
    const yesterday = { ...completed, completedAt: '2026-09-06T12:00:00' };
    expect(filterTrips([trip, completed], 'all', '')).toEqual([trip]);
    expect(tripSummary([trip, completed, yesterday], new Date('2026-09-07T15:00:00'))).toEqual({
      pending: 1,
      completedToday: 1,
    });
  });
});
describe('starting trips', () => {
  beforeEach(() => {
    mocks.network.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    mocks.permission.mockResolvedValue({ granted: true, android: { accuracy: 'fine' } });
    mocks.location.mockResolvedValue({
      coords: { latitude: -22.9, longitude: -47.1 },
      timestamp: 1000,
    });
    mocks.request.mockResolvedValue(null);
  });
  it.each([
    { isConnected: false },
    { isConnected: true, isInternetReachable: false },
    { isConnected: null },
  ])('blocks offline/unknown networks before collecting GPS', async (network) => {
    mocks.network.mockResolvedValue(network);
    await expect(startTrip('1')).rejects.toThrow('sem internet');
    expect(mocks.location).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('requires precise location even if permission was previously granted', async () => {
    mocks.permission.mockResolvedValue({ granted: true, android: { accuracy: 'coarse' } });
    await expect(startTrip('1')).rejects.toThrow('localização precisa');
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('sends GPS only with the start request and propagates server rejection', async () => {
    await startTrip('1');
    expect(mocks.request).toHaveBeenCalledWith('/deliveries/1/start', {
      method: 'PATCH',
      body: JSON.stringify({
        latitude: -22.9,
        longitude: -47.1,
        timestamp: '1970-01-01T00:00:01.000Z',
      }),
    });
    mocks.request.mockRejectedValue(new Error('Caminhão indisponível'));
    await expect(startTrip('1')).rejects.toThrow('Caminhão indisponível');
  });
});
