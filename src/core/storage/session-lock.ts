// Share the write order between React authentication and native background work.
let pending = Promise.resolve();
export function persistSession(action: () => Promise<void>) {
  const next = pending.catch(() => {}).then(action);
  pending = next;
  return next;
}
