import type { SessionStorage } from './session-storage';

// Browser preview keeps credentials in memory; JWTs are never put in localStorage.
let value: string | null = null;
export const sessionStorage: SessionStorage = {
  read: async () => value,
  write: async (next) => {
    value = next;
  },
  clear: async () => {
    value = null;
  },
};
