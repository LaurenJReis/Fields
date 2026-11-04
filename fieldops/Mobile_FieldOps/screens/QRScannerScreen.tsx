import { useState, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { ArrowLeft, ScanLine, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import NetInfo from '@react-native-community/netinfo';

import AppText from '../components/AppText';
import { RootStackParamList } from '../navigation/AppNavigator';
import { fetchEquipmentByQrCode } from '../services/apiClient';
import { getLocalInspection } from '../services/storage';
import type { EquipmentResponseApi } from '../types/api';

type ScannerRouteProp = RouteProp<RootStackParamList, 'QRScanner'>;
type ScannerNavProp = NativeStackNavigationProp<RootStackParamList>;

export default function QRScannerScreen() {
  const navigation = useNavigation<ScannerNavProp>();
  const route = useRoute<ScannerRouteProp>();
  const { inspectionId } = route.params;

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  // ── Permissão ainda não solicitada ───────────────────────
  if (!permission) {
    return <View style={styles.container} />;
  }

  // ── Permissão negada ─────────────────────────────────────
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#132539" />
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <AppText style={styles.headerTitle}>
            <AppText style={styles.headerField}>FIELD </AppText>
            <AppText style={styles.headerOps}>OPS</AppText>
          </AppText>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.permissionBox}>
          <ScanLine size={48} color="#132539" />
          <AppText style={styles.permissionTitle}>
            Permissão de câmera necessária
          </AppText>
          <AppText style={styles.permissionDesc}>
            Precisamos acessar a câmera para escanear o QR code do equipamento.
          </AppText>
          <TouchableOpacity
            style={styles.permissionBtn}
            onPress={requestPermission}
            activeOpacity={0.7}
          >
            <AppText style={styles.permissionBtnText}>Permitir câmera</AppText>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Leitura do QR code ───────────────────────────────────
  const handleBarCodeScanned = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      if (scanned || lookingUp) return;
      setScanned(true);
      setLookingUp(true);

      const inspectionIdNum = Number(inspectionId);

      // Verifica se está online
      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected ?? false;

      if (isOnline) {
        // Online: busca equipamento na API
        try {
          const equipment = await fetchEquipmentByQrCode(data);

          // Verifica se o QR code bate com o equipamento da inspeção
          const inspection = await getLocalInspection(inspectionIdNum);
          const qrMatch =
            !inspection?.equipmentQrCode ||
            inspection.equipmentQrCode === data;

          Alert.alert(
            qrMatch ? 'Equipamento identificado' : 'Atenção: QR não coincide',
            `${equipment.name}\n${equipment.siteName ?? ''}\nQR: ${data}\n\n${
              qrMatch
                ? 'Equipamento corresponde à inspeção.'
                : 'O QR code escaneado não corresponde ao equipamento da inspeção selecionada. Deseja continuar mesmo assim?'
            }`,
            [
              { text: 'Cancelar', onPress: () => { setScanned(false); setLookingUp(false); } },
              {
                text: 'Continuar',
                onPress: () => {
                  setLookingUp(false);
                  navigation.replace('ChecklistExecution', { inspectionId });
                },
              },
            ],
          );
        } catch {
          Alert.alert(
            'Equipamento não encontrado',
            `Nenhum equipamento cadastrado para o QR code: ${data}`,
            [
              { text: 'Escanear novamente', onPress: () => { setScanned(false); setLookingUp(false); } },
            ],
          );
        }
      } else {
        // Offline: valida contra a inspeção local
        const inspection = await getLocalInspection(inspectionIdNum);

        if (inspection?.equipmentQrCode && inspection.equipmentQrCode === data) {
          Alert.alert(
            'Equipamento identificado (offline)',
            `${inspection.equipmentName ?? 'Equipamento'}\nQR validado localmente.`,
            [
              {
                text: 'Iniciar inspeção',
                onPress: () => {
                  setLookingUp(false);
                  navigation.replace('ChecklistExecution', { inspectionId });
                },
              },
            ],
          );
        } else if (inspection?.equipmentQrCode) {
          Alert.alert(
            'QR não coincide',
            'O QR code escaneado não corresponde ao equipamento da inspeção.',
            [
              { text: 'Escanear novamente', onPress: () => { setScanned(false); setLookingUp(false); } },
              {
                text: 'Continuar mesmo assim',
                onPress: () => {
                  setLookingUp(false);
                  navigation.replace('ChecklistExecution', { inspectionId });
                },
              },
            ],
          );
        } else {
          // Sem QR code na inspeção local — permite prosseguir
          setLookingUp(false);
          navigation.replace('ChecklistExecution', { inspectionId });
        }
      }
    },
    [scanned, lookingUp, inspectionId, navigation],
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#132539" />

      {/* ── Header ───────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <AppText style={styles.headerTitle}>
          <AppText style={styles.headerField}>FIELD </AppText>
          <AppText style={styles.headerOps}>OPS</AppText>
        </AppText>
        <View style={styles.headerSpacer} />
      </View>

      {/* ── Câmera ───────────────────────────────────────── */}
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* ── Overlay com moldura ──────────────────────────── */}
      <View style={styles.overlay} pointerEvents="none">
        {/* Topo escurecido */}
        <View style={styles.overlayTop} />

        <View style={styles.overlayMiddle}>
          {/* Lateral esquerda */}
          <View style={styles.overlaySide} />

          {/* Janela transparente com moldura */}
          <View style={styles.scanWindow}>
            {/* Cantos da moldura */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>

          {/* Lateral direita */}
          <View style={styles.overlaySide} />
        </View>

        {/* Base escurecida com instrução */}
        <View style={styles.overlayBottom}>
          <ScanLine size={20} color="#FFFFFF" />
          <AppText style={styles.overlayHint}>
            Aponte para o QR code do equipamento
          </AppText>
        </View>
      </View>

      {/* ── Botão de reescanear (aparece após leitura falha) ── */}
      {scanned && !lookingUp && (
        <View style={styles.rescanContainer}>
          <TouchableOpacity
            style={styles.rescanBtn}
            onPress={() => setScanned(false)}
            activeOpacity={0.7}
          >
            <AppText style={styles.rescanText}>Escanear novamente</AppText>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Loading overlay ao buscar equipamento ──────────── */}
      {lookingUp && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#45A835" />
          <AppText style={styles.loadingText}>Identificando equipamento...</AppText>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Estilos
// ─────────────────────────────────────────────────────────────

const WINDOW_SIZE = 240;
const CORNER_SIZE = 22;
const CORNER_THICKNESS = 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#132539' },

  // Header
  header: {
    backgroundColor: '#132539',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 16,
    zIndex: 10,
  },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerField: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter_700Bold' },
  headerOps: { color: '#45A835', fontSize: 15, fontFamily: 'Inter_700Bold' },
  headerSpacer: { width: 30 },

  // Câmera — ocupa todo o espaço restante
  camera: { ...StyleSheet.absoluteFill, top: 62 },

  // Overlay escurecido ao redor da janela de scan
  overlay: {
    ...StyleSheet.absoluteFill,
    top: 62,
    flexDirection: 'column',
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: WINDOW_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  scanWindow: {
    width: WINDOW_SIZE,
    height: WINDOW_SIZE,
    backgroundColor: 'transparent',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    paddingTop: 24,
    gap: 8,
  },
  overlayHint: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    paddingHorizontal: 32,
  },

  // Cantos da moldura verde
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: '#45A835',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },

  // Reescanear
  rescanContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  rescanBtn: {
    backgroundColor: '#45A835',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  rescanText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },

  // Loading overlay
  loadingOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },

  // Permissão
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
    backgroundColor: '#FFFFFF',
  },
  permissionTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#132539',
    textAlign: 'center',
  },
  permissionDesc: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#555',
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionBtn: {
    marginTop: 8,
    backgroundColor: '#45A835',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  permissionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
});
