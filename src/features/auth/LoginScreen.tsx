import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, LockKeyhole, Mail, Moon, Sun, TriangleAlert } from 'lucide-react-native';
import { KodaLogo } from '@/shared/components/primitives';
import { env } from '@/core/config/env';
import { useAuth } from './AuthProvider';
import { credentialsSchema, type Credentials } from './model';
import { colors, fonts, useTheme } from '@/shared/theme';
import { Button, Copyright, Notice } from '@/shared/ui';

export function LoginScreen() {
  const { signIn, notice } = useAuth();
  const { dark, toggle, palette } = useTheme();
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '', password: '' },
  });
  const submit = handleSubmit(async (credentials) => {
    setError(null);
    setToast(null);
    try {
      await signIn(credentials);
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : 'Não foi possível entrar. Tente novamente.';
      setError(
        message === 'Acesso permitido apenas para motoristas.'
          ? 'Verifique suas credenciais e tente novamente.'
          : message,
      );
      setToast(message);
    }
  });
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <KodaLogo />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={dark ? 'Ativar tema claro' : 'Ativar tema escuro'}
              hitSlop={12}
              onPress={toggle}
              style={styles.themeButton}
            >
              {dark ? (
                <Sun size={20} color={palette.muted} />
              ) : (
                <Moon size={20} color={palette.muted} />
              )}
            </Pressable>
          </View>
          <Text accessibilityRole="header" style={[styles.headline, { color: palette.text }]}>
            Cada grau importa.{'\n'}Cada viagem também.
          </Text>
          <Text style={[styles.intro, { color: palette.muted }]}>
            Sua carga conectada. Sua viagem sob controle.
          </Text>

          <View
            style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
          >
            <Text accessibilityRole="header" style={[styles.cardTitle, { color: palette.text }]}>
              Bem-vindo de volta
            </Text>
            <Text style={[styles.cardSubtitle, { color: palette.muted }]}>
              Entre na sua conta para seguir viagem.
            </Text>
            <Text style={[styles.label, { color: palette.text }]}>E-mail Corporativo</Text>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <View
                  style={[
                    styles.inputShell,
                    {
                      backgroundColor: palette.input,
                      borderColor: errors.email
                        ? '#FF3B30'
                        : focused === 'email'
                          ? colors.blue
                          : palette.border,
                    },
                  ]}
                >
                  <Mail size={18} color={palette.muted} />
                  <TextInput
                    accessibilityLabel="E-mail Corporativo"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoComplete="email"
                    textContentType="username"
                    returnKeyType="next"
                    placeholder="joao.hanel@kodalogtech.com"
                    placeholderTextColor={palette.text}
                    value={value}
                    onChangeText={(text) => {
                      onChange(text);
                      setError(null);
                    }}
                    onFocus={() => setFocused('email')}
                    onBlur={() => {
                      onBlur();
                      setFocused(null);
                    }}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    style={[styles.input, { color: palette.text }]}
                  />
                </View>
              )}
            />
            {errors.email && (
              <Text accessibilityRole="alert" style={styles.fieldError}>
                {errors.email.message}
              </Text>
            )}
            <Text style={[styles.label, styles.passwordLabel, { color: palette.text }]}>Senha</Text>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <View
                  style={[
                    styles.inputShell,
                    {
                      backgroundColor: palette.input,
                      borderColor:
                        error || errors.password
                          ? '#FF3B30'
                          : focused === 'password'
                            ? colors.blue
                            : palette.border,
                    },
                    focused === 'password' && !error && styles.inputFocus,
                  ]}
                >
                  <LockKeyhole
                    size={18}
                    color={
                      error || errors.password
                        ? '#FF3B30'
                        : focused === 'password'
                          ? colors.blue
                          : palette.muted
                    }
                  />
                  <TextInput
                    ref={passwordRef}
                    accessibilityLabel="Senha"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    textContentType="password"
                    secureTextEntry={!visible}
                    returnKeyType="go"
                    value={value}
                    onChangeText={(text) => {
                      onChange(text);
                      setError(null);
                    }}
                    onFocus={() => setFocused('password')}
                    onBlur={() => {
                      onBlur();
                      setFocused(null);
                    }}
                    onSubmitEditing={() => {
                      if (!isSubmitting) void submit();
                    }}
                    style={[
                      styles.input,
                      { color: palette.text },
                      !visible && { letterSpacing: 5 },
                    ]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={visible ? 'Ocultar senha' : 'Mostrar senha'}
                    hitSlop={10}
                    onPress={() => setVisible((value) => !value)}
                  >
                    {visible ? (
                      <EyeOff size={20} color={palette.muted} />
                    ) : (
                      <Eye size={20} color={palette.muted} />
                    )}
                  </Pressable>
                </View>
              )}
            />
            {(error || errors.password || notice) && (
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={styles.fieldError}
              >
                {error || errors.password?.message || notice}
              </Text>
            )}
            <Button
              label="Entrar"
              onPress={() => void submit()}
              loading={isSubmitting}
              style={styles.submit}
            />
          </View>
          <View
            style={[styles.info, { backgroundColor: palette.info, borderColor: palette.border }]}
          >
            <TriangleAlert size={18} color={colors.blue} style={{ marginTop: 1 }} />
            <Text style={[styles.infoText, { color: palette.muted }]}>
              O acesso ao Koda App é restrito a motoristas vinculados a um centro logístico. Para
              suporte, contate o operador da central.
            </Text>
          </View>
          {env.demo && (
            <Text
              style={[
                styles.infoText,
                { color: palette.muted, textAlign: 'center', marginTop: 16 },
              ]}
            >
              Demonstração · joao.hanel@kodalogtech.com{'\n'}Senha: Koda@2026
            </Text>
          )}
          <View style={styles.footer}>
            <Copyright dark={dark} />
          </View>
        </ScrollView>
        {toast && <Notice message={toast} onDismiss={() => setToast(null)} />}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logo: {
    fontFamily: fonts.bold,
    color: colors.blue,
    fontSize: 34,
    lineHeight: 43,
    letterSpacing: 0.5,
  },
  logtech: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, letterSpacing: 2.5 },
  themeButton: { padding: 12, marginRight: 0 },
  headline: {
    fontFamily: fonts.bold,
    fontSize: 31,
    lineHeight: 38,
    letterSpacing: -1,
    marginTop: 44,
  },
  intro: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, marginTop: 12 },
  card: { marginTop: 27, padding: 24, borderWidth: 1, borderRadius: 22 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 28 },
  cardSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 3,
    marginBottom: 15,
  },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 20, marginBottom: 7 },
  passwordLabel: { marginTop: 18 },
  inputShell: {
    height: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputFocus: { boxShadow: '0px 0px 0px 3px rgba(33,150,255,0.10)' },
  input: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    fontFamily: fonts.regular,
    fontSize: 14,
    padding: 0,
    borderWidth: 0,
    outlineStyle: 'solid',
    outlineColor: 'transparent',
    outlineWidth: 0,
  },
  fieldError: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: '#EF3024',
    marginTop: 10,
  },
  submit: { marginTop: 18 },
  info: {
    marginTop: 24,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 12,
  },
  infoText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  footer: { flexGrow: 1, justifyContent: 'flex-end', paddingTop: 20 },
});
