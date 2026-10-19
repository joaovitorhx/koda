import { useQuery } from '@tanstack/react-query';
import { getProfile } from '@/features/auth/service';
import { env } from '@/core/config/env';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Bluetooth, ChevronRight, LogOut, Moon, ShieldCheck, Sun } from 'lucide-react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { useOperations } from '@/features/operations/OperationsProvider';
import { BottomTabs, DemoBanner } from '@/shared/components/AppChrome';
import {
  Badge,
  Card,
  Header,
  Info,
  Label,
  Screen,
  SectionTitle,
  Sheet,
  layout,
} from '@/shared/components/primitives';
import { colors, useTheme } from '@/shared/theme';
import { Button } from '@/shared/ui';
import { navigate } from '@/shared/navigation';
export function ProfileScreen() {
  const { session, signOut } = useAuth();
  const ops = useOperations();
  const { dark, toggle, palette } = useTheme();
  const [leaving, setLeaving] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveLimit, setArchiveLimit] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const profile = useQuery({
    queryKey: ['profile', session?.user.id],
    queryFn: getProfile,
    enabled: !env.demo,
  });
  const user = profile.data ?? session!.user;
  const pending = Object.values(ops.queueCount).reduce((a, b) => a + b, 0);
  const items = [
    {
      icon: dark ? Sun : Moon,
      title: dark ? 'Ativar tema claro' : 'Ativar tema escuro',
      subtitle: 'Aparência do aplicativo',
      action: toggle,
    },
    {
      icon: Bluetooth,
      title: 'Sensor da carga',
      subtitle: ops.sensor?.name ?? 'Nenhum sensor conectado',
      action: () => navigate('pairing'),
    },
    {
      icon: ShieldCheck,
      title: 'Permissões do aplicativo',
      subtitle: 'Gerenciar os acessos no aparelho',
      action: () => {
        void Linking.openSettings().catch(() =>
          setError('No navegador, ajuste as permissões nas configurações do site.'),
        );
      },
    },
  ];
  return (
    <Screen footer={<BottomTabs active="profile" />}>
      {profile.isError && (
        <Info tone="warning">
          Não foi possível atualizar seu perfil. Exibindo os dados da sessão.
        </Info>
      )}
      <Header title="Meu perfil" subtitle="Sua operação, conectada" />
      <Card>
        <View style={layout.row}>
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: 18,
              backgroundColor: palette.info,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Label size={20} weight="semibold" style={{ color: colors.blue }}>
              {user.name
                .split(' ')
                .map((v) => v[0])
                .slice(0, 2)
                .join('')}
            </Label>
          </View>
          <View style={{ flex: 1 }}>
            <Label size={18} weight="semibold">
              {user.name}
            </Label>
            <Label size={11} muted>
              {user.email}
            </Label>
          </View>
        </View>
        <View style={[layout.between, { marginTop: 22 }]}>
          <Label size={12} muted>
            {user.logistics_center ?? 'Centro não informado'}
          </Label>
          <Badge label="Motorista" tone="success" />
        </View>
      </Card>
      {(pending > 0 || ops.archivedReadings.length > 0) && (
        <>
          <SectionTitle title="Leituras do aparelho" />
          <Card>
            {pending > 0 && (
              <>
                <Label size={13}>{pending} leitura(s) aguardando envio</Label>
                <Button
                  label={ops.syncing ? 'Sincronizando…' : 'Sincronizar leituras'}
                  disabled={ops.syncing || !ops.online}
                  outline
                  onPress={() => {
                    void ops.sync().catch((e: Error) => setError(e.message));
                  }}
                />
              </>
            )}
            {ops.archivedReadings.length > 0 && (
              <>
                <Label size={13}>
                  {ops.archivedReadings.length} leitura(s) preservada(s) fora do período da viagem
                </Label>
                <Label size={11} muted>
                  Disponíveis para conferência, sem bloquear as próximas entregas.
                </Label>
                <Button
                  label="Ver leituras preservadas"
                  outline
                  onPress={() => setArchiveOpen(true)}
                />
              </>
            )}
          </Card>
        </>
      )}
      <SectionTitle title="Preferências" />
      <Card style={{ paddingVertical: 2 }}>
        {items.map(({ icon: Icon, title, subtitle, action }, index) => (
          <Pressable
            key={title}
            accessibilityRole="button"
            accessibilityLabel={title}
            onPress={action}
            style={[
              layout.row,
              { paddingVertical: 20, borderTopWidth: index ? 1 : 0, borderColor: palette.border },
            ]}
          >
            <Icon size={20} color={colors.blue} />
            <View style={{ flex: 1 }}>
              <Label size={13} weight="medium">
                {title}
              </Label>
              <Label size={11} muted style={{ marginTop: 3 }}>
                {subtitle}
              </Label>
            </View>
            <ChevronRight size={16} color={palette.muted} />
          </Pressable>
        ))}
      </Card>
      <View style={{ marginTop: 20 }}>
        <Info icon={ShieldCheck}>
          A coleta de localização e temperatura acontece somente durante uma viagem ativa. Leituras
          pendentes são mantidas no aparelho até a sincronização.
        </Info>
      </View>
      {error && <Info tone="warning">{error}</Info>}
      <Button
        label="Sair da conta"
        icon={LogOut}
        outline
        onPress={() => setLeaving(true)}
        style={{ marginTop: 24 }}
      />
      <DemoBanner />
      <Sheet
        visible={archiveOpen}
        title="Leituras preservadas"
        onClose={() => setArchiveOpen(false)}
      >
        <Info>
          Estes registros foram recebidos pela central e guardados separadamente porque não
          pertencem ao período da viagem.
        </Info>
        {ops.archivedReadings.slice(0, archiveLimit).map((reading) => (
          <Card key={reading.id}>
            <View style={layout.between}>
              <Label size={13} weight="semibold">
                Viagem #{reading.tripId}
              </Label>
              <Label size={13}>{reading.temperature.toFixed(1)} °C</Label>
            </View>
            <Label size={11} muted>
              {new Date(reading.timestamp).toLocaleString('pt-BR')}
            </Label>
            <Label size={11} muted>
              {reading.reason === 'trip_not_started'
                ? 'Viagem ainda não iniciada'
                : 'Fora do período da viagem'}
            </Label>
          </Card>
        ))}
        {archiveLimit < ops.archivedReadings.length && (
          <Button label="Mostrar mais" outline onPress={() => setArchiveLimit((n) => n + 20)} />
        )}
      </Sheet>
      <Sheet visible={leaving} title="Sair da conta?" onClose={() => setLeaving(false)}>
        <Label muted size={13}>
          {ops.activeTripId
            ? 'O monitoramento neste aparelho será interrompido. Sua viagem continuará ativa na central.'
            : 'Você precisará entrar novamente para acessar suas viagens.'}
        </Label>
        {pending > 0 && (
          <Info tone="warning">
            {pending} leitura(s) pendente(s) ficarão salvas para sincronizar quando você voltar a
            esta conta.
          </Info>
        )}
        <Button label="Confirmar saída" danger onPress={() => void signOut()} />
        <Button label="Continuar no aplicativo" outline onPress={() => setLeaving(false)} />
      </Sheet>
    </Screen>
  );
}
