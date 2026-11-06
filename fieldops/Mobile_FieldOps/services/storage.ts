/**
 * Camada de persistência local via AsyncStorage.
 * Guarda inspeções baixadas, respostas preenchidas, evidências
 * e a fila de sincronização (outbox).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  LocalInspection,
  LocalResponse,
  OutboxOperation,
  LoginResponseApi,
} from '../types/api';

// ─── Chaves de storage ──────────────────────────────────────────

const KEYS = {
  AUTH: '@fieldops:auth',
  INSPECTIONS: '@fieldops:inspections',
  RESPONSES: '@fieldops:responses', // prefixo + inspectionId
  OUTBOX: '@fieldops:outbox',
  API_URL: '@fieldops:apiUrl',
} as const;

// ─── Auth ────────────────────────────────────────────────────────

export async function saveAuth(auth: LoginResponseApi): Promise<void> {
  await AsyncStorage.setItem(KEYS.AUTH, JSON.stringify(auth));
}

export async function getAuth(): Promise<LoginResponseApi | null> {
  const raw = await AsyncStorage.getItem(KEYS.AUTH);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LoginResponseApi;
  } catch {
    return null;
  }
}

export async function clearAuth(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.AUTH);
}

// ─── API URL configurável ────────────────────────────────────────

const DEFAULT_API_URL = 'http://fieldops-api-prod.eba-pxu6drgm.us-east-2.elasticbeanstalk.com';

export async function getApiUrl(): Promise<string> {
  const url = await AsyncStorage.getItem(KEYS.API_URL);
  return url ?? DEFAULT_API_URL;
}

export async function setApiUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.API_URL, url);
}

// ─── Inspeções ───────────────────────────────────────────────────

/** Retorna todas as inspeções armazenadas localmente. */
export async function getLocalInspections(): Promise<LocalInspection[]> {
  const raw = await AsyncStorage.getItem(KEYS.INSPECTIONS);
  if (!raw) return [];
  try {
    const map = JSON.parse(raw) as Record<string, LocalInspection>;
    return Object.values(map);
  } catch {
    return [];
  }
}

/** Retorna uma inspeção específica pelo ID. */
export async function getLocalInspection(id: number): Promise<LocalInspection | null> {
  const all = await getLocalInspections();
  return all.find((i) => i.id === id) ?? null;
}

/** Substitui todas as inspeções locais (usado após download da API). */
export async function saveLocalInspections(inspections: LocalInspection[]): Promise<void> {
  const map: Record<string, LocalInspection> = {};
  for (const insp of inspections) {
    map[String(insp.id)] = insp;
  }
  await AsyncStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(map));
}

/** Adiciona ou atualiza uma única inspeção local. */
export async function upsertLocalInspection(insp: LocalInspection): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.INSPECTIONS);
  const map: Record<string, LocalInspection> = raw ? JSON.parse(raw) : {};
  map[String(insp.id)] = insp;
  await AsyncStorage.setItem(KEYS.INSPECTIONS, JSON.stringify(map));
}

// ─── Respostas (por inspeção) ──────────────────────────────────

const responsesKey = (inspectionId: number) => `${KEYS.RESPONSES}:${inspectionId}`;

/** Retorna todas as respostas de uma inspeção. */
export async function getLocalResponses(inspectionId: number): Promise<Record<number, LocalResponse>> {
  const raw = await AsyncStorage.getItem(responsesKey(inspectionId));
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<number, LocalResponse>;
  } catch {
    return {};
  }
}

/** Salva todas as respostas de uma inspeção (sobrescreve). */
export async function saveLocalResponses(
  inspectionId: number,
  responses: Record<number, LocalResponse>,
): Promise<void> {
  await AsyncStorage.setItem(responsesKey(inspectionId), JSON.stringify(responses));
}

/** Atualiza uma única resposta de um item. */
export async function upsertLocalResponse(
  inspectionId: number,
  snapshotItemId: number,
  response: LocalResponse,
): Promise<void> {
  const all = await getLocalResponses(inspectionId);
  all[snapshotItemId] = response;
  await saveLocalResponses(inspectionId, all);
}

// ─── Outbox (fila de sync) ──────────────────────────────────────

/** Retorna todas as operações pendentes no outbox. */
export async function getOutbox(): Promise<OutboxOperation[]> {
  const raw = await AsyncStorage.getItem(KEYS.OUTBOX);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as OutboxOperation[];
  } catch {
    return [];
  }
}

/** Adiciona operações ao outbox. */
export async function addToOutbox(ops: OutboxOperation[]): Promise<void> {
  const current = await getOutbox();
  current.push(...ops);
  await AsyncStorage.setItem(KEYS.OUTBOX, JSON.stringify(current));
}

/** Atualiza o status de uma operação no outbox pela idempotencyKey. */
export async function updateOutboxOp(
  idempotencyKey: string,
  patch: Partial<OutboxOperation>,
): Promise<void> {
  const current = await getOutbox();
  const updated = current.map((op) =>
    op.idempotencyKey === idempotencyKey ? { ...op, ...patch } : op,
  );
  await AsyncStorage.setItem(KEYS.OUTBOX, JSON.stringify(updated));
}

/** Remove operações com status SUCCESS ou SKIPPED do outbox. */
export async function clearSyncedOutbox(): Promise<void> {
  const current = await getOutbox();
  const remaining = current.filter(
    (op) => op.status !== 'SUCCESS' && op.status !== 'SKIPPED',
  );
  await AsyncStorage.setItem(KEYS.OUTBOX, JSON.stringify(remaining));
}

/** Conta operações pendentes no outbox. */
export async function getPendingCount(): Promise<number> {
  const current = await getOutbox();
  return current.filter((op) => op.status === 'PENDING' || op.status === 'FAILED').length;
}

// ─── Limpeza total (logout) ─────────────────────────────────────

export async function clearAllLocalData(): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const fieldopsKeys = allKeys.filter((k) => k.startsWith('@fieldops:'));
  await AsyncStorage.multiRemove(fieldopsKeys);
}
