import { Linking } from 'react-native';
import { env } from '@/core/config/env';
import type { Coordinate } from './model';
export function mapUrl(coordinate: Coordinate, provider: 'google' | 'waze') {
  const destination = `${coordinate.latitude},${coordinate.longitude}`;
  return provider === 'waze'
    ? `https://waze.com/ul?ll=${encodeURIComponent(destination)}&navigate=yes`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}
export async function openMap(
  coordinate: Coordinate | undefined,
  provider: 'google' | 'waze' = 'google',
) {
  if (!coordinate) throw new Error('A central ainda não informou as coordenadas do destino.');
  await Linking.openURL(mapUrl(coordinate, provider));
}
export async function callPhone(phone: string) {
  if (env.demo)
    throw new Error(
      'O telefone é ilustrativo. Chamadas ficam disponíveis com os contatos da operação real.',
    );
  if (!/^\+?[\d\s()-]{8,20}$/.test(phone))
    throw new Error('O telefone ainda não foi informado pela central.');
  await Linking.openURL(`tel:${phone.replace(/[^+\d]/g, '')}`);
}
