import { Pressable, View } from 'react-native';
import { ArrowRight, MapPin, Thermometer, Truck } from 'lucide-react-native';
import { Button } from '@/shared/ui';
import { colors } from '@/shared/theme';
import { Badge, Card, Eyebrow, Label, layout } from '@/shared/components/primitives';
import { temperature, type Trip } from './model';
export function TripCard({
  trip,
  onStart,
  onMonitor,
  onDetail,
  starting,
  disabled,
}: {
  trip: Trip;
  onStart(): void;
  onMonitor(): void;
  onDetail(): void;
  starting: boolean;
  disabled: boolean;
}) {
  const pending = trip.status === 'pending';
  return (
    <Card style={{ marginBottom: 14 }}>
      <View style={layout.between}>
        <Badge
          label={
            pending
              ? 'Pendente'
              : trip.status === 'completed'
                ? 'Entregue'
                : trip.status === 'at_warehouse'
                  ? 'No armazém'
                  : 'Em trânsito'
          }
          tone={pending ? 'info' : 'success'}
        />
        <Label muted size={11}>
          #{trip.id}
        </Label>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Detalhes da viagem ${trip.id}`}
        onPress={onDetail}
        style={{ paddingVertical: 16 }}
      >
        <Label size={17} weight="semibold" style={{ marginBottom: 5 }}>
          {trip.client}
        </Label>
        <View style={[layout.row, { gap: 5 }]}>
          <MapPin size={13} color={colors.muted} />
          <Label muted size={11} style={{ flex: 1 }}>
            {trip.address}
          </Label>
        </View>
      </Pressable>
      <View style={[layout.between, { paddingBottom: 16 }]}>
        <View style={{ gap: 3, flex: 1, minWidth: 0 }}>
          <Eyebrow>Veículo</Eyebrow>
          <View style={[layout.row, { gap: 5 }]}>
            <Truck size={13} color={colors.muted} />
            <Label size={12} weight="medium">
              {trip.plate}
            </Label>
          </View>
        </View>
        <View style={{ gap: 3, flex: 1, minWidth: 0 }}>
          <Eyebrow>Carga</Eyebrow>
          <Label size={12} weight="medium">
            {trip.cargo}
          </Label>
        </View>
        <View style={{ gap: 3, flex: 1, minWidth: 0 }}>
          <Eyebrow>Faixa ideal</Eyebrow>
          <Label size={12} weight="medium">
            {temperature(trip.minTemperature)} a {temperature(trip.maxTemperature)}°C
          </Label>
        </View>
      </View>
      {pending ? (
        <Button
          label="Iniciar viagem"
          icon={ArrowRight}
          onPress={onStart}
          loading={starting}
          disabled={disabled}
        />
      ) : (
        <Button
          label={trip.status === 'completed' ? 'Ver resumo' : 'Abrir monitor'}
          outline
          icon={Thermometer}
          onPress={onMonitor}
        />
      )}
    </Card>
  );
}
