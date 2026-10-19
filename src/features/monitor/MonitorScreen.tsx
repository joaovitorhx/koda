import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  Bluetooth,
  CheckCheck,
  CloudOff,
  FlaskConical,
  RefreshCw,
  Thermometer,
  TriangleAlert,
  UploadCloud,
} from 'lucide-react-native';
import { env } from '@/core/config/env';
import { useAuth } from '@/features/auth/AuthProvider';
import { useOperations } from '@/features/operations/OperationsProvider';
import { mergeReadings, thermalState } from '@/features/operations/model';
import { readingsFor } from '@/features/operations/service';
import { BottomTabs, ConnectionBar, DemoBanner } from '@/shared/components/AppChrome';
import {
  Badge,
  Card,
  EmptyState,
  Eyebrow,
  Header,
  Info,
  Label,
  Screen,
  SectionTitle,
  Sheet,
  TextLink,
  layout,
} from '@/shared/components/primitives';
import { navigate } from '@/shared/navigation';
import { colors, useTheme } from '@/shared/theme';
import { Button } from '@/shared/ui';
import { TemperatureGauge, ThermalChart } from './ThermalVisuals';
export function MonitorScreen() {
  const ops = useOperations();
  const { setActiveTripId } = ops;
  const { session } = useAuth();
  const { palette } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const id =
    params.id ??
    ops.activeTripId ??
    ops.trips.data?.find((trip) => ['in_transit', 'at_warehouse'].includes(trip.status))?.id;
  const trip = ops.trips.data?.find((item) => item.id === id);
  const active = !!trip && ['in_transit', 'at_warehouse'].includes(trip.status);
  const history = useQuery({
    queryKey: ['readings', String(session?.user.id), id],
    queryFn: () => readingsFor(id!),
    enabled: !!id,
    refetchInterval: !env.demo && ops.online ? 30000 : false,
  });
  const readings = useMemo(
    () => mergeReadings(history.data ?? [], ops.liveReadings[id ?? ''] ?? []),
    [history.data, ops.liveReadings, id],
  );
  const [now, setNow] = useState(() => Date.now());
  const [period, setPeriod] = useState(1);
  const [finishing, setFinishing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (active && id) setActiveTripId(id);
  }, [active, id, setActiveTripId]);
  const last = readings.at(-1);
  const seconds = last ? Math.max(0, Math.floor((now - Date.parse(last.timestamp)) / 1000)) : 0;
  const mismatched = !env.demo && !!trip?.sensorId && trip.sensorId !== ops.sensor?.id;
  const stale = !last || seconds > 60 || ops.sensorStatus !== 'connected' || mismatched;
  const state = thermalState(
    last?.temperature,
    trip?.minTemperature ?? null,
    trip?.maxTemperature ?? null,
  );
  const pending = ops.queueCount[id ?? ''] ?? 0;
  const finish = async () => {
    setError(null);
    try {
      await ops.finish(id!);
      setFinishing(false);
      navigate('summary', id, true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir.');
    }
  };
  return (
    <Screen footer={<BottomTabs active="monitor" />}>
      <Header
        title="Monitor da carga"
        subtitle={trip ? `Viagem #${trip.id} · ${trip.client}` : 'Acompanhe sua carga'}
        right={
          active ? (
            <Badge
              label={env.demo ? 'Simulação' : stale ? 'Sem sinal recente' : 'Ao vivo'}
              tone={stale ? 'neutral' : 'success'}
            />
          ) : undefined
        }
      />
      {!active ? (
        <EmptyState
          icon={Thermometer}
          title="Nenhuma viagem ativa"
          description="Inicie uma viagem para acompanhar a temperatura e os registros da carga."
        >
          <Button label="Ver minhas viagens" onPress={() => navigate('trips', undefined, true)} />
        </EmptyState>
      ) : (
        <>
          <ConnectionBar />
          {!ops.online && (
            <Info icon={CloudOff}>
              Modo offline. As leituras ficam salvas neste aparelho até a conexão voltar.
            </Info>
          )}
          {ops.sensorStatus !== 'connected' && (
            <View>
              <Info icon={Bluetooth}>Conecte um sensor para receber novas leituras.</Info>
              <TextLink label="Conectar sensor" onPress={() => navigate('pairing', id)} />
            </View>
          )}
          {mismatched && (
            <Info icon={Bluetooth} tone="warning">
              O sensor conectado não corresponde ao sensor designado para esta viagem. Conecte o
              sensor correto para iniciar a coleta.
            </Info>
          )}
          {(state === 'high' || state === 'low') && (
            <View style={{ marginTop: 10 }}>
              <Info icon={TriangleAlert} tone="danger">
                Risco térmico detectado.{' '}
                {env.demo
                  ? 'Alerta de demonstração.'
                  : ops.alerts.data?.some(
                        (a) => a.tripId === id && !a.resolvedAt && a.source === 'server',
                      )
                    ? 'Alerta registrado pela central.'
                    : 'Verifique a carga e entre em contato com a central.'}
              </Info>
            </View>
          )}
          <TemperatureGauge
            value={last?.temperature}
            min={trip.minTemperature}
            max={trip.maxTemperature}
            stale={stale}
          />
          <View style={[layout.grid, { marginTop: 22 }]}>
            {[
              {
                label: 'ÚLTIMA LEITURA',
                value: !last
                  ? '—'
                  : seconds < 60
                    ? `há ${seconds}s`
                    : `há ${Math.floor(seconds / 60)}min`,
                note: last ? new Date(last.timestamp).toLocaleTimeString('pt-BR') : 'aguardando',
                color: colors.blue,
              },
              {
                label: 'REGISTROS',
                value: readings.length.toLocaleString('pt-BR'),
                note: 'neste histórico',
                color: colors.green,
              },
              {
                label: 'FILA OFFLINE',
                value: String(pending),
                note: pending ? 'aguardando envio' : 'sincronizada',
                color: pending ? colors.amber : palette.muted,
              },
            ].map((item) => (
              <Card key={item.label} style={{ flex: 1, padding: 11, borderRadius: 15 }}>
                <View
                  style={{
                    width: 16,
                    height: 3,
                    backgroundColor: item.color,
                    borderRadius: 2,
                    marginBottom: 12,
                  }}
                />
                <Eyebrow style={{ fontSize: 8, letterSpacing: 0.5 }}>{item.label}</Eyebrow>
                <Label size={21} weight="semibold" style={{ marginTop: 6 }}>
                  {item.value}
                </Label>
                <Label size={9} muted style={{ marginTop: 3 }}>
                  {item.note}
                </Label>
              </Card>
            ))}
          </View>
          <Card style={{ marginTop: 18 }}>
            <View style={[layout.between, { marginBottom: 16 }]}>
              <Label size={14} weight="semibold">
                Histórico térmico
              </Label>
              <View
                style={{
                  flexDirection: 'row',
                  padding: 3,
                  borderRadius: 9,
                  backgroundColor: palette.input,
                }}
              >
                {[1, 6, 0].map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={value ? `Últimas ${value} horas` : 'Todo o histórico'}
                    accessibilityState={{ selected: period === value }}
                    onPress={() => setPeriod(value)}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 8,
                      borderRadius: 6,
                      backgroundColor: period === value ? palette.surface : 'transparent',
                    }}
                  >
                    <Label
                      size={10}
                      weight="semibold"
                      style={{ color: period === value ? colors.blue : palette.muted }}
                    >
                      {value ? `${value}h` : 'Tudo'}
                    </Label>
                  </Pressable>
                ))}
              </View>
            </View>
            <ThermalChart
              readings={readings.filter(
                (reading) => !period || Date.parse(reading.timestamp) >= now - period * 3600000,
              )}
              min={trip.minTemperature}
              max={trip.maxTemperature}
            />
          </Card>
          {history.isError && (
            <View>
              <Info tone="danger">Não foi possível carregar o histórico.</Info>
              <TextLink label="Tentar novamente" onPress={() => void history.refetch()} />
            </View>
          )}
          {(ops.telemetryError || ops.sensorError) && (
            <Info tone="warning" icon={TriangleAlert}>
              {ops.telemetryError || ops.sensorError}
            </Info>
          )}
          <SectionTitle
            title="Últimos registros"
            trailing={<Badge label={`${readings.length} leituras`} dot={false} />}
          />
          <View style={{ gap: 8 }}>
            {readings
              .slice(-3)
              .reverse()
              .map((reading) => {
                const status = thermalState(
                  reading.temperature,
                  trip.minTemperature,
                  trip.maxTemperature,
                );
                const normal = status === 'normal';
                const unknown = status === 'unknown';
                return (
                  <Card
                    key={reading.id}
                    style={[layout.between, { paddingVertical: 13, borderRadius: 12 }]}
                  >
                    <Label size={12} muted>
                      {new Date(reading.timestamp).toLocaleTimeString('pt-BR')}
                    </Label>
                    <Label
                      size={15}
                      weight="semibold"
                      style={{
                        color: unknown ? palette.muted : normal ? colors.green : colors.red,
                      }}
                    >
                      {reading.temperature.toFixed(1)}°C
                    </Label>
                    <Badge
                      label={unknown ? 'Sem faixa' : normal ? 'Na faixa' : 'Fora da faixa'}
                      tone={unknown ? 'neutral' : normal ? 'success' : 'danger'}
                      dot={false}
                    />
                  </Card>
                );
              })}
            {!readings.length && (
              <Label muted size={12}>
                Aguardando a primeira leitura do sensor.
              </Label>
            )}
          </View>
          <Button
            label="Finalizar viagem"
            icon={CheckCheck}
            outline
            onPress={() => {
              setError(null);
              setFinishing(true);
            }}
            style={{ marginTop: 24 }}
          />
          {env.demo && <TextLink label="Testar cenários" onPress={() => setTesting(true)} />}
          <DemoBanner />
          <Sheet
            visible={finishing}
            title={`Finalizar viagem #${id}?`}
            onClose={() => setFinishing(false)}
            dismissible={!ops.busyTrip}
          >
            <EmptyState
              icon={CheckCheck}
              title="Tudo pronto para entregar?"
              description={`Os últimos registros serão sincronizados e o veículo ${trip.plate} ficará disponível.`}
            />
            <Info icon={UploadCloud} tone={pending ? 'warning' : 'success'}>
              {pending
                ? `${pending} leitura(s) pendente(s) serão enviadas antes da confirmação.`
                : 'Todas as leituras locais estão sincronizadas.'}
            </Info>
            {error && (
              <Label accessibilityRole="alert" style={{ color: colors.red }} size={13}>
                {error}
              </Label>
            )}
            <Button
              label="Confirmar entrega"
              loading={!!ops.busyTrip}
              onPress={() => void finish()}
            />
            <Button
              label="Cancelar"
              outline
              disabled={!!ops.busyTrip}
              onPress={() => setFinishing(false)}
            />
          </Sheet>
          <Sheet
            visible={testing}
            title="Cenários de demonstração"
            onClose={() => setTesting(false)}
          >
            <Info icon={FlaskConical}>
              Os controles abaixo alteram apenas os dados simulados desta viagem.
            </Info>
            {(
              [
                { mode: 'normal', label: 'Temperatura normal · online', icon: RefreshCw },
                { mode: 'critical', label: 'Simular alerta crítico', icon: TriangleAlert },
                { mode: 'offline', label: 'Simular operação offline', icon: CloudOff },
              ] as const
            ).map(({ mode, label, icon }) => (
              <Button
                key={mode}
                label={label}
                icon={icon}
                outline
                onPress={() => {
                  setTesting(false);
                  void ops.demoScenario(id!, mode);
                }}
              />
            ))}
          </Sheet>
        </>
      )}
    </Screen>
  );
}
