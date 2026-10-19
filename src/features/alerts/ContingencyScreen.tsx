import { useQuery } from '@tanstack/react-query';
import { contingencyFor } from '@/features/operations/service';
import { useAuth } from '@/features/auth/AuthProvider';
import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MapPin, Navigation, Phone, Warehouse } from 'lucide-react-native';
import { useOperations } from '@/features/operations/OperationsProvider';
import { callPhone, openMap } from '@/features/operations/links';
import { RouteMap } from '@/shared/components/RouteMap';
import { DemoBanner } from '@/shared/components/AppChrome';
import {
  Badge,
  Card,
  EmptyState,
  Eyebrow,
  Header,
  Info,
  Label,
  Screen,
  Sheet,
  layout,
} from '@/shared/components/primitives';
import { Button } from '@/shared/ui';
import { navigate } from '@/shared/navigation';
export function ContingencyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ops = useOperations();
  const alert =
    ops.alerts.data?.find((item) => item.tripId === id && !item.resolvedAt) ??
    ops.alerts.data?.find((item) => item.tripId === id);
  const { session } = useAuth();
  const contingency = useQuery({
    queryKey: ['contingency', session?.user.id, id],
    queryFn: () => contingencyFor(id),
    enabled: !!id,
  });
  const warehouse = contingency.data;
  const [error, setError] = useState<string | null>(null);
  const [maps, setMaps] = useState(false);
  return (
    <Screen>
      <Header back title="Rota alternativa" subtitle={`Contingência · viagem #${id}`} />
      {!warehouse ? (
        <EmptyState
          icon={Warehouse}
          title={
            contingency.isPending
              ? 'Consultando a central…'
              : contingency.isError
                ? 'Não foi possível consultar a rota'
                : 'Aguardando orientação'
          }
          description="A central ainda não enviou um armazém de contingência para esta viagem."
        >
          <Button
            label={contingency.isError ? 'Tentar novamente' : 'Voltar ao monitor'}
            onPress={() => {
              if (contingency.isError) void contingency.refetch();
              else navigate('monitor', id, true);
            }}
          />
        </EmptyState>
      ) : (
        <View style={layout.stack}>
          <Badge
            label={alert?.resolvedAt ? 'Alerta resolvido' : 'Risco térmico'}
            tone={alert?.resolvedAt ? 'success' : 'danger'}
          />
          <RouteMap
            coordinate={warehouse.coordinate}
            route={warehouse.route}
            emergency
            height={240}
          />
          <View>
            <Eyebrow>DESVIO RECOMENDADO</Eyebrow>
            <Label size={25} weight="semibold" style={{ marginTop: 9 }}>
              {warehouse.name}
            </Label>
            <View style={[layout.row, { marginTop: 8 }]}>
              <MapPin size={15} color="#71818C" />
              <Label size={12} muted style={{ flex: 1 }}>
                {warehouse.address}
              </Label>
            </View>
          </View>
          <View style={layout.grid}>
            {[
              {
                title: 'DISTÂNCIA',
                value: warehouse.distanceKm == null ? '—' : `${warehouse.distanceKm} km`,
              },
              {
                title: 'TEMPO ESTIMADO',
                value: warehouse.minutes == null ? '—' : `${warehouse.minutes} min`,
              },
            ].map((item) => (
              <Card key={item.title} style={{ flex: 1 }}>
                <Eyebrow>{item.title}</Eyebrow>
                <Label size={24} weight="semibold" style={{ marginTop: 8 }}>
                  {item.value}
                </Label>
              </Card>
            ))}
          </View>
          <Card>
            <View style={layout.between}>
              <Label size={12} muted>
                Capacidade
              </Label>
              <Label size={13} weight="semibold">
                {warehouse.capacityKg?.toLocaleString('pt-BR') ?? '—'} kg
              </Label>
            </View>
            <View style={[layout.between, { marginTop: 18 }]}>
              <Label size={12} muted>
                Responsável
              </Label>
              <Label size={13} weight="semibold">
                {warehouse.responsible ?? 'Não informado'}
              </Label>
            </View>
            <Label size={13} muted style={{ marginTop: 16 }}>
              {warehouse.phone}
            </Label>
          </Card>
          {error && <Info tone="warning">{error}</Info>}
          <Button label="Iniciar navegação" icon={Navigation} onPress={() => setMaps(true)} />
          <Button
            label="Ligar para o armazém"
            icon={Phone}
            outline
            onPress={() => void callPhone(warehouse.phone).catch((e: Error) => setError(e.message))}
          />
          <Button
            label="Manter rota original"
            outline
            onPress={() => navigate('monitor', id, true)}
          />
          <DemoBanner />
          <Sheet visible={maps} title="Abrir navegação" onClose={() => setMaps(false)}>
            {(['google', 'waze'] as const).map((provider) => (
              <Button
                key={provider}
                label={provider === 'google' ? 'Google Maps' : 'Waze'}
                outline
                onPress={() => {
                  setMaps(false);
                  void openMap(warehouse.coordinate, provider).catch((e: Error) =>
                    setError(e.message),
                  );
                }}
              />
            ))}
          </Sheet>
        </View>
      )}
    </Screen>
  );
}
