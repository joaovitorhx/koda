import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { Bell, Bluetooth, MapPin, ShieldCheck } from 'lucide-react-native';
import { colors } from '@/shared/theme';
import { Button, Copyright } from '@/shared/ui';
import {
  Card,
  Eyebrow,
  Info,
  KodaLogo,
  Label,
  Screen,
  layout,
} from '@/shared/components/primitives';
import { DemoBanner } from '@/shared/components/AppChrome';
import { env } from '@/core/config/env';
import { requestAccess } from './service';
import { usePermissions } from './PermissionsProvider';
const permissions = [
  {
    icon: Bluetooth,
    title: 'Bluetooth',
    description: 'Conecta o celular ao sensor de temperatura da carga.',
  },
  {
    icon: MapPin,
    title: 'Localização precisa',
    description:
      'Associa cada leitura à viagem, inclusive com a tela apagada. Escolha permitir sempre.',
  },
  {
    icon: Bell,
    title: 'Notificações',
    description: 'Permite que o aparelho receba os avisos da operação.',
  },
];
export function PermissionsScreen() {
  const { complete } = usePermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const allow = async () => {
    setBusy(true);
    setError(null);
    try {
      if (env.demo || Platform.OS === 'web') {
        complete();
        return;
      }
      const result = await requestAccess();
      if (result.bluetooth && result.location && result.background && result.notifications)
        complete();
      else {
        setError(
          `Permita ${[!result.bluetooth && 'Bluetooth', !result.location && 'localização precisa', !result.background && 'localização em segundo plano (Sempre)', !result.notifications && 'notificações'].filter(Boolean).join(', ')} para continuar.`,
        );
        setBlocked(result.blocked);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível solicitar os acessos.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <View style={{ paddingTop: 32, flex: 1 }}>
        <KodaLogo />
        {Platform.OS === 'web' && !env.demo && (
          <Info>
            O navegador permite consultar a operação. Bluetooth requer o aplicativo instalado; os
            acessos do aparelho serão solicitados nele.
          </Info>
        )}
        <View style={{ marginTop: 40, gap: 10 }}>
          <Eyebrow>VAMOS PREPARAR SUA VIAGEM</Eyebrow>
          <Label
            accessibilityRole="header"
            size={30}
            weight="semibold"
            style={{ letterSpacing: -1 }}
          >
            Tudo conectado.{'\n'}Tudo sob controle.
          </Label>
          <Label size={14} muted>
            Precisamos de três acessos para acompanhar sua carga com você.
          </Label>
        </View>
        <Card style={{ marginTop: 28, gap: 24 }}>
          <Eyebrow>ACESSOS NECESSÁRIOS</Eyebrow>
          {permissions.map(({ icon: Icon, title, description }) => (
            <View key={title} style={[layout.row, { alignItems: 'flex-start' }]}>
              <Icon size={23} color={colors.blue} strokeWidth={1.6} />
              <View style={{ flex: 1 }}>
                <Label size={14} weight="semibold">
                  {title}
                </Label>
                <Label size={12} muted style={{ marginTop: 4 }}>
                  {description}
                </Label>
              </View>
            </View>
          ))}
        </Card>
        <View style={{ marginTop: 20 }}>
          <Info icon={ShieldCheck}>
            Durante uma viagem ativa, o Koda coleta localização e temperatura mesmo com a tela
            apagada ou outro aplicativo aberto. A coleta para ao concluir a viagem ou sair da conta.
          </Info>
        </View>
        {error && (
          <Label accessibilityRole="alert" size={13} style={{ color: colors.red, marginTop: 16 }}>
            {error}
          </Label>
        )}
        {blocked && (
          <Button
            label="Abrir configurações"
            outline
            onPress={() =>
              void Linking.openSettings().catch(() =>
                setError('Abra as configurações do aplicativo no aparelho.'),
              )
            }
            style={{ marginTop: 12 }}
          />
        )}
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingTop: 32 }}>
          <Button
            label={
              Platform.OS === 'web' && !env.demo ? 'Continuar no navegador' : 'Permitir e continuar'
            }
            loading={busy}
            onPress={() => void allow()}
          />
          <DemoBanner />
          <Copyright />
        </View>
      </View>
    </Screen>
  );
}
