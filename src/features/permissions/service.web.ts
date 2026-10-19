import type { PermissionResult } from './service';

export async function requestAccess(): Promise<PermissionResult> {
  throw new Error(
    'Bluetooth e permissões da viagem estão disponíveis no aplicativo Android ou iOS.',
  );
}
