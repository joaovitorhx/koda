import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCheck, FileCheck2 } from 'lucide-react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { useOperations } from '@/features/operations/OperationsProvider';
import { reportFor } from '@/features/operations/service';
import { durationLabel } from '@/features/operations/model';
import { ThermalChart } from '@/features/monitor/ThermalVisuals';
import { BottomTabs, DemoBanner } from '@/shared/components/AppChrome';
import {
  Badge,
  Card,
  EmptyState,
  Eyebrow,
  Header,
  Label,
  Screen,
  SectionTitle,
  layout,
} from '@/shared/components/primitives';
import { Button } from '@/shared/ui';
import { colors, useTheme } from '@/shared/theme';
import { navigate } from '@/shared/navigation';
export function SummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const ops = useOperations();
  const { palette } = useTheme();
  const trip = ops.trips.data?.find((item) => item.id === id);
  const query = useQuery({
    queryKey: ['report', String(session?.user.id), id],
    queryFn: () => reportFor(id),
    enabled: !!id,
  });
  const report = query.data;
  return (
    <Screen footer={<BottomTabs active="trips" />}>
      <Header back title="Resumo da viagem" subtitle={`Viagem #${id}`} />
      {!report ? (
        <EmptyState
          icon={FileCheck2}
          title={query.isPending ? 'Carregando resumo…' : 'Resumo indisponível'}
          description={
            query.isError
              ? 'Conclua a entrega ou tente carregar o resumo novamente.'
              : 'Reunindo os registros da sua viagem.'
          }
        >
          {query.isError && (
            <Button label="Tentar novamente" onPress={() => void query.refetch()} />
          )}
        </EmptyState>
      ) : (
        <>
          <View style={{ alignItems: 'center', paddingVertical: 20, gap: 12 }}>
            <View
              style={{
                backgroundColor: palette.success,
                width: 70,
                height: 70,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCheck size={32} color={colors.green} />
            </View>
            <Label size={27} weight="semibold">
              Viagem concluída
            </Label>
            <Label size={12} muted>
              Entregue em{' '}
              {new Date(report.completedAt).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Label>
          </View>
          <Card style={{ marginTop: 12 }}>
            <Label size={16} weight="semibold">
              {trip?.client ?? `Viagem #${id}`}
            </Label>
            <Label size={12} muted style={{ marginVertical: 8 }}>
              {trip?.address}
            </Label>
            <View style={layout.between}>
              <Badge label={trip?.plate ?? 'Veículo'} dot={false} />
              <Badge label="Entregue" tone="success" />
            </View>
          </Card>
          <SectionTitle title="Seu trajeto em números" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[
              { label: 'LEITURAS ENVIADAS', value: report.readingsSent.toLocaleString('pt-BR') },
              {
                label: 'TEMPO DE VIAGEM',
                value: durationLabel(report.startedAt, report.completedAt),
              },
              { label: 'ALERTAS GERADOS', value: String(report.alertCount) },
              {
                label: 'TEMPO NA FAIXA',
                value:
                  report.timeInRange == null
                    ? '—'
                    : `${report.timeInRange.toFixed(1).replace('.', ',')}%`,
              },
            ].map((item) => (
              <Card key={item.label} style={{ width: '48%', flexGrow: 1, padding: 15 }}>
                <Eyebrow style={{ fontSize: 8 }}>{item.label}</Eyebrow>
                <Label size={24} weight="semibold" style={{ marginTop: 10 }}>
                  {item.value}
                </Label>
              </Card>
            ))}
          </View>
          <Card style={{ marginTop: 18 }}>
            <Label size={14} weight="semibold" style={{ marginBottom: 14 }}>
              Curva térmica da viagem
            </Label>
            {trip && (
              <ThermalChart
                readings={report.readings}
                min={trip.minTemperature}
                max={trip.maxTemperature}
              />
            )}
          </Card>
          <SectionTitle title="Linha do tempo" />
          <View style={{ gap: 0 }}>
            {report.events.map((event, index) => (
              <View
                key={`${event.timestamp}-${index}`}
                style={{ flexDirection: 'row', gap: 14, minHeight: 48 }}
              >
                <View style={{ alignItems: 'center', width: 12 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor:
                        event.tone === 'danger'
                          ? colors.red
                          : event.tone === 'success'
                            ? colors.green
                            : colors.blue,
                      marginTop: 7,
                    }}
                  />
                  {index < report.events.length - 1 && (
                    <View
                      style={{ width: 1, flex: 1, backgroundColor: palette.border, marginTop: 4 }}
                    />
                  )}
                </View>
                <View style={{ flex: 1, paddingBottom: 18 }}>
                  <Label size={12} weight="medium">
                    {event.title}
                  </Label>
                  <Label size={10} muted>
                    {new Date(event.timestamp).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Label>
                </View>
              </View>
            ))}
          </View>
          <Button
            label="Voltar para minhas viagens"
            onPress={() => navigate('trips', undefined, true)}
            style={{ marginTop: 14 }}
          />
          <DemoBanner />
        </>
      )}
    </Screen>
  );
}
