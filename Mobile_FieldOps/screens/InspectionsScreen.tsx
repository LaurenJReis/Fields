import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  Wifi,
  WifiOff,
  ChevronRight,
  ClipboardList,
  RefreshCw,
  User,
  FileX,
  DownloadCloud,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import NetInfo from '@react-native-community/netinfo';

import AppText from '../components/AppText';
import { MainTabParamList, RootStackParamList } from '../navigation/AppNavigator';
import { useAuth } from '../context/AuthContext';
import { getLocalInspections, getLocalResponses } from '../services/storage';
import { downloadInspections, getPendingSyncCount } from '../services/syncEngine';
import type { LocalInspection } from '../types/api';
import { inspectionStatusLabel } from '../types/api';

type InspectionsNavProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Inspeções'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type FilterOption = 'Todas' | 'Atribuída' | 'Em Andamento' | 'Concluída';

const FILTERS: FilterOption[] = ['Todas', 'Atribuída', 'Em Andamento', 'Concluída'];

// Mapeia filtro → status da API
const FILTER_TO_STATUS: Record<FilterOption, string | null> = {
  Todas: null,
  Atribuída: 'SCHEDULED',
  'Em Andamento': 'IN_PROGRESS',
  Concluída: 'COMPLETED',
};

// ─────────────────────────────────────────────────────────────
// Componentes internos
// ─────────────────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${progress}%` }]} />
    </View>
  );
}

function InspectionCard({
  item,
  progress,
  onPress,
}: {
  item: LocalInspection;
  progress: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <AppText style={styles.cardStatus}>
            {inspectionStatusLabel(item.status)}
          </AppText>
          <AppText style={styles.cardCode}>{item.code}</AppText>
        </View>
        <ChevronRight size={18} color="#999" />
      </View>

      <AppText style={styles.cardTitle}>{item.title}</AppText>

      <View style={styles.progressRow}>
        <ProgressBar progress={progress} />
        <AppText style={styles.progressLabel}>{progress}%</AppText>
      </View>

      {item.equipmentName ? (
        <AppText style={styles.cardInfo}>{item.equipmentName}</AppText>
      ) : null}
      {item.scheduledDate ? (
        <AppText style={styles.cardInfo}>
          Prazo: {new Date(item.scheduledDate).toLocaleDateString('pt-BR')}
        </AppText>
      ) : null}
    </TouchableOpacity>
  );
}

