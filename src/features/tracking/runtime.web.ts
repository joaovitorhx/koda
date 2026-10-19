import type { TrackingContext, TrackingEvent } from './model';
export async function startTracking(_context: TrackingContext) {}
export async function stopTracking(_onlyIfActive = false) {}
export async function restoreTracking(_driverId?: string) {
  return null as TrackingContext | null;
}
export async function flushCapturedReadings() {}
export function subscribeTracking(_callback: (event: TrackingEvent) => void) {
  return () => {};
}
