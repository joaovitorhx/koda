import type { Credentials } from '@/features/auth/model';
import type { Trip } from '@/features/trips/model';

export const demoCredentials = { email: 'joao.hanel@kodalogtech.com', password: 'Koda@2026' };
export async function demoLogin({ email, password }: Credentials) {
  if (
    password !== demoCredentials.password ||
    ![demoCredentials.email, 'operador@kodalogtech.com', 'inativo@kodalogtech.com'].includes(
      email.toLowerCase(),
    )
  ) {
    throw new Error('Verifique suas credenciais e tente novamente.');
  }
  const payload = btoa(
    JSON.stringify({ sub: 'demo-driver', exp: Math.floor(Date.now() / 1000) + 3600 }),
  );
  return {
    accessToken: `eyJhbGciOiJub25lIn0.${payload}.demo`,
    user: {
      id: 'demo-driver',
      name: 'João Hanel',
      email,
      role: email.startsWith('operador') ? 'user' : 'driver',
      is_active: !email.startsWith('inativo'),
      logistics_center: 'CD Campinas – Koda LogTech',
    },
  };
}
const seed = (): Trip[] => [
  {
    id: '1042',
    status: 'pending',
    client: 'Frigorífico Vale Verde',
    address: 'Av. das Indústrias, 1200 — Campinas/SP',
    plate: 'RTA-2C41',
    cargo: 'Vacinas',
    minTemperature: 2,
    maxTemperature: 8,
  },
  {
    id: '1038',
    status: 'in_transit',
    client: 'Distribuidora Norte Frios',
    address: 'Rod. Dom Pedro I, km 84 — Jaguariúna/SP',
    plate: 'KDA-7B92',
    cargo: 'Polpa cong.',
    minTemperature: -18,
    maxTemperature: -12,
    currentTemperature: -15.4,
  },
  {
    id: '1043',
    status: 'pending',
    client: 'Hospital Santa Clara',
    address: 'Rua Barão de Jaguara, 410 — Campinas/SP',
    plate: 'KDA-4F18',
    cargo: 'Medicamentos',
    minTemperature: 2,
    maxTemperature: 8,
  },
  {
    id: '1044',
    status: 'pending',
    client: 'Mercado Central',
    address: 'Av. Brasil, 920 — Valinhos/SP',
    plate: 'KDA-5G26',
    cargo: 'Laticínios',
    minTemperature: 1,
    maxTemperature: 5,
  },
  {
    id: '1036',
    status: 'completed',
    client: 'Rede Saúde',
    address: 'Campinas/SP',
    plate: 'KDA-1A23',
    cargo: 'Vacinas',
    minTemperature: 2,
    maxTemperature: 8,
    completedAt: new Date().toISOString(),
  },
];
let trips = seed();
export async function demoTrips() {
  return trips.map((trip) => ({
    departureAt: new Date().toISOString(),
    weightKg: 3400,
    vehicleModel: 'Volvo FH 460 · 2021',
    vehicleCapacityKg: 12000,
    latitude: -22.9056,
    longitude: -47.0608,
    ...trip,
  }));
}
export async function demoStartTrip(id: string) {
  const trip = trips.find((item) => item.id === id);
  if (!trip || trip.status !== 'pending')
    throw new Error('Esta viagem não está mais pendente. Atualize a lista.');
  trips = trips.map((item) => (item.id === id ? { ...item, status: 'in_transit' } : item));
}

export async function demoUpdateTrip(id: string, changes: Partial<Trip>) {
  trips = trips.map((trip) => (trip.id === id ? { ...trip, ...changes } : trip));
}
