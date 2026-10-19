import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Bell, RefreshCw, Route, Search, X } from 'lucide-react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { useOperations } from '@/features/operations/OperationsProvider';
import { colors, fonts, useTheme } from '@/shared/theme';
import { navigate } from '@/shared/navigation';
import { BottomTabs, ConnectionBar, DemoBanner } from '@/shared/components/AppChrome';
import {
  Card,
  EmptyState,
  Eyebrow,
  IconButton,
  Info,
  Label,
  Screen,
  SectionTitle,
  layout,
} from '@/shared/components/primitives';
import { filterTrips, tripSummary, type TripFilter } from './model';
import { TripCard } from './TripCard';
import { useStartTrip } from './useStartTrip';
import { Button } from '@/shared/ui';
const filters: { key: TripFilter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'in_transit', label: 'Em trânsito' },
  { key: 'at_warehouse', label: 'Armazém' },
  { key: 'completed', label: 'Entregues' },
];
export function TripsScreen() {
  const { session } = useAuth();
  const ops = useOperations();
  const { palette } = useTheme();
  const { start, modal } = useStartTrip();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TripFilter>('all');
  const data = ops.trips.data ?? [];
  const counts = tripSummary(data);
  const visible = filterTrips(data, filter, search);
  return (
    <Screen footer={<BottomTabs active="trips" />}>
      <View style={styles.header}>
        <View>
          <Eyebrow>Bom trabalho, motorista</Eyebrow>
          <Label weight="semibold" size={27} style={{ marginTop: 4 }}>
            Olá, {session?.user.name.split(' ')[0]}
            <Label size={27} style={{ color: colors.blue }}>
              .
            </Label>
          </Label>
          <Label muted size={11}>
            {session?.user.logistics_center ?? 'Koda Logtech'}
          </Label>
        </View>
        <IconButton icon={Bell} label="Abrir alertas" onPress={() => navigate('alerts')} />
      </View>
      <ConnectionBar />
      <View style={layout.grid}>
        <View style={styles.primaryStat}>
          <Eyebrow>
            <Label size={10} style={{ color: '#A6C5D1' }}>
              A CAMINHO
            </Label>
          </Eyebrow>
          <Label size={34} weight="semibold" style={{ color: '#FFF', marginTop: 6 }}>
            {ops.trips.data ? counts.pending.toString().padStart(2, '0') : '—'}
          </Label>
          <Label size={11} style={{ color: '#C1D5DE' }}>
            viagens pendentes
          </Label>
        </View>
        <Card style={{ flex: 1, justifyContent: 'center' }}>
          <Eyebrow>Entregas hoje</Eyebrow>
          <Label size={34} weight="semibold" style={{ marginTop: 6 }}>
            {ops.trips.data ? counts.completedToday.toString().padStart(2, '0') : '—'}
          </Label>
          <Label size={11} muted>
            missões concluídas
          </Label>
        </Card>
      </View>
      <View
        style={[styles.search, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        <Search size={18} color={palette.muted} />
        <TextInput
          accessibilityLabel="Buscar viagens"
          placeholder="Cliente, placa ou carga"
          placeholderTextColor={palette.muted}
          value={search}
          onChangeText={setSearch}
          style={[styles.input, { color: palette.text }]}
        />
        {!!search && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Limpar busca"
            hitSlop={10}
            onPress={() => setSearch('')}
          >
            <X size={16} color={palette.muted} />
          </Pressable>
        )}
      </View>
      <View style={styles.filters}>
        {filters.map((item) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: filter === item.key }}
            key={item.key}
            onPress={() => setFilter(item.key)}
            style={[
              styles.filter,
              {
                backgroundColor: filter === item.key ? colors.navy : palette.surface,
                borderColor: filter === item.key ? colors.navy : palette.border,
              },
            ]}
          >
            <Label
              size={10}
              weight="medium"
              style={{ color: filter === item.key ? '#FFF' : palette.muted }}
            >
              {item.label}
            </Label>
          </Pressable>
        ))}
      </View>
      <SectionTitle
        title="Suas viagens"
        trailing={
          <IconButton
            icon={RefreshCw}
            label="Atualizar viagens"
            onPress={() => {
              void ops.trips.refetch();
            }}
          />
        }
      />
      {ops.trips.isPending && <ActivityIndicator color={colors.blue} />}
      {ops.trips.isError && <Info tone="danger">{ops.trips.error.message}</Info>}
      {visible.map((trip) => (
        <TripCard
          key={trip.id}
          trip={trip}
          onDetail={() => navigate('detail', trip.id)}
          onStart={() => {
            void start(trip.id);
          }}
          onMonitor={() => navigate(trip.status === 'completed' ? 'summary' : 'monitor', trip.id)}
          starting={ops.busyTrip === trip.id}
          disabled={!!ops.busyTrip}
        />
      ))}
      {!ops.trips.isPending && !ops.trips.isError && !visible.length && (
        <EmptyState
          icon={Route}
          title="Tudo tranquilo por aqui"
          description={
            search || filter !== 'all'
              ? 'Nenhuma viagem corresponde à sua busca.'
              : 'As próximas viagens designadas aparecerão aqui.'
          }
        >
          <Button
            label="Ver todas as viagens"
            outline
            onPress={() => {
              setFilter('all');
              setSearch('');
            }}
          />
        </EmptyState>
      )}
      <DemoBanner />
      {modal}
    </Screen>
  );
}
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 26,
    paddingBottom: 22,
  },
  primaryStat: { flex: 1, padding: 18, borderRadius: 20, backgroundColor: colors.navy },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    marginTop: 24,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 48,
    fontSize: 13,
    fontFamily: fonts.regular,
    padding: 0,
    outlineWidth: 0,
  },
  filters: { flexDirection: 'row', gap: 6, marginTop: 12 },
  filter: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
});
