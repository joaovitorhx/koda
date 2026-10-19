import Constants from 'expo-constants';
export const env = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, ''),
  demo: __DEV__ && Constants.expoConfig?.extra?.demoMode === true,
  loginPath: '/users/login',
  refreshPath: '/users/refresh',
  profilePath: '/users/profile',
  logoutPath: '/users/logout',
  tripsPath: '/entregas/motorista',
  startPath: '/entregas/:id/iniciar',
  finishPath: '/entregas/:id/finalizar',
  reportPath: '/entregas/:id/resumo',
  readingsPath: '/entregas/:id/telemetria',
  alertsPath: '/alertas/motorista',
  telemetryPath: '/telemetria/lote',
  sensorPath: '/entregas/:id/sensor',
  contingencyPath: '/entregas/:id/contingencia',
  bleDeviceName: process.env.EXPO_PUBLIC_BLE_DEVICE_NAME ?? 'ESP32-DHT11',
  bleDeviceId: process.env.EXPO_PUBLIC_BLE_DEVICE_ID ?? '',
  bleServiceUuid:
    process.env.EXPO_PUBLIC_BLE_SERVICE_UUID ?? '11111111-2222-3333-4444-555555555555',
  bleCharacteristicUuid:
    process.env.EXPO_PUBLIC_BLE_CHARACTERISTIC_UUID ?? 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  centralPhone: process.env.EXPO_PUBLIC_CENTRAL_PHONE ?? '',
};
