import { useState } from 'react';
import { View } from 'react-native';
import { Navigation, Phone, TriangleAlert } from 'lucide-react-native';
import { usePermissions } from '@/features/permissions/PermissionsProvider';
import { env } from '@/core/config/env';
import { useOperations } from '@/features/operations/OperationsProvider';
import { callPhone } from '@/features/operations/links';
import { Badge, Card, Info, Label, Sheet, layout } from '@/shared/components/primitives';
import { Button } from '@/shared/ui';
import { colors } from '@/shared/theme';
import { navigate } from '@/shared/navigation';
export function CriticalAlert() {
  const ops = useOperations();
  const { ready } = usePermissions();
  const alert = ops.critical;
  const trip = ops.trips.data?.find((t) => t.id === alert?.tripId);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    ops.setCritical(null);
    setError(null);
  };
  return (
    <Sheet visible={!!alert && ready} title="Atenção à temperatura" onClose={close}>
      {alert && (
        <>
          <Badge
            label={
              alert.status === 'cancelado'
                ? 'Cancelado pela central'
                : alert.resolvedAt
                  ? 'Alerta resolvido'
                  : alert.source === 'demo'
                    ? 'Alerta simulado'
                    : 'Alerta térmico'
            }
            tone="danger"
          />
          <View style={layout.row}>
            <TriangleAlert size={30} color={colors.red} />
            <Label size={22} weight="semibold" style={{ flex: 1 }}>
              Temperatura{' '}
              {(alert.minTemperature ?? trip?.minTemperature) != null &&
              alert.peak < (alert.minTemperature ?? trip?.minTemperature ?? -100)
                ? 'abaixo do mínimo'
                : 'acima do máximo'}
            </Label>
          </View>
          <Label size={13} muted>
            A carga {trip?.cargo ?? `da viagem #${alert.tripId}`} saiu da faixa permitida. Verifique
            as condições do transporte.
          </Label>
          <View style={layout.grid}>
            <Card style={{ flex: 1 }}>
              <Label size={10} muted>
                PICO REGISTRADO
              </Label>
              <Label size={25} weight="semibold" style={{ color: colors.red }}>
                {alert.peak.toFixed(1)}°C
              </Label>
            </Card>
            <Card style={{ flex: 1 }}>
              <Label size={10} muted>
                LEITURA INICIAL
              </Label>
              <Label size={25} weight="semibold">
                {alert.initialTemperature.toFixed(1)}°C
              </Label>
            </Card>
          </View>
          <View style={layout.between}>
            <Label size={12} muted>
              Faixa permitida
            </Label>
            <Label size={12} weight="semibold">
              {trip
                ? `${(alert.minTemperature ?? trip.minTemperature)?.toFixed(1) ?? '—'}°C – ${(alert.maxTemperature ?? trip.maxTemperature)?.toFixed(1) ?? '—'}°C`
                : 'Não informada'}
            </Label>
          </View>
          <Label size={11} muted>
            Aberto em {new Date(alert.openedAt).toLocaleString('pt-BR')}
          </Label>
          {error && <Info tone="warning">{error}</Info>}
          <Button
            label="Ver rota de contingência"
            danger
            icon={Navigation}
            onPress={() => {
              const id = alert.tripId;
              close();
              navigate('contingency', id);
            }}
          />
          <Button
            label="Ligar para a central"
            icon={Phone}
            outline
            onPress={() => {
              void callPhone(env.centralPhone || trip?.centralPhone || '').catch((e: Error) =>
                setError(e.message),
              );
            }}
          />
          <Button label="Dispensar alerta" outline onPress={close} />
        </>
      )}
    </Sheet>
  );
}
