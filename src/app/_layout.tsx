import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { OperationsProvider } from '@/features/operations/OperationsProvider';
import { CriticalAlert } from '@/features/alerts/CriticalAlert';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { PermissionsProvider, usePermissions } from '@/features/permissions/PermissionsProvider';
import { KodaThemeProvider } from '@/shared/theme';
import { LoadingScreen } from '@/shared/ui';

void SplashScreen.preventAutoHideAsync();
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function Routes() {
  const { session, loading } = useAuth();
  const { ready } = usePermissions();
  if (loading) return <LoadingScreen />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: '#F4F7F6' },
      }}
    >
      <Stack.Protected guard={!session}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !ready}>
        <Stack.Screen name="permissions" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && ready}>
        <Stack.Screen name="pairing" />
        <Stack.Screen name="trips" />
        <Stack.Screen name="detail" />
        <Stack.Screen name="monitor" />
        <Stack.Screen name="contingency" />
        <Stack.Screen name="summary" />
        <Stack.Screen name="alerts" />
        <Stack.Screen name="profile" />
      </Stack.Protected>
    </Stack>
  );
}
function SessionRoutes() {
  const { session } = useAuth();
  return (
    <PermissionsProvider key={session?.user.id ?? 'anonymous'}>
      {session ? (
        <OperationsProvider>
          <Routes />
          <CriticalAlert />
        </OperationsProvider>
      ) : (
        <Routes />
      )}
    </PermissionsProvider>
  );
}
export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <KodaThemeProvider>
          <AuthProvider>
            <SessionRoutes />
          </AuthProvider>
        </KodaThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
