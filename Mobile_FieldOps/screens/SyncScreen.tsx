import { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  WifiOff,
  RefreshCw,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react-native';
import AppText from '../components/AppText';
import { useAuth } from '../context/AuthContext';
import { getOfflineInspections, OfflineInspection } from '../services/offlineStorage';
import { syncPendingInspections } from '../services/syncService';

export default function SyncScreen() {
  const { token } = useAuth();
  const [inspections, setInspections] = useState<OfflineInspection[]>([]);
  const [syncing, setSyncing]         = useState(false);
  const [lastResult, setLastResult]   = useState<string | null>(null);

  async function loadInspections() {
    const all = await getOfflineInspections();
    setInspections(all);
  }

  useEffect(() => { loadInspections(); }, []);

  const pendingCount = inspections.reduce(
    (acc, i) => acc + i.answers.filter((a) => !a.synced).length,
    0,
  );

  async function handleSync() {
    if (!token) {
      Alert.alert('Não autenticado', 'Faça login novamente.');
      return;
    }
    if (pendingCount === 0) {
      Alert.alert('Nada a sincronizar', 'Todas as respostas já foram enviadas.');
      return;
    }

    setSyncing(true);
    setLastResult(null);

    try {
      const result = await syncPendingInspections(token);
      await loadInspections();

      const msg =
        result.failed === 0
          ? `✅ ${result.succeeded} respostas sincronizadas com sucesso!`
          : `⚠️ ${result.succeeded} enviadas, ${result.failed} com erro:\n${result.errors.join('\n')}`;

      setLastResult(msg);
      Alert.alert('Sincronização', msg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao sincronizar.';
      setLastResult(`❌ ${msg}`);
      Alert.alert('Erro', msg);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      <View style={styles.header}>
        <AppText style={styles.title}>Sincronização</AppText>
        <AppText style={styles.subtitle}>
          Envie as respostas salvas offline para o servidor
        </AppText>
      </View>

      {/* Status card */}
      <View style={[styles.card, pendingCount > 0 ? styles.cardPending : styles.cardOk]}>
        {pendingCount > 0 ? (
          <WifiOff size={32} color="#f59e0b" />
        ) : (
          <CheckCircle2 size={32} color="#22c55e" />
        )}
        <AppText style={styles.cardTitle}>
          {pendingCount > 0
            ? `${pendingCount} resposta(s) pendente(s)`
            : 'Tudo sincronizado'}
        </AppText>
        <AppText style={styles.cardSub}>
          {pendingCount > 0
            ? 'Conecte-se à internet e toque em Sincronizar'
            : 'Nenhum dado pendente de envio'}
        </AppText>
      </View>

      {/* Lista de inspeções */}
      {inspections.map((insp) => {
        const pending = insp.answers.filter((a) => !a.synced).length;
        return (
          <View key={insp.id} style={styles.inspCard}>
            <View style={styles.inspHeader}>
              <AppText style={styles.inspTitle}>{insp.title}</AppText>
              <View style={[styles.badge, pending > 0 ? styles.badgePending : styles.badgeDone]}>
                <AppText style={styles.badgeText}>
                  {pending > 0 ? `${pending} pendente(s)` : 'Sincronizado'}
                </AppText>
              </View>
            </View>
            <AppText style={styles.inspSub}>
              Equipamento: {insp.equipment || '—'} • {insp.answers.length} resposta(s) total
            </AppText>
            <AppText style={styles.inspDate}>
              Última atualização: {new Date(insp.lastUpdated).toLocaleString('pt-BR')}
            </AppText>
          </View>
        );
      })}

      {inspections.length === 0 && (
        <View style={styles.empty}>
          <AlertCircle size={40} color="#9ca3af" />
          <AppText style={styles.emptyText}>Nenhuma inspeção salva offline</AppText>
        </View>
      )}

      {/* Resultado da última sincronização */}
      {lastResult && (
        <View style={styles.resultBox}>
          <AppText style={styles.resultText}>{lastResult}</AppText>
        </View>
      )}

      {/* Botão sincronizar */}
      <TouchableOpacity
        style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
        onPress={handleSync}
        disabled={syncing}
        activeOpacity={0.8}
      >
        {syncing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <UploadCloud size={20} color="#fff" />
        )}
        <AppText style={styles.syncBtnText}>
          {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
        </AppText>
      </TouchableOpacity>

      {/* Botão atualizar lista */}
      <TouchableOpacity style={styles.refreshBtn} onPress={loadInspections}>
        <RefreshCw size={16} color="#6b7280" />
        <AppText style={styles.refreshText}>Atualizar lista</AppText>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#f8fafc' },
  content:     { padding: 20, paddingBottom: 40 },
  header:      { marginBottom: 24 },
  title:       { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  subtitle:    { fontSize: 14, color: '#6b7280' },
  card:        { borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 20, gap: 8 },
  cardPending: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fcd34d' },
  cardOk:      { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' },
  cardTitle:   { fontSize: 16, fontWeight: '600', color: '#111827', textAlign: 'center' },
  cardSub:     { fontSize: 13, color: '#6b7280', textAlign: 'center' },
  inspCard:    { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  inspHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  inspTitle:   { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1 },
  inspSub:     { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  inspDate:    { fontSize: 11, color: '#9ca3af' },
  badge:       { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgePending:{ backgroundColor: '#fef3c7' },
  badgeDone:   { backgroundColor: '#dcfce7' },
  badgeText:   { fontSize: 11, fontWeight: '600', color: '#374151' },
  empty:       { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText:   { fontSize: 14, color: '#9ca3af' },
  resultBox:   { backgroundColor: '#f1f5f9', borderRadius: 8, padding: 12, marginBottom: 12 },
  resultText:  { fontSize: 13, color: '#374151' },
  syncBtn:     { backgroundColor: '#16a34a', borderRadius: 10, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  refreshBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
  refreshText: { fontSize: 14, color: '#6b7280' },
});