function EmptyState({ hasInspections }: { hasInspections: boolean }) {
  return (
    <View style={styles.emptyContainer}>
      <FileX size={48} color="#BDBDBD" />
      <AppText style={styles.emptyText}>
        {hasInspections
          ? 'Nenhuma inspeção com este filtro.'
          : 'Nenhuma inspeção baixada. Toque em "Baixar" para sincronizar com o servidor.'}
      </AppText>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Modal de detalhe da inspeção
// ─────────────────────────────────────────────────────────────

function InspectionModal({
  inspection,
  progress,
  pendingCount,
  onClose,
  onStart,
}: {
  inspection: LocalInspection | null;
  progress: number;
  pendingCount: number;
  onClose: () => void;
  onStart: () => void;
}) {
  if (!inspection) return null;

  return (
    <Modal
      visible={!!inspection}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <AppText style={styles.modalTitle}>{inspection.title}</AppText>

          <View style={styles.modalSubHeader}>
            <AppText style={styles.modalCode}>{inspection.code}</AppText>
            <AppText style={styles.modalStatus}>
              {inspectionStatusLabel(inspection.status)}
            </AppText>
          </View>

          <View style={styles.modalInfoBlock}>
            {inspection.clientName ? (
              <AppText style={styles.modalInfoLine}>
                Cliente: {inspection.clientName}
              </AppText>
            ) : null}
            {inspection.siteName ? (
              <AppText style={styles.modalInfoLine}>
                Local: {inspection.siteName}
              </AppText>
            ) : null}
            {inspection.equipmentName ? (
              <AppText style={styles.modalInfoLine}>
                Equipamento: {inspection.equipmentName}
              </AppText>
            ) : null}
            {inspection.scheduledDate ? (
              <AppText style={styles.modalInfoLine}>
                Prazo: {new Date(inspection.scheduledDate).toLocaleDateString('pt-BR')}
              </AppText>
            ) : null}
            <AppText style={styles.modalInfoLine}>
              Itens: {inspection.itemSnapshots.length}
            </AppText>
            <AppText style={styles.modalInfoLine}>Progresso: {progress}%</AppText>
            {pendingCount > 0 ? (
              <AppText style={styles.modalInfoLine}>
                Pendências de sync: {pendingCount}
              </AppText>
            ) : null}
          </View>

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.btnCancel}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <AppText style={styles.btnCancelText}>Cancelar</AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnScan}
              onPress={onStart}
              activeOpacity={0.7}
            >
              <AppText style={styles.btnScanText}>Iniciar</AppText>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// Tela principal
// ─────────────────────────────────────────────────────────────

export default function InspectionsScreen() {
  const navigation = useNavigation<InspectionsNavProp>();
  const { user } = useAuth();

  const [activeFilter, setActiveFilter] = useState<FilterOption>('Todas');
  const [selectedInspection, setSelectedInspection] = useState<LocalInspection | null>(null);
  const [inspections, setInspections] = useState<LocalInspection[]>([]);
  const [progressMap, setProgressMap] = useState<Record<number, number>>({});
  const [isOnline, setIsOnline] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Carrega inspeções locais e progresso ao montar
  const loadLocalData = useCallback(async () => {
    const local = await getLocalInspections();
    setInspections(local);

    // Calcula progresso de cada inspeção
    const progress: Record<number, number> = {};
    for (const insp of local) {
      const responses = await getLocalResponses(insp.id);
      const answered = Object.keys(responses).length;
      const total = insp.itemSnapshots.length || 1;
      progress[insp.id] = Math.round((answered / total) * 100);
    }
    setProgressMap(progress);

    // Conta pendências de sync
    setPendingCount(await getPendingSyncCount());
  }, []);

  useEffect(() => {
    loadLocalData();
  }, [loadLocalData]);

  // Monitora status de rede
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? false);
    });
    return () => unsub();
  }, []);

  // Download de inspeções do servidor
  const handleDownload = useCallback(async () => {
    if (!user) return;
    setDownloading(true);
    try {
      const count = await downloadInspections(user.id);
      await loadLocalData();
      Alert.alert('Download concluído', `${count} inspeção(ões) baixada(s).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao baixar inspeções.';
      Alert.alert('Falha no download', msg);
    } finally {
      setDownloading(false);
    }
  }, [user, loadLocalData]);

  const filteredInspections = useMemo(() => {
    const statusFilter = FILTER_TO_STATUS[activeFilter];
    if (!statusFilter) return inspections;
    return inspections.filter((i) => i.status === statusFilter);
  }, [inspections, activeFilter]);

  const counts = useMemo(
    () => ({
      assigned: inspections.filter((i) => i.status === 'SCHEDULED').length,
      inProgress: inspections.filter((i) => i.status === 'IN_PROGRESS').length,
      completed: inspections.filter((i) => i.status === 'COMPLETED').length,
      total: inspections.length,
    }),
    [inspections],
  );

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

      {/* ── Título + Contadores ─────────────────────────── */}
      <View style={styles.titleSection}>
        <View style={styles.titleRow}>
          <AppText style={styles.screenTitle}>Minhas Inspeções</AppText>
          {isOnline && (
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={handleDownload}
              disabled={downloading}
              activeOpacity={0.7}
            >
              {downloading ? (
                <ActivityIndicator size={16} color="#FFFFFF" />
              ) : (
                <DownloadCloud size={16} color="#FFFFFF" />
              )}
              <AppText style={styles.downloadBtnText}>
                {downloading ? 'Baixando...' : 'Baixar'}
              </AppText>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <AppText style={styles.statNumber}>{counts.assigned}</AppText>
            <AppText style={styles.statLabel}>ATRIBUÍDAS</AppText>
          </View>
          <View style={styles.statCard}>
            <AppText style={styles.statNumber}>{counts.inProgress}</AppText>
            <AppText style={styles.statLabel}>EM ANDAMENTO</AppText>
          </View>
          <View style={styles.statCard}>
            <AppText style={styles.statNumber}>{counts.completed}</AppText>
            <AppText style={styles.statLabel}>CONCLUÍDAS</AppText>
          </View>
          {pendingCount > 0 && (
            <View style={[styles.statCard, styles.statCardAlert]}>
              <AppText style={[styles.statNumber, styles.statNumberAlert]}>
                {pendingCount}
              </AppText>
              <AppText style={[styles.statLabel, styles.statLabelAlert]}>
                PENDÊNCIAS
              </AppText>
            </View>
          )}
        </View>
      </View>

      {/* ── Filtros por status ──────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
        contentContainerStyle={styles.filtersContent}
      >
        {FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.filterChip,
              activeFilter === filter && styles.filterChipActive,
            ]}
            onPress={() => setActiveFilter(filter)}
            activeOpacity={0.7}
          >
            <AppText
              style={[
                styles.filterChipText,
                activeFilter === filter && styles.filterChipTextActive,
              ]}
            >
              {filter}
            </AppText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Lista ou estado vazio ───────────────────────── */}
      {filteredInspections.length === 0 ? (
        <EmptyState hasInspections={inspections.length > 0} />
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredInspections.map((item) => (
            <InspectionCard
              key={item.id}
              item={item}
              progress={progressMap[item.id] ?? 0}
              onPress={() => setSelectedInspection(item)}
            />
          ))}
        </ScrollView>
      )}

      {/* ── Barra de navegação inferior ─────────────────── */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} activeOpacity={0.7}>
          <ClipboardList size={22} color="#45A835" />
          <AppText style={styles.tabLabelActive}>INSPEÇÕES</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Sincronizar')}
        >
          <RefreshCw size={22} color="#888" />
          <AppText style={styles.tabLabel}>SINCRONIZAR</AppText>
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

      {/* ── Modal de detalhe ────────────────────────────── */}
      <InspectionModal
        inspection={selectedInspection}
        progress={selectedInspection ? progressMap[selectedInspection.id] ?? 0 : 0}
        pendingCount={pendingCount}
        onClose={() => setSelectedInspection(null)}
        onStart={() => {
          const id = selectedInspection?.id ?? 0;
          setSelectedInspection(null);
          navigation.navigate('ChecklistExecution', { inspectionId: String(id) });
        }}
      />
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
    paddingHorizontal: 15,
    paddingBottom: 24,
    paddingTop: 10,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 5,
  },
  screenTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#45A835',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  downloadBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  statCardAlert: { backgroundColor: '#FFEBEE' },
  statNumber: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#132539' },
  statNumberAlert: { color: '#E53935' },
  statLabel: {
    fontSize: 9,
    fontFamily: 'Inter_400Regular',
    color: '#555',
    marginTop: 2,
  },
  statLabelAlert: { color: '#E53935' },

  filtersScroll: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    maxHeight: 52,
  },
  filtersContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CCCCCC',
    backgroundColor: '#FFFFFF',
  },
  filterChipActive: { backgroundColor: '#132539', borderColor: '#132539' },
  filterChipText: {
    fontSize: 12,
    color: '#555',
    fontFamily: 'Inter_400Regular',
  },
  filterChipTextActive: { color: '#FFFFFF', fontFamily: 'Inter_700Bold' },

  list: { flex: 1 },
  listContent: { padding: 16, gap: 12 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardStatus: { fontSize: 12, color: '#45A835', fontFamily: 'Inter_600SemiBold' },
  cardCode: { fontSize: 13, color: '#555', fontFamily: 'Inter_400Regular' },
  cardTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#132539',
    marginBottom: 12,
  },
  cardInfo: {
    fontSize: 13,
    color: '#555',
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
  },

  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#132539', borderRadius: 4 },
  progressLabel: {
    fontSize: 12,
    color: '#555',
    fontFamily: 'Inter_400Regular',
    width: 34,
    textAlign: 'right',
  },

  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 60,
  },
  emptyText: {
    fontSize: 14,
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

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#132539',
    marginBottom: 12,
  },
  modalSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  modalCode: {
    fontSize: 13,
    color: '#555',
    fontFamily: 'Inter_400Regular',
  },
  modalStatus: {
    fontSize: 13,
    color: '#45A835',
    fontFamily: 'Inter_600SemiBold',
  },
  modalInfoBlock: {
    gap: 6,
    marginBottom: 24,
  },
  modalInfoLine: {
    fontSize: 14,
    color: '#333',
    fontFamily: 'Inter_400Regular',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  btnCancel: {
    flex: 1,
    height: 44,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#45A835',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCancelText: {
    fontSize: 14,
    color: '#45A835',
    fontFamily: 'Inter_700Bold',
  },
  btnScan: {
    flex: 1,
    height: 44,
    borderRadius: 4,
    backgroundColor: '#45A835',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnScanText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
  },
});
