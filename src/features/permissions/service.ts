import { PermissionsAndroid, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { createSensorAdapter } from '@/features/sensors/adapter';

export interface PermissionResult {
  bluetooth: boolean;
  location: boolean;
  background: boolean;
  notifications: boolean;
  blocked: boolean;
}

async function bluetoothAccess(): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (Number(Platform.Version) < 31) return true; // BLE uses the separately requested fine-location permission.
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return Object.values(result).every((value) => value === PermissionsAndroid.RESULTS.GRANTED);
  }
  // Reuse the collector's native manager: a second manager could tear down an
  // already restored background connection when the permissions screen closes.
  return (await (await createSensorAdapter()).permissionStatus?.()) ?? false;
}

export async function requestAccess(): Promise<PermissionResult> {
  const location = await Location.requestForegroundPermissionsAsync();
  let bluetooth = false;
  try {
    bluetooth = await bluetoothAccess();
  } catch {
    /* Native module unavailable in Expo Go. */
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('thermal-alerts', {
      name: 'Alertas da carga',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const notification = await Notifications.requestPermissionsAsync();
  const background = location.granted ? await Location.requestBackgroundPermissionsAsync() : null;
  const precise =
    location.granted &&
    (Platform.OS === 'android'
      ? location.android?.accuracy === 'fine'
      : location.ios?.accuracy !== 'reduced');
  return {
    location: precise,
    background: background?.granted === true,
    bluetooth,
    notifications:
      notification.granted ||
      notification.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL,
    blocked:
      !location.canAskAgain || !notification.canAskAgain || !background?.canAskAgain || !bluetooth,
  };
}
