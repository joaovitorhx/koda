import { z } from 'zod';
import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import { env } from '@/core/config/env';
import { request } from '@/core/api/client';
import { tripSchema } from './model';

export async function getTrips(signal?: AbortSignal) {
  if (env.demo) {
    const { demoTrips } = await import('@/dev/demo');
    return demoTrips();
  }
  const result = z.array(tripSchema).safeParse(await request(env.tripsPath, { signal }));
  if (!result.success)
    throw new Error('Não foi possível ler as viagens. Entre em contato com a central.');
  return result.data;
}

export async function startTrip(id: string, sensorId?: string) {
  const network = await NetInfo.fetch();
  if (network.isConnected !== true || network.isInternetReachable === false) {
    throw new Error(
      'Você está sem internet. Conecte-se para confirmar o início da viagem com a central.',
    );
  }
  if (env.demo) {
    const { demoStartTrip } = await import('@/dev/demo');
    return demoStartTrip(id);
  }
  const permission = await Location.getForegroundPermissionsAsync();
  if (
    !permission.granted ||
    permission.android?.accuracy === 'coarse' ||
    permission.ios?.accuracy === 'reduced'
  ) {
    throw new Error(
      'Ative a localização precisa nas configurações do aparelho antes de iniciar a viagem.',
    );
  }
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  await request(env.startPath.replace(':id', encodeURIComponent(id)), {
    method: 'PATCH',
    body: JSON.stringify({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      timestamp: new Date(position.timestamp).toISOString(),
      ...(sensorId ? { sensorId } : {}),
    }),
  });
}
