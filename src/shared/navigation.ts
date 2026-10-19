import { router, type Href } from 'expo-router';
export type AppRoute =
  'trips' | 'pairing' | 'detail' | 'monitor' | 'contingency' | 'summary' | 'alerts' | 'profile';
export function navigate(screen: AppRoute, id?: string, replace = false) {
  const destination = { pathname: `/${screen}`, params: id ? { id } : {} } as Href;
  if (replace) router.dismissTo(destination);
  else router.navigate(destination);
}
