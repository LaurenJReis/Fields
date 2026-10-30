/**
 * Camada de armazenamento offline para inspeções.
 *
 * Fluxo:
 *   1. Ao abrir uma inspeção, baixa os dados e salva localmente.
 *   2. Respostas são salvas localmente em tempo real (com idempotencyKey).
 *   3. Ao sincronizar, envia as respostas pendentes para a API.
 *   4. Idempotência garante que não haja duplicação mesmo com retry.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface OfflineAnswer {
  idempotencyKey: string;    // UUID único por resposta
  inspectionId:   string;
  itemId:         string;
  value:          string;    // resposta serializada (OK/NOK/NA/texto/número)
  photoUri?:      string;    // caminho local da foto (se houver)
  savedAt:        string;    // ISO timestamp
  synced:         boolean;
}

export interface OfflineInspection {
  id:          string;
  title:       string;
  equipment:   string;
  qrCode?:     string;
  status:      'pending' | 'in_progress' | 'completed';
  startedAt?:  string;
  answers:     OfflineAnswer[];
  lastUpdated: string;
}

// ─── Chaves do AsyncStorage ───────────────────────────────────────────────────

const INSPECTIONS_KEY = '@fieldops:offline_inspections';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function readAll(): Promise<OfflineInspection[]> {
  const raw = await AsyncStorage.getItem(INSPECTIONS_KEY);
  return raw ? (JSON.parse(raw) as OfflineInspection[]) : [];
}

async function writeAll(inspections: OfflineInspection[]): Promise<void> {
  await AsyncStorage.setItem(INSPECTIONS_KEY, JSON.stringify(inspections));
}

// ─── API pública ──────────────────────────────────────────────────────────────

/** Retorna todas as inspeções armazenadas offline. */
export async function getOfflineInspections(): Promise<OfflineInspection[]> {
  return readAll();
}

/** Salva ou atualiza uma inspeção (upsert por id). */
export async function upsertOfflineInspection(
  inspection: Omit<OfflineInspection, 'answers' | 'lastUpdated'> & Partial<Pick<OfflineInspection, 'answers'>>,
): Promise<void> {
  const all = await readAll();
  const idx = all.findIndex((i) => i.id === inspection.id);
  const now = new Date().toISOString();

  if (idx >= 0) {
    all[idx] = { ...all[idx], ...inspection, lastUpdated: now };
  } else {
    all.push({ answers: [], ...inspection, lastUpdated: now });
  }

  await writeAll(all);
}

/**
 * Salva uma resposta offline.
 * Idempotente: se já existe uma resposta com o mesmo idempotencyKey,
 * sobrescreve em vez de duplicar.
 */
export async function saveOfflineAnswer(answer: OfflineAnswer): Promise<void> {
  const all = await readAll();
  const insp = all.find((i) => i.id === answer.inspectionId);

  if (!insp) {
    // Cria inspeção mínima se não existir
    all.push({
      id:          answer.inspectionId,
      title:       `Inspeção ${answer.inspectionId}`,
      equipment:   '',
      status:      'in_progress',
      startedAt:   answer.savedAt,
      answers:     [answer],
      lastUpdated: answer.savedAt,
    });
  } else {
    const existingIdx = insp.answers.findIndex(
      (a) => a.idempotencyKey === answer.idempotencyKey,
    );
    if (existingIdx >= 0) {
      insp.answers[existingIdx] = answer; // idempotente: sobrescreve
    } else {
      insp.answers.push(answer);
    }
    insp.lastUpdated = answer.savedAt;
  }

  await writeAll(all);
}

/** Marca todas as respostas de uma inspeção como sincronizadas. */
export async function markInspectionSynced(inspectionId: string): Promise<void> {
  const all = await readAll();
  const insp = all.find((i) => i.id === inspectionId);
  if (!insp) return;

  insp.answers = insp.answers.map((a) => ({ ...a, synced: true }));
  insp.status  = 'completed';
  insp.lastUpdated = new Date().toISOString();

  await writeAll(all);
}

/** Retorna respostas pendentes (não sincronizadas) de uma inspeção. */
export async function getPendingAnswers(
  inspectionId: string,
): Promise<OfflineAnswer[]> {
  const all = await readAll();
  const insp = all.find((i) => i.id === inspectionId);
  return insp ? insp.answers.filter((a) => !a.synced) : [];
}

/** Remove todas as inspeções (uso em testes ou logout). */
export async function clearOfflineData(): Promise<void> {
  await AsyncStorage.removeItem(INSPECTIONS_KEY);
}
