import { Pressable, StyleSheet, View } from 'react-native';
import { Bell, Bluetooth, FlaskConical, Route, Thermometer, UserRound } from 'lucide-react-native';
import { useOperations } from '@/features/operations/OperationsProvider';
import { colors, useTheme } from '@/shared/theme';
import { navigate, type AppRoute } from '@/shared/navigation';
import { Badge, Label } from './primitives';
import { env } from '@/core/config/env';
export function ConnectionBar() {
  const ops = useOperations();
  const pending = Object.values(ops.queueCount).reduce((sum, value) => sum + value, 0);
  return (
    <View style={styles.connection}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Gerenciar sensor"
        onPress={() => navigate('pairing')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
      >
        <Bluetooth
          size={13}
          color={ops.sensorStatus === 'connected' ? colors.green : colors.muted}
        />
        <Badge
          label={
            ops.sensorStatus === 'connected'
              ? 'Sensor conectado'
              : ops.sensorStatus === 'scanning'
                ? 'Buscando sensor'
                : 'Sem sensor'
          }
          tone={ops.sensorStatus === 'connected' ? 'success' : 'neutral'}
          dot={false}
        />
      </Pressable>
      <Badge
        label={ops.online ? 'Online' : pending ? `Offline · ${pending} na fila` : 'Offline'}
        tone={ops.online ? 'success' : 'warning'}
      />
    </View>
  );
}
export function DemoBanner() {
  if (!env.demo) return null;
  return (
    <View style={styles.demo}>
      <FlaskConical size={12} color={colors.muted} />
      <Label muted size={10}>
        Ambiente de demonstração · dados simulados
      </Label>
    </View>
  );
}
export function BottomTabs({ active }: { active: 'trips' | 'monitor' | 'alerts' | 'profile' }) {
  const { palette } = useTheme();
  const alerts = useOperations().alerts.data?.filter((alert) => !alert.resolvedAt).length ?? 0;
  const tabs: { route: AppRoute; label: string; icon: typeof Route }[] = [
    { route: 'trips', label: 'Viagens', icon: Route },
    { route: 'monitor', label: 'Monitor', icon: Thermometer },
    { route: 'alerts', label: 'Alertas', icon: Bell },
    { route: 'profile', label: 'Perfil', icon: UserRound },
  ];
  return (
    <View style={[styles.tabs, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      {tabs.map(({ route, label, icon: Icon }) => (
        <Pressable
          key={route}
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{ selected: route === active }}
          onPress={() => navigate(route, undefined, true)}
          style={styles.tab}
        >
          <View style={[styles.tabIcon, route === active && { backgroundColor: palette.info }]}>
            <Icon
              size={20}
              strokeWidth={route === active ? 2 : 1.6}
              color={route === active ? colors.blue : palette.muted}
            />
            {route === 'alerts' && alerts > 0 && <View style={styles.alertDot} />}
          </View>
          <Label
            size={10}
            weight={route === active ? 'semibold' : 'medium'}
            style={{ color: route === active ? colors.blue : palette.muted }}
          >
            {label}
          </Label>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  connection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 22,
  },
  demo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  tabs: { borderTopWidth: 1, flexDirection: 'row', paddingTop: 8, paddingBottom: 5 },
  tab: { flex: 1, alignItems: 'center', gap: 3, minHeight: 56 },
  tabIcon: {
    width: 48,
    height: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  alertDot: {
    position: 'absolute',
    top: 1,
    right: 9,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.red,
  },
});
