import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ArrowRight, Bluetooth, MapPin, Package, Truck } from 'lucide-react-native';
import { useOperations } from '@/features/operations/OperationsProvider';
import { openMap } from '@/features/operations/links';
import { navigate } from '@/shared/navigation';
import { colors } from '@/shared/theme';
import { Button, Notice } from '@/shared/ui';
import {
  Badge,
  Card,
  EmptyState,
  Eyebrow,
  Header,
  Label,
  Screen,
  SectionTitle,
  TextLink,
  layout,
} from '@/shared/components/primitives';
import { ConnectionBar, DemoBanner } from '@/shared/components/AppChrome';
import { RouteMap } from '@/shared/components/RouteMap';
import { useStartTrip } from './useStartTrip';
export function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ops = useOperations();
  const { start, modal } = useStartTrip();
  const [error, setError] = useState<string | null>(null);
  const trip = ops.trips.data?.find((item) => item.id === id);
  if (!trip)
    return (
      <Screen>
        <Header back title="Detalhes da viagem" />
        <EmptyState
          icon={Truck}
          title={ops.trips.isPending ? 'Carregando viagem' : 'Viagem indisponível'}
          description="Volte à lista para atualizar as viagens designadas."
        />
      </Screen>
    );
  const pending = trip.status === 'pending';
  const coordinate =
    trip.latitude != null && trip.longitude != null
      ? { latitude: trip.latitude, longitude: trip.longitude }
      : undefined;
  return (
    <Screen>
      <Header
        back
        title={`Viagem #${trip.id}`}
        subtitle={
          trip.departureAt
            ? `Saída prevista · ${new Date(trip.departureAt).toLocaleDateString('pt-BR')}`
            : 'Detalhes da operação'
        }
        right={
          <Badge
            label={pending ? 'Pendente' : trip.status === 'completed' ? 'Entregue' : 'Em trânsito'}
            tone={pending ? 'info' : 'success'}
          />
        }
      />
      <ConnectionBar />
      <Eyebrow>Seu próximo destino</Eyebrow>
      <Label size={26} weight="semibold" style={{ marginTop: 7, marginBottom: 7 }}>
        {trip.client}
      </Label>
      <View style={[layout.row, { alignItems: 'flex-start', marginBottom: 22 }]}>
        <MapPin size={15} color={colors.muted} />
        <Label muted size={12} style={{ flex: 1 }}>
          {trip.address}
        </Label>
      </View>
      <RouteMap coordinate={coordinate} />
      <TextLink
        label="Abrir no mapa"
        onPress={() => {
          void openMap(coordinate).catch((reason: Error) => setError(reason.message));
        }}
      />
      <SectionTitle title="Cuidado em cada grau" />
      <Card>
        <Eyebrow>Faixa de temperatura</Eyebrow>
        <View style={[layout.between, { marginVertical: 12 }]}>
          <Label size={28} weight="semibold">
            {trip.minTemperature?.toFixed(1) ?? '—'}
            <Label size={16} muted>
              °C
            </Label>
          </Label>
          <View style={{ height: 1, flex: 1, backgroundColor: '#B4D8CF' }} />
          <Label size={28} weight="semibold">
            {trip.maxTemperature?.toFixed(1) ?? '—'}
            <Label size={16} muted>
              °C
            </Label>
          </Label>
        </View>
        <Badge
          label={trip.minTemperature == null ? 'Faixa não informada' : 'Faixa ideal para sua carga'}
          tone={trip.minTemperature == null ? 'warning' : 'success'}
        />
        <View style={layout.divider} />
        <View style={layout.between}>
          <View>
            <Eyebrow>Tipo de carga</Eyebrow>
            <Label size={13} weight="medium">
              {trip.cargo}
            </Label>
          </View>
          <View>
            <Eyebrow>Peso</Eyebrow>
            <Label size={13} weight="medium">
              {trip.weightKg?.toLocaleString('pt-BR') ?? '—'} kg
            </Label>
          </View>
          <Package size={22} color={colors.blue} />
        </View>
      </Card>
      <SectionTitle title="Prontos para a estrada" />
      <View style={layout.grid}>
        <Card style={{ flex: 1, padding: 15 }}>
          <Truck size={21} color={colors.blue} />
          <Eyebrow>Veículo</Eyebrow>
          <Label weight="semibold" size={15} style={{ marginVertical: 7 }}>
            {trip.plate}
          </Label>
          <Label size={10} muted>
            {trip.vehicleModel ?? 'Modelo não informado'}
          </Label>
        </Card>
        <Card style={{ flex: 1, padding: 15 }}>
          <Bluetooth size={21} color={colors.blue} />
          <Eyebrow>Sensor IoT</Eyebrow>
          <Label weight="semibold" size={12} style={{ marginTop: 8 }}>
            {ops.sensor?.name ?? 'Não conectado'}
          </Label>
          <TextLink
            label={ops.sensor ? 'Trocar sensor' : 'Conectar sensor'}
            onPress={() => navigate('pairing', id)}
          />
        </Card>
      </View>
      <View style={{ marginTop: 24 }}>
        <Button
          label={
            pending
              ? 'Iniciar viagem'
              : trip.status === 'completed'
                ? 'Ver resumo'
                : 'Abrir monitor'
          }
          icon={ArrowRight}
          loading={ops.busyTrip === id}
          onPress={() => {
            if (pending) void start(id);
            else navigate(trip.status === 'completed' ? 'summary' : 'monitor', id);
          }}
        />
      </View>
      <DemoBanner />
      {modal}
      {error && <Notice message={error} onDismiss={() => setError(null)} />}
    </Screen>
  );
}
