import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import {
  Bluetooth,
  BluetoothSearching,
  Check,
  Radio,
  RefreshCw,
  ShieldCheck,
  Signal,
} from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import { useOperations } from '@/features/operations/OperationsProvider';
import { env } from '@/core/config/env';
import { colors, useTheme } from '@/shared/theme';
import { Button } from '@/shared/ui';
import { navigate } from '@/shared/navigation';
import {
  Badge,
  Card,
  EmptyState,
  Header,
  IconButton,
  Info,
  Label,
  Screen,
  SectionTitle,
  TextLink,
  layout,
} from '@/shared/components/primitives';
import { DemoBanner } from '@/shared/components/AppChrome';
export function PairingScreen() {
  const ops = useOperations();
  const { palette } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  useEffect(() => {
    void ops.scan(); /* Discovery starts on entry, never on render. */
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const scanning = ops.sensorStatus === 'scanning';
  const connecting = ops.sensorStatus === 'connecting';
  return (
    <Screen>
      <Header
        back
        title="Conectar sensor"
        subtitle="PREPARAÇÃO DA VIAGEM"
        right={
          <IconButton
            icon={RefreshCw}
            label="Buscar novamente"
            onPress={() => {
              void ops.scan();
            }}
          />
        }
      />
      <View style={styles.hero}>
        <View style={[styles.ring, { borderColor: palette.border }]}>
          <View style={[styles.innerRing, { backgroundColor: palette.info }]}>
            <Bluetooth size={36} color={colors.blue} strokeWidth={1.6} />
          </View>
        </View>
        <Label size={24} weight="semibold" style={{ textAlign: 'center', marginTop: 22 }}>
          {ops.sensor
            ? 'Conexão pronta.'
            : scanning
              ? 'Buscando por perto.'
              : 'Sua carga, conectada.'}
        </Label>
        <Label muted size={13} style={{ textAlign: 'center', marginTop: 8 }}>
          Mantenha o celular próximo ao sensor{'\n'}instalado no baú refrigerado.
        </Label>
      </View>
      <SectionTitle
        title="Dispositivos próximos"
        trailing={
          <Badge label={scanning ? 'Buscando' : `${ops.devices.length} encontrados`} tone="info" />
        }
      />
      {scanning && <ActivityIndicator color={colors.blue} style={{ padding: 16 }} />}
      {!scanning && !ops.devices.length && (
        <EmptyState
          icon={BluetoothSearching}
          title="Nenhum sensor encontrado"
          description="Verifique se o módulo IoT está ligado e dentro do alcance do celular."
        >
          <Button
            label="Buscar novamente"
            outline
            icon={RefreshCw}
            onPress={() => {
              void ops.scan();
            }}
          />
        </EmptyState>
      )}
      <View style={layout.stack}>
        {ops.devices.map((device) => {
          const selected = ops.sensor?.id === device.id && ops.sensorStatus === 'connected';
          return (
            <Pressable
              key={device.id}
              accessibilityRole="button"
              accessibilityLabel={`Conectar ${device.name}`}
              disabled={connecting}
              onPress={() => {
                void ops.connect(device, id ?? ops.activeTripId ?? undefined);
              }}
            >
              <Card
                style={
                  selected ? { borderColor: colors.blue, backgroundColor: palette.info } : undefined
                }
              >
                <View style={layout.row}>
                  <View style={[styles.deviceIcon, { backgroundColor: palette.input }]}>
                    {selected ? (
                      <Check color={colors.blue} size={19} />
                    ) : (
                      <Radio color={palette.muted} size={20} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Label weight="semibold" size={13}>
                      {device.name}
                    </Label>
                    <Label muted size={10} numberOfLines={1}>
                      {device.id}
                    </Label>
                  </View>
                  <Signal size={18} color={selected ? colors.green : palette.muted} />
                </View>
                <View style={[layout.between, { marginTop: 14 }]}>
                  <Label muted size={11}>
                    {device.rssi == null
                      ? 'Sinal indisponível'
                      : `${device.rssi} dBm · ${device.rssi > -75 ? 'Sinal forte' : 'Sinal fraco'}`}
                  </Label>
                  <Badge
                    label={selected ? 'Conectado' : 'Toque para parear'}
                    tone={selected ? 'success' : 'neutral'}
                  />
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>
      {connecting && <ActivityIndicator color={colors.blue} style={{ marginTop: 12 }} />}
      {ops.sensorError && (
        <View style={{ marginTop: 16 }}>
          <Info tone="danger">{ops.sensorError}</Info>
        </View>
      )}
      <View style={{ marginTop: 22 }}>
        <Info icon={ShieldCheck}>
          A conexão Bluetooth mantém as leituras da carga disponíveis mesmo sem internet.
        </Info>
      </View>
      <View style={{ marginTop: 24, gap: 10 }}>
        <Button
          label={ops.sensor ? 'Continuar com sensor conectado' : 'Continuar sem sensor'}
          onPress={() => navigate(id ? 'detail' : 'trips', id, true)}
        />
        <Label muted size={11} style={{ textAlign: 'center' }}>
          Sem sensor, a temperatura não será monitorada.
        </Label>
      </View>
      {env.demo && (
        <View style={{ alignItems: 'center' }}>
          <TextLink
            label="Simular nenhum sensor"
            onPress={() => {
              void ops.disconnect().then(() => ops.scan(true));
            }}
          />
        </View>
      )}
      <DemoBanner />
    </Screen>
  );
}
const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  ring: { padding: 15, borderRadius: 80, borderWidth: 1 },
  innerRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
