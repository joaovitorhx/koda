import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Bell, ChevronRight, RefreshCw, TriangleAlert } from 'lucide-react-native';
import { useOperations } from '@/features/operations/OperationsProvider';
import { BottomTabs, DemoBanner } from '@/shared/components/AppChrome';
import {
  Badge,
  Card,
  EmptyState,
  Header,
  IconButton,
  Info,
  Label,
  Screen,
  layout,
} from '@/shared/components/primitives';
import { colors, useTheme } from '@/shared/theme';
export function AlertsScreen() {
  const ops = useOperations();
  const { palette } = useTheme();
  const [all, setAll] = useState(false);
  const alerts = (ops.alerts.data ?? []).filter((item) => all || !item.resolvedAt);
  return (
    <Screen footer={<BottomTabs active="alerts" />}>
      <Header
        title="Alertas"
        subtitle="Atenção em cada etapa"
        right={
          <IconButton
            icon={RefreshCw}
            label="Atualizar alertas"
            onPress={() => void ops.alerts.refetch()}
          />
        }
      />
      <View style={[layout.row, { marginBottom: 22 }]}>
        {[false, true].map((value) => (
          <Pressable
            key={String(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: all === value }}
            onPress={() => setAll(value)}
            style={{
              backgroundColor: all === value ? colors.navy : palette.surface,
              borderRadius: 12,
              padding: 13,
            }}
          >
            <Label
              size={12}
              weight="semibold"
              style={{ color: all === value ? '#FFF' : palette.muted }}
            >
              {value ? 'Histórico' : 'Em aberto'}
            </Label>
          </Pressable>
        ))}
      </View>
      {ops.alerts.isError && (
        <Info tone="danger">
          Não foi possível consultar os alertas da central. Tente atualizar.
        </Info>
      )}
      {!alerts.length ? (
        <EmptyState
          icon={Bell}
          title={ops.alerts.isPending ? 'Carregando alertas…' : 'Tudo tranquilo por aqui'}
          description="Os alertas de temperatura das suas viagens aparecerão nesta tela."
        />
      ) : (
        <View style={layout.stack}>
          {alerts.map((alert) => {
            const trip = ops.trips.data?.find((item) => item.id === alert.tripId);
            return (
              <Pressable
                key={alert.id}
                accessibilityRole="button"
                accessibilityLabel={`Ver alerta da viagem ${alert.tripId}`}
                onPress={() => ops.setCritical(alert)}
              >
                <Card>
                  <View style={layout.between}>
                    <Badge
                      label={
                        alert.status === 'cancelado'
                          ? 'Cancelado'
                          : alert.resolvedAt
                            ? 'Resolvido'
                            : 'Risco térmico'
                      }
                      tone={alert.resolvedAt ? 'success' : 'danger'}
                    />
                    <Label size={11} muted>
                      #{alert.tripId}
                    </Label>
                  </View>
                  <View style={[layout.row, { marginVertical: 18 }]}>
                    <TriangleAlert size={23} color={alert.resolvedAt ? colors.green : colors.red} />
                    <View style={{ flex: 1 }}>
                      <Label size={15} weight="semibold">
                        {trip?.client ?? 'Alerta de temperatura'}
                      </Label>
                      <Label size={12} muted>
                        Pico registrado: {alert.peak.toFixed(1)}°C
                      </Label>
                    </View>
                    <ChevronRight size={18} color={palette.muted} />
                  </View>
                  <Label size={11} muted>
                    {new Date(alert.openedAt).toLocaleString('pt-BR')}
                  </Label>
                </Card>
              </Pressable>
            );
          })}
        </View>
      )}
      <DemoBanner />
    </Screen>
  );
}
