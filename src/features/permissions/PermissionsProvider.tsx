import { createContext, useContext, useState, type PropsWithChildren } from 'react';

const Context = createContext({ ready: false, complete: () => {} });
// Re-request/check with the OS each new authenticated session; no stale boolean persisted.
export function PermissionsProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  return (
    <Context.Provider value={{ ready, complete: () => setReady(true) }}>
      {children}
    </Context.Provider>
  );
}
export const usePermissions = () => useContext(Context);
