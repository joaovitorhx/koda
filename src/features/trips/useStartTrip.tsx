import { useState } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react-native';
import { useOperations } from '@/features/operations/OperationsProvider';
import { navigate } from '@/shared/navigation';
import { Button } from '@/shared/ui';
import { EmptyState, Info, Sheet } from '@/shared/components/primitives';
export function useStartTrip() {
  const ops = useOperations();
  const [attempt, setAttempt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const start = async (id: string) => {
    setAttempt(id);
    setError(null);
    try {
      await ops.start(id);
      setAttempt(null);
      navigate('monitor', id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível iniciar a viagem.');
    }
  };
  const modal = (
    <Sheet
      visible={!!error}
      title={ops.online ? 'Não foi possível iniciar' : 'Sem conexão com a central'}
      onClose={() => setError(null)}
    >
      <EmptyState
        icon={WifiOff}
        title={ops.online ? 'Tente novamente' : 'Vamos reconectar?'}
        description={
          ops.online
            ? (error ?? '')
            : 'É necessário estar online para confirmar o aceite da viagem antes de sair do centro logístico.'
        }
      />
      <Info>O início só será confirmado depois que a central receber o aceite.</Info>
      <Button
        label="Tentar novamente"
        icon={RefreshCw}
        loading={!!ops.busyTrip}
        onPress={() => {
          if (attempt) void start(attempt);
        }}
      />
      <Button label="Fechar" outline onPress={() => setError(null)} />
    </Sheet>
  );
  return { start, modal };
}
