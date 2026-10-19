import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { TriangleAlert, X, type LucideIcon } from 'lucide-react-native';
import { colors, fonts, useTheme } from './theme';

export function Button({
  label,
  onPress,
  loading,
  disabled,
  outline,
  icon: Icon,
  style,
  compactLabel,
  danger,
}: {
  label: string;
  onPress(): void;
  loading?: boolean;
  disabled?: boolean;
  outline?: boolean;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
  compactLabel?: boolean;
  danger?: boolean;
}) {
  const { palette } = useTheme();
  const foreground = outline ? palette.text : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: outline ? palette.surface : danger ? colors.red : colors.blue,
          borderColor: outline ? palette.border : 'transparent',
          opacity: pressed || disabled ? 0.55 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {Icon && <Icon size={18} strokeWidth={1.8} color={foreground} />}
          <Text
            style={[styles.buttonText, { color: foreground, fontSize: compactLabel ? 12 : 14 }]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
export function Notice({ message, onDismiss }: { message: string; onDismiss(): void }) {
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.toast}>
      <TriangleAlert size={19} color="#FFF" />
      <Text style={styles.toastText}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar aviso"
        hitSlop={12}
        onPress={onDismiss}
      >
        <X size={18} color="#FFF" />
      </Pressable>
    </View>
  );
}
export function Copyright({ dark = false }: { dark?: boolean }) {
  return <Text style={[styles.copyright, dark && { color: '#93A9B5' }]}>© 2026 Koda Logtech</Text>;
}
export function LoadingScreen() {
  const { palette } = useTheme();
  return (
    <View style={[styles.loading, { backgroundColor: palette.background }]}>
      <ActivityIndicator size="large" color={colors.blue} accessibilityLabel="Carregando" />
    </View>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonText: { fontFamily: fonts.semibold, textAlign: 'center' },
  toast: {
    position: 'absolute',
    top: 16,
    left: 20,
    right: 20,
    padding: 18,
    borderRadius: 16,
    backgroundColor: colors.red,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 10,
  },
  toastText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, lineHeight: 20, color: '#FFF' },
  copyright: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: '#7E8D96',
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
