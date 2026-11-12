import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';

import { useState } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Eye, EyeOff, UserPlus, X, ChevronDown } from 'lucide-react-native';

import { RootStackParamList } from '../navigation/AppNavigator';
import AppText from '../components/AppText';
import { useAuth } from '../context/AuthContext';
import { register, type RegisterRequestApi } from '../services/apiClient';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

type UserRole = 'TECNICO' | 'SUPERVISOR' | 'ADMIN';
const ROLES: { value: UserRole; label: string }[] = [
  { value: 'TECNICO', label: 'Técnico' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'ADMIN', label: 'Administrador' },
];

// ─────────────────────────────────────────────────────────────────
// Modal de cadastro
// ─────────────────────────────────────────────────────────────────

function RegisterModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('TECNICO');
  const [showPassword, setShowPassword] = useState(false);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [loading, setLoading] = useState(false);

  function resetForm() {
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setRole('TECNICO');
    setShowPassword(false);
  }

  async function handleRegister() {
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      Alert.alert('Campos obrigatórios', 'Preencha todos os campos.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Senhas diferentes', 'A confirmação de senha não confere.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Senha fraca', 'A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const data: RegisterRequestApi = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
      };
      await register(data);
      Alert.alert(
        'Conta criada!',
        `Usuário "${name.trim()}" cadastrado com sucesso. Faça login para continuar.`,
        [{ text: 'OK', onPress: () => { resetForm(); onClose(); } }],
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar conta.';
      Alert.alert('Falha no cadastro', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => { resetForm(); onClose(); }}
    >
      <Pressable
        style={styles.modalOverlay}
        onPress={() => { resetForm(); onClose(); }}
      >
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <AppText style={styles.modalTitle}>Criar conta</AppText>
            <TouchableOpacity onPress={() => { resetForm(); onClose(); }} activeOpacity={0.7}>
              <X size={22} color="#555" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Nome */}
            <AppText style={styles.fieldLabel}>Nome completo</AppText>
            <TextInput
              style={styles.input}
              placeholder="Seu nome"
              placeholderTextColor="#999"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              editable={!loading}
            />

            {/* E-mail */}
            <AppText style={styles.fieldLabel}>E-mail</AppText>
            <TextInput
              style={styles.input}
              placeholder="seu@email.com"
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              editable={!loading}
            />

            {/* Perfil */}
            <AppText style={styles.fieldLabel}>Perfil</AppText>
            <TouchableOpacity
              style={styles.rolePicker}
              onPress={() => setShowRolePicker((v) => !v)}
              activeOpacity={0.7}
            >
              <AppText style={styles.rolePickerText}>
                {ROLES.find((r) => r.value === role)?.label ?? 'Selecione'}
              </AppText>
              <ChevronDown size={18} color="#555" />
            </TouchableOpacity>
            {showRolePicker && (
              <View style={styles.roleOptions}>
                {ROLES.map((r) => (
                  <TouchableOpacity
                    key={r.value}
                    style={[
                      styles.roleOption,
                      role === r.value && styles.roleOptionSelected,
                    ]}
                    onPress={() => { setRole(r.value); setShowRolePicker(false); }}
                    activeOpacity={0.7}
                  >
                    <AppText
                      style={[
                        styles.roleOptionText,
                        role === r.value && styles.roleOptionTextSelected,
                      ]}
                    >
                      {r.label}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Senha */}
            <AppText style={styles.fieldLabel}>Senha</AppText>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor="#999"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <EyeOff size={20} color="#777" />
                ) : (
                  <Eye size={20} color="#777" />
                )}
              </TouchableOpacity>
            </View>

            {/* Confirmar senha */}
            <AppText style={styles.fieldLabel}>Confirmar senha</AppText>
            <TextInput
              style={[
                styles.input,
                confirmPassword && confirmPassword !== password
                  ? styles.inputError
                  : null,
              ]}
              placeholder="Repita a senha"
              placeholderTextColor="#999"
              secureTextEntry={!showPassword}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!loading}
            />
            {confirmPassword && confirmPassword !== password ? (
              <AppText style={styles.errorText}>As senhas não conferem.</AppText>
            ) : null}

            {/* Botão */}
            <TouchableOpacity
              style={[styles.registerBtn, loading && styles.registerBtnDisabled]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <AppText style={styles.registerBtnText}>CRIAR CONTA</AppText>
              )}
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tela de login
// ─────────────────────────────────────────────────────────────────

export default function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('Campos obrigatórios', 'Preencha o e-mail e a senha.');
      return;
    }

    setLoading(true);
    try {
      await login(email, password, rememberMe);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao realizar login.';
      Alert.alert('Falha no login', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* ── Header com logo ──────────────────────────── */}
      <View style={styles.form}>
        <Image source={require('../assets/logo.png')} style={styles.logo} />
        <AppText style={styles.subtitle}>
          PLATAFORMA DE INSPEÇÃO EM CAMPO
        </AppText>
      </View>

      <AppText style={styles.title}>Seja Bem-vindo(a)!</AppText>
      <AppText style={styles.text1}>Realize seu login para continuar</AppText>

      <View style={styles.margin}>
        {/* E-mail */}
        <TextInput
          style={[styles.input, styles.emailInput]}
          placeholder="E-MAIL"
          placeholderTextColor="#999"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />

        {/* Senha */}
        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="SENHA"
            placeholderTextColor="#999"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            editable={!loading}
            onSubmitEditing={handleLogin}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword((v) => !v)}
          >
            {showPassword ? (
              <EyeOff size={20} color="#777" />
            ) : (
              <Eye size={20} color="#777" />
            )}
          </TouchableOpacity>
        </View>

        {/* Lembrar-me */}
        <View style={styles.rememberContainer}>
          <TouchableOpacity
            style={[styles.switch, rememberMe && styles.switchActive]}
            onPress={() => setRememberMe((v) => !v)}
          >
            <View
              style={[
                styles.switchCircle,
                rememberMe && styles.switchCircleActive,
              ]}
            />
          </TouchableOpacity>
          <AppText style={styles.rememberText}>Lembrar-me</AppText>
        </View>

        {/* Botão Logar */}
        <TouchableOpacity
          style={[styles.loginButton, loading && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <AppText style={styles.loginButtonText}>LOGAR</AppText>
          )}
        </TouchableOpacity>

        {/* Criar conta */}
        <TouchableOpacity
          style={styles.registerLink}
          onPress={() => setShowRegister(true)}
          activeOpacity={0.7}
        >
          <UserPlus size={16} color="#24558A" />
          <AppText style={styles.registerLinkText}>Criar nova conta</AppText>
        </TouchableOpacity>

        <TouchableOpacity>
          <AppText style={styles.forgotPassword}>Esqueci minha senha</AppText>
        </TouchableOpacity>
      </View>

      {/* Modal de cadastro */}
      <RegisterModal
        visible={showRegister}
        onClose={() => setShowRegister(false)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// Estilos
// ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  form: {
    width: '100%',
    height: '45%',
    justifyContent: 'center',
    paddingHorizontal: 50,
    backgroundColor: '#132539',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    marginBottom: 20,
  },
  logo: {
    width: 200,
    height: 150,
    alignSelf: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 25,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    color: '#ffffff',
  },
  text1: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  margin: {
    alignSelf: 'center',
    paddingHorizontal: 30,
    width: '100%',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#B5B5B5',
    borderRadius: 9,
    paddingHorizontal: 15,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginBottom: 20,
  },
  emailInput: {
    marginBottom: 20,
  },
  inputError: {
    borderColor: '#E53935',
  },
  passwordContainer: {
    height: 50,
    borderWidth: 1,
    borderColor: '#B5B5B5',
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 15,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  eyeButton: {
    width: 45,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rememberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
    marginLeft: 8,
  },
  switch: {
    width: 45,
    height: 22,
    borderRadius: 15,
    backgroundColor: '#ccc',
    justifyContent: 'center',
    paddingHorizontal: 2,
    marginRight: 8,
  },
  switchActive: {
    backgroundColor: '#45A835',
  },
  switchCircle: {
    width: 18,
    height: 18,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  switchCircleActive: {
    alignSelf: 'flex-end',
  },
  rememberText: {
    fontSize: 12,
    color: '#333',
  },
  loginButton: {
    height: 38,
    borderRadius: 8,
    backgroundColor: '#45A835',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  registerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
    paddingVertical: 6,
  },
  registerLinkText: {
    color: '#24558A',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  forgotPassword: {
    textAlign: 'center',
    color: '#24558A',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },

  // ── Modal de cadastro ───────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#132539',
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#555',
    marginBottom: 6,
  },
  rolePicker: {
    height: 50,
    borderWidth: 1,
    borderColor: '#B5B5B5',
    borderRadius: 9,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rolePickerText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#132539',
  },
  roleOptions: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  roleOption: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  roleOptionSelected: {
    backgroundColor: '#F0FAF0',
  },
  roleOptionText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#132539',
  },
  roleOptionTextSelected: {
    fontFamily: 'Inter_700Bold',
    color: '#45A835',
  },
  errorText: {
    fontSize: 12,
    color: '#E53935',
    marginTop: -14,
    marginBottom: 10,
    marginLeft: 4,
    fontFamily: 'Inter_400Regular',
  },
  registerBtn: {
    height: 48,
    borderRadius: 8,
    backgroundColor: '#132539',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  registerBtnDisabled: {
    opacity: 0.6,
  },
  registerBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
});
