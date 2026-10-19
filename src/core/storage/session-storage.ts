import * as SecureStore from 'expo-secure-store';
import { storageScope } from '@/core/config/storage-scope';

export interface SessionStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}
const KEY = `koda.driver.${storageScope}.session.v2`;
export const sessionStorage: SessionStorage = {
  read: () => SecureStore.getItemAsync(KEY),
  write: (value) =>
    SecureStore.setItemAsync(KEY, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
