import type { SensorAdapter } from './model';
export async function createSensorAdapter(): Promise<SensorAdapter> {
  throw new Error(
    'Para conectar um sensor real, abra o aplicativo Android ou iOS em um development build.',
  );
}
