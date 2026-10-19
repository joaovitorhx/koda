import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ArrowUpRight, X, type LucideIcon } from 'lucide-react-native';
import { router } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import { colors, fonts, useTheme } from '@/shared/theme';

export function Label({
  children,
  style,
  muted = false,
  size = 14,
  weight = 'regular',
  ...props
}: PropsWithChildren<{
  style?: StyleProp<TextStyle>;
  muted?: boolean;
  size?: number;
  weight?: keyof typeof fonts;
  numberOfLines?: number;
  accessibilityRole?: 'header' | 'alert';
  testID?: string;
}>) {
  const { palette } = useTheme();
  return (
    <Text
      {...props}
      style={[
        {
          color: muted ? palette.muted : palette.text,
          fontFamily: fonts[weight],
          fontSize: size,
          lineHeight: size * 1.5,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Eyebrow({ children, style }: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return (
    <Label
      size={10}
      weight="semibold"
      muted
      style={[{ letterSpacing: 1.6, textTransform: 'uppercase' }, style]}
    >
      {children}
    </Label>
  );
}
export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Screen({
  children,
  footer,
  scroll = true,
}: PropsWithChildren<{ footer?: ReactNode; scroll?: boolean }>) {
  const { palette, dark } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={styles.frame}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          children
        )}
        {footer}
      </View>
    </SafeAreaView>
  );
}
export function Header({
  title,
  subtitle,
  back = false,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {back && (
        <IconButton
          icon={ArrowLeft}
          label="Voltar"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/trips'))}
        />
      )}
      <View style={{ flex: 1 }}>
        <Label weight="semibold" size={20} accessibilityRole="header">
          {title}
        </Label>
        {subtitle && (
          <Label muted size={11}>
            {subtitle}
          </Label>
        )}
      </View>
      {right}
    </View>
  );
}
export function IconButton({
  icon: Icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress(): void;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          borderColor: palette.border,
          backgroundColor: palette.surface,
          opacity: pressed ? 0.5 : 1,
        },
      ]}
    >
      <Icon size={19} color={palette.text} strokeWidth={1.8} />
    </Pressable>
  );
}
export type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';
export function Badge({
  label,
  tone = 'neutral',
  dot = true,
}: {
  label: string;
  tone?: Tone;
  dot?: boolean;
}) {
  const { palette, dark } = useTheme();
  const lightColor =
    tone === 'success'
      ? colors.green
      : tone === 'danger'
        ? colors.red
        : tone === 'warning'
          ? colors.amber
          : tone === 'info'
            ? colors.blue
            : palette.muted;
  const color = dark
    ? {
        success: '#7DD4B2',
        danger: '#FFADA3',
        warning: '#F2CD83',
        info: '#79CDDF',
        neutral: palette.muted,
      }[tone]
    : lightColor;
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: tone === 'neutral' ? palette.input : palette[tone] },
      ]}
    >
      {dot && <View style={{ height: 5, width: 5, borderRadius: 3, backgroundColor: color }} />}
      <Text style={{ color, fontFamily: fonts.semibold, fontSize: 10, lineHeight: 15 }}>
        {label}
      </Text>
    </View>
  );
}
export function SectionTitle({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Label size={15} weight="semibold">
        {title}
      </Label>
      {trailing}
    </View>
  );
}
export function Info({
  children,
  tone = 'info',
  icon: Icon,
}: PropsWithChildren<{ tone?: Tone; icon?: LucideIcon }>) {
  const { palette } = useTheme();
  return (
    <View
      style={[styles.info, { backgroundColor: tone === 'neutral' ? palette.input : palette[tone] }]}
    >
      {Icon && (
        <Icon
          size={18}
          color={tone === 'danger' ? colors.red : colors.blue}
          style={{ marginTop: 2 }}
        />
      )}
      <View style={{ flex: 1 }}>
        <Label size={12} muted>
          {children}
        </Label>
      </View>
    </View>
  );
}
export function Sheet({
  visible,
  title,
  onClose,
  children,
  dismissible = true,
}: PropsWithChildren<{ visible: boolean; title: string; onClose(): void; dismissible?: boolean }>) {
  const { palette } = useTheme();
  if (!visible) return null;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (dismissible) onClose();
      }}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Fechar modal"
          accessibilityRole="button"
          disabled={!dismissible}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: palette.surface }]}>
          <View style={[styles.handle, { backgroundColor: palette.border }]} />
          <View style={styles.sheetHeader}>
            <Label size={21} weight="semibold" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </Label>
            {dismissible && <IconButton icon={X} label="Fechar" onPress={onClose} />}
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 16, paddingBottom: 16 }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: PropsWithChildren<{ icon: LucideIcon; title: string; description: string }>) {
  const { palette } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: palette.info }]}>
        <Icon size={30} color={colors.blue} strokeWidth={1.5} />
      </View>
      <Label size={20} weight="semibold" style={{ textAlign: 'center' }}>
        {title}
      </Label>
      <Label muted size={13} style={{ textAlign: 'center', maxWidth: 290 }}>
        {description}
      </Label>
      {children}
    </View>
  );
}
export function TextLink({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.textLink}
    >
      <Label size={12} weight="semibold" style={{ color: colors.blue }}>
        {label}
      </Label>
      <ArrowUpRight size={15} color={colors.blue} />
    </Pressable>
  );
}
export function KodaLogo() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          height: 34,
          width: 34,
          borderRadius: 10,
          backgroundColor: colors.blue,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#FFF', fontFamily: fonts.bold, fontSize: 23 }}>k</Text>
      </View>
      <Label size={24} weight="bold" style={{ letterSpacing: -1 }}>
        koda
        <Label size={24} style={{ color: colors.blue }}>
          .
        </Label>
      </Label>
    </View>
  );
}
export const layout = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  stack: { gap: 16 },
  grid: { flexDirection: 'row', gap: 10 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },
});
const styles = StyleSheet.create({
  frame: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center' },
  content: { paddingHorizontal: 22, paddingBottom: 24, flexGrow: 1 },
  card: { padding: 18, borderRadius: 20, borderWidth: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 20,
    paddingBottom: 22,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 24,
    marginBottom: 12,
  },
  info: { padding: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(9,24,32,0.48)',
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 24,
  },
  handle: { height: 4, width: 36, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  empty: { paddingVertical: 36, alignItems: 'center', gap: 14 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  textLink: { minHeight: 44, flexDirection: 'row', gap: 5, alignItems: 'center' },
});
