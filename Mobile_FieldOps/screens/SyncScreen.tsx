import {
  useState,
  useEffect,
  useCallback,
} from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  Wifi,
  WifiOff,
  ClipboardList,
  RefreshCw,
  User,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import NetInfo from '@react-native-community/netinfo';

import AppText from '../components/AppText';
import { MainTabParamList } from '../navigation/AppNavigator';
import { useAuth } from '../context/AuthContext';
import {
  syncPendingOperations,
  getOutboxSummary,
  downloadInspections,
  type OutboxSummary,
} from '../services/syncEngine';
import { getLocalInspections } from '../services/storage';
import type { LocalInspection } from '../types/api';
import { inspectionStatusLabel } from '../types/api';

type SyncNavProp = BottomTabNavigationProp<MainTabParamList, 'Sincronizar'>;

// ─────────────────────────────────────────────────────────────
// Componente: card de inspeção com status de sync
// ─────────────────────────────────────────────────────────────

function InspectionSyncCard({
  inspection,
  summary,
}: {
  inspection: LocalInspection;
  summary: OutboxSummary;
}) {
  const hasPending = summary.pending > 0 || summary.failed > 0;
  const allSynced = summary.total > 0 && summary.pending === 0 && summary.failed === 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={styles.cardInfo}>
          <AppText style={styles.cardTitle}>{inspection.title}</AppText>
          <AppText style={styles.cardCode}>
            {inspection.code} · {inspectionStatusLabel(inspection.status)}
          </AppText>
          {summary.total > 0 && (
            <AppText style={styles.cardSyncInfo}>
              {summary.succeeded} ok · {summary.pending} pendentes · {summary.failed} falhas
            </AppText>
          )}
        </View>
        {hasPending ? (
          <UploadCloud size={24} color="#E65100" />
        ) : allSynced ? (
          <CheckCircle2 size={24} color="#45A835" />
        ) : (
          <Clock size={24} color="#BDBDBD" />
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Tela principal
// ─────────────────────────────────────────────────────────────

export default function SyncScreen() {
  const navigation = useNavigation<SyncNavProp>();
  const { user } = useAuth();

  const [isOnline, setIsOnline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [inspections, setInspections] = useState<LocalInspection[]>([]);
  const [summary, setSummary] = useState<OutboxSummary>({
    pending: 0,
    failed: 0,
    succeeded: 0,
    total: 0,
  });

  // Carrega dados locais
  const loadData = useCallback(async () => {
    const local = await getLocalInspections();
    setInspections(local);
    setSummary(await getOutboxSummary());
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Monitora rede
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? false);
    });
    return () => unsub();
  }, []);

  // Sincroniza operações pendentes
  const handleSync = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const result = await syncPendingOperations(user.id);
      await loadData();
      const msg = `Sincronização concluída: ${result.succeeded} ok, ${result.failed} falhas, ${result.skipped} ignoradas, ${result.evidenceUploaded} evidências enviadas.`;
      Alert.alert(result.failed > 0 ? 'Sincronização com falhas' : 'Sincronização concluída', msg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro na sincronização.';
      Alert.alert('Erro', msg);
    } finally {
      setSyncing(false);
    }
  }, [user, loadData]);

  // Download de inspeções
  const handleDownload = useCallback(async () => {
    if (!user) return;
    setDownloading(true);
    try {
      const count = await downloadInspections(user.id);
      await loadData();
      Alert.alert('Download concluído', `${count} inspeção(ões) baixada(s).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro no download.';
      Alert.alert('Falha', msg);
    } finally {
      setDownloading(false);
    }
  }, [user, loadData]);

  const hasPending = summary.pending > 0 || summary.failed > 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#132539" />

      {/* ── Header ─────────────────────────────────────── */}
      <View style={styles.header}>
        <AppText style={styles.headerBrand}>
          <AppText style={styles.headerBrandField}>FIELD </AppText>
          <AppText style={styles.headerBrandOps}>OPS</AppText>
        </AppText>
        <View style={styles.offlineContainer}>
          {isOnline ? (
            <>
              <AppText style={styles.onlineText}>Online</AppText>
              <Wifi size={18} color="#45A835" style={styles.offlineIcon} />
            </>
          ) : (
            <>
              <AppText style={styles.offlineText}>Modo Offline</AppText>
              <WifiOff size={18} color="#E53935" style={styles.offlineIcon} />
            </>
          )}
        </View>
      </View>

      {/* ── Título + Subtítulo ──────────────────────────── */}
      <View style={styles.titleSection}>
        <AppText style={styles.screenTitle}>Sincronização</AppText>
        <AppText style={styles.screenSubtitle}>
          {isOnline
            ? hasPending
              ? `${summary.pending + summary.failed} operação(ões) pendente(s) para envio. Toque em "Sincronizar".`
              : 'Tudo sincronizado. Nenhuma operação pendente.'
            : 'Sem conexão. Conecte-se à internet para sincronizar as inspeções.'}
        </AppText>
      </View>

      {/* ── Botões de ação ──────────────────────────────── */}
      <View style={styles.actionsRow}>
        {isOnline && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={handleDownload}
            disabled={downloading}
            activeOpacity={0.7}
          >
            {downloading ? (
              <ActivityIndicator size={18} color="#45A835" />
            ) : (
              <ClipboardList size={18} color="#45A835" />
            )}
            <AppText style={styles.actionBtnSecondaryText}>
              {downloading ? 'Baixando...' : 'Baixar inspeções'}
            </AppText>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.actionBtn,
            hasPending && isOnline ? styles.actionBtnPrimary : styles.actionBtnDisabled,
          ]}
          onPress={handleSync}
          disabled={!isOnline || !hasPending || syncing}
          activeOpacity={0.7}
        >
          {syncing ? (
            <ActivityIndicator size={18} color="#FFFFFF" />
          ) : (
            <UploadCloud size={18} color={hasPending && isOnline ? '#FFFFFF' : '#BDBDBD'} />
          )}
          <AppText
            style={[
              styles.actionBtnPrimaryText,
              !(hasPending && isOnline) && styles.actionBtnDisabledText,
            ]}
          >
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </AppText>
        </TouchableOpacity>
      </View>

      {/* ── Conteúdo rolável ────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
      >
        {/* Resumo do outbox */}
        <View style={[styles.section, { backgroundColor: '#FFF8E1' }]}>
          <View style={styles.sectionHeader}>
            <View>
              <AppText style={styles.sectionTitle}>Fila de sincronização</AppText>
              <AppText style={styles.sectionSubtitle}>
                Operações aguardando envio ao servidor
              </AppText>
            </View>
            <Clock size={24} color="#E65100" />
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <AppText style={[styles.summaryNumber, { color: '#E65100' }]}>
                {summary.pending}
              </AppText>
              <AppText style={styles.summaryLabel}>PENDENTES</AppText>
            </View>
            <View style={styles.summaryItem}>
              <AppText style={[styles.summaryNumber, { color: '#E53935' }]}>
                {summary.failed}
              </AppText>
              <AppText style={styles.summaryLabel}>FALHAS</AppText>
            </View>
            <View style={styles.summaryItem}>
              <AppText style={[styles.summaryNumber, { color: '#45A835' }]}>
                {summary.succeeded}
              </AppText>
              <AppText style={styles.summaryLabel}>ENVIADAS</AppText>
            </View>
          </View>
        </View>

        {/* Lista de inspeções */}
        <View style={[styles.section, { backgroundColor: '#E8F5E9' }]}>
          <View style={styles.sectionHeader}>
            <View>
              <AppText style={styles.sectionTitle}>Inspeções</AppText>
              <AppText style={styles.sectionSubtitle}>
                {inspections.length} inspeção(ões) no dispositivo
              </AppText>
            </View>
            <CheckCircle2 size={24} color="#45A835" />
          </View>
          <View style={styles.sectionCards}>
            {inspections.length === 0 ? (
              <View style={styles.emptySync}>
                <AlertCircle size={32} color="#BDBDBD" />
                <AppText style={styles.emptySyncText}>
                  Nenhuma inspeção baixada. Toque em "Baixar inspeções" quando estiver online.
                </AppText>
              </View>
            ) : (
              inspections.map((insp) => (
                <InspectionSyncCard
                  key={insp.id}
                  inspection={insp}
                  summary={summary}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* ── Barra de navegação inferior ─────────────────── */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Inspeções')}
        >
          <ClipboardList size={22} color="#888" />
          <AppText style={styles.tabLabel}>INSPEÇÕES</AppText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} activeOpacity={0.7}>
          <RefreshCw size={22} color="#45A835" />
          <AppText style={styles.tabLabelActive}>SINCRONIZAR</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Perfil')}
        >
          <User size={22} color="#888" />
          <AppText style={styles.tabLabel}>PERFIL</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Estilos
// ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F4' },

  header: {
    backgroundColor: '#132539',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 25,
  },
  headerBrand: {},
  headerBrandField: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  headerBrandOps: {
    color: '#45A835',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  offlineContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  offlineText: {
    color: '#E53935',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  onlineText: {
    color: '#45A835',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  offlineIcon: { marginLeft: 4 },

  titleSection: {
    backgroundColor: '#132539',
    paddingHorizontal: 20,
    paddingBottom: 26,
    paddingTop: 10,
  },
  screenTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    marginBottom: 6,
  },
  screenSubtitle: {
    color: '#AABBC8',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },

  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 8,
    paddingVertical: 12,
    flex: 1,
  },
  actionBtnPrimary: {
    backgroundColor: '#45A835',
  },
  actionBtnSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#45A835',
  },
  actionBtnDisabled: {
    backgroundColor: '#E0E0E0',
  },
  actionBtnPrimaryText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  actionBtnSecondaryText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#45A835',
  },
  actionBtnDisabledText: {
    color: '#BDBDBD',
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16, paddingTop: 16 },

  section: {
    borderRadius: 8,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#132539',
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  sectionCards: { gap: 10 },

  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    paddingVertical: 12,
  },
  summaryNumber: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  summaryLabel: {
    fontSize: 9,
    fontFamily: 'Inter_400Regular',
    color: '#666',
    marginTop: 2,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardInfo: { flex: 1 },
  cardTitle: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#132539',
    marginBottom: 3,
  },
  cardCode: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#666',
  },
  cardSyncInfo: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#888',
    marginTop: 2,
  },

  emptySync: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  emptySyncText: {
    fontSize: 13,
    color: '#BDBDBD',
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingBottom: 20,
    paddingTop: 10,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 4 },
  tabLabel: { fontSize: 10, color: '#888', fontFamily: 'Inter_400Regular' },
  tabLabelActive: {
    fontSize: 10,
    color: '#45A835',
    fontFamily: 'Inter_700Bold',
  },
});
