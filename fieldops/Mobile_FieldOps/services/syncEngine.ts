/**
 * Engine de sincronização offline-first.
 * Gerencia o download de inspeções, a fila de operações (outbox)
 * e o envio de respostas + evidências para a API.
 */

import {
  getLocalInspections,
  getLocalInspection,
  upsertLocalInspection,
  getLocalResponses,
  saveLocalResponses,
  getOutbox,
  addToOutbox,
  updateOutboxOp,
  clearSyncedOutbox,
  getPendingCount,
} from './storage';
import {
  fetchAssignedInspections,
  fetchInspectionById,
  syncBatch,
  uploadEvidence,
} from './apiClient';
import type {
  LocalInspection,
  LocalResponse,
  OutboxOperation,
  SyncOperationRequestApi,
  InspectionItemSnapshotApi,
  InspectionResponseApi,
  ResponseTypeApi,
} from '../types/api';
import { uuidv4, formatDateToApi, conformityToApiValue } from '../types/api';

// ─── Download ────────────────────────────────────────────────────

/**
 * Baixa inspeções atribuídas ao técnico da API e armazena localmente.
 * Inclui os itemSnapshots de cada inspeção para uso offline.
 */
export async function downloadInspections(technicianId: number): Promise<number> {
  const inspections = await fetchAssignedInspections(technicianId);
  let count = 0;

  for (const insp of inspections) {
    // Busca o detalhe completo com itemSnapshots
    const detail = await fetchInspectionById(insp.id);
    const local: LocalInspection = {
      id: detail.id,
      code: detail.code,
      title: detail.title,
      status: detail.status,
      scheduledDate: detail.scheduledDate,
      completedDate: detail.completedDate,
      clientName: detail.clientName,
      siteName: detail.siteName,
      equipmentName: detail.equipmentName,
      equipmentQrCode: detail.equipmentQrCode,
      technicianName: detail.technicianName,
      itemSnapshots: detail.itemSnapshots ?? [],
      downloadedAt: new Date().toISOString(),
    };
    await upsertLocalInspection(local);
    count++;
  }

  return count;
}

// ─── Construção de operações de sync ────────────────────────────

/**
 * Converte uma resposta local no payload JSON esperado pela API
 * para operação SAVE_RESPONSE.
 */
function buildResponsePayload(
  response: LocalResponse,
  responseType: ResponseTypeApi,
): string {
  let value: string | null = response.value;
  const notApplicable = response.notApplicable;

  // Se notApplicable, o value é ignorado pela API (vai null)
  if (notApplicable) {
    return JSON.stringify({
      snapshotItemId: response.snapshotItemId,
      value: null,
      observation: response.observation ?? null,
      notApplicable: true,
    });
  }

  // CONFORMITY: mapeia rótulo para valor do enum
  if (responseType === 'CONFORMITY' && value) {
    const apiValue = conformityToApiValue(value);
    value = apiValue;
  }

  // DATE: converte DD/MM/AAAA → yyyy-MM-dd
  if (responseType === 'DATE' && value) {
    value = formatDateToApi(value);
  }

  return JSON.stringify({
    snapshotItemId: response.snapshotItemId,
    value,
    observation: response.observation ?? null,
    notApplicable: false,
  });
}

/**
 * Gera todas as operações de sync para uma inspeção concluída.
 * Cria START_INSPECTION, SAVE_RESPONSE (por item respondido),
 * e COMPLETE_INSPECTION.
 */
export async function buildInspectionOperations(
  inspectionId: number,
  itemSnapshots: InspectionItemSnapshotApi[],
): Promise<OutboxOperation[]> {
  const responses = await getLocalResponses(inspectionId);
  const ops: OutboxOperation[] = [];
  const now = new Date().toISOString();

  // START_INSPECTION (uma vez por inspeção)
  ops.push({
    idempotencyKey: uuidv4(),
    inspectionId,
    operationType: 'START_INSPECTION',
    payload: JSON.stringify({ startedAtDevice: now }),
    status: 'PENDING',
    errorMessage: null,
    attemptCount: 0,
    createdAt: now,
  });

  // SAVE_RESPONSE para cada item respondido
  for (const snapshot of itemSnapshots) {
    const resp = responses[snapshot.id];
    if (!resp) continue;

    // Pula se não há valor e não é notApplicable
    if (!resp.value && !resp.notApplicable) continue;

    ops.push({
      idempotencyKey: uuidv4(),
      inspectionId,
      operationType: 'SAVE_RESPONSE',
      payload: buildResponsePayload(resp, snapshot.responseType),
      status: 'PENDING',
      errorMessage: null,
      attemptCount: 0,
      createdAt: now,
    });
  }

  // COMPLETE_INSPECTION
  ops.push({
    idempotencyKey: uuidv4(),
    inspectionId,
    operationType: 'COMPLETE_INSPECTION',
    payload: JSON.stringify({ completedAtDevice: now }),
    status: 'PENDING',
    errorMessage: null,
    attemptCount: 0,
    createdAt: now,
  });

  return ops;
}

/**
 * Enfileira as operações de uma inspeção no outbox local.
 * Deve ser chamado quando o técnico finaliza o checklist.
 */
export async function enqueueInspection(inspectionId: number): Promise<void> {
  const inspection = await getLocalInspection(inspectionId);
  if (!inspection) {
    throw new Error(`Inspeção ${inspectionId} não encontrada localmente`);
  }

  const ops = await buildInspectionOperations(inspectionId, inspection.itemSnapshots);
  await addToOutbox(ops);
}

// ─── Sincronização ───────────────────────────────────────────────

/**
 * Envia todas as operações pendentes do outbox para a API.
 * Retorna um resumo do resultado.
 */
export interface SyncResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  evidenceUploaded: number;
  errors: string[];
}

export async function syncPendingOperations(technicianId: number): Promise<SyncResult> {
  const outbox = await getOutbox();
  const pending = outbox.filter(
    (op) => op.status === 'PENDING' || op.status === 'FAILED',
  );

  const result: SyncResult = {
    total: pending.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    evidenceUploaded: 0,
    errors: [],
  };

  if (pending.length === 0) {
    return result;
  }

  // Constrói o batch de operações
  const batchOps: SyncOperationRequestApi[] = pending.map((op) => ({
    idempotencyKey: op.idempotencyKey,
    inspectionId: op.inspectionId,
    operationType: op.operationType,
    payload: op.payload,
  }));

  try {
    const response = await syncBatch(technicianId, { operations: batchOps });

    // Atualiza status de cada operação no outbox local
    for (const res of response.results) {
      await updateOutboxOp(res.idempotencyKey, {
        status: res.status,
        errorMessage: res.errorMessage,
        attemptCount: (pending.find((o) => o.idempotencyKey === res.idempotencyKey)?.attemptCount ?? 0) + 1,
      });

      if (res.status === 'SUCCESS') result.succeeded++;
      else if (res.status === 'SKIPPED') result.skipped++;
      else if (res.status === 'FAILED') {
        result.failed++;
        if (res.errorMessage) result.errors.push(res.errorMessage);
      }
    }

    // Upload de evidências (separado do batch JSON)
    result.evidenceUploaded = await uploadPendingEvidence(technicianId);

    // Limpa operações sincronizadas com sucesso
    await clearSyncedOutbox();
  } catch (err) {
    // Se o batch inteiro falhou (rede/erro), marca todas como FAILED
    const errorMsg = err instanceof Error ? err.message : 'Erro desconhecido';
    result.failed = pending.length;
    result.errors.push(errorMsg);

    for (const op of pending) {
      await updateOutboxOp(op.idempotencyKey, {
        status: 'FAILED',
        errorMessage: errorMsg,
        attemptCount: op.attemptCount + 1,
      });
    }
  }

  return result;
}

/**
 * Faz upload de todas as evidências não sincronizadas.
 * As evidências vão por multipart separado do batch JSON.
 */
async function uploadPendingEvidence(technicianId: number): Promise<number> {
  const inspections = await getLocalInspections();
  let uploaded = 0;

  for (const insp of inspections) {
    const responses = await getLocalResponses(insp.id);
    for (const [, resp] of Object.entries(responses)) {
      const localResp = resp as LocalResponse;
      for (const ev of localResp.evidences) {
        if (ev.synced) continue;
        try {
          await uploadEvidence(
            insp.id,
            ev.uri,
            technicianId,
            localResp.snapshotItemId,
          );
          ev.synced = true;
          uploaded++;
        } catch {
          // Evidência individual falhou — mantém como não sincronizada
        }
      }
    }
    // Salva o estado atualizado das respostas
    await saveLocalResponses(insp.id, responses);
  }

  return uploaded;
}

// ─── Helpers de status ──────────────────────────────────────────

/** Retorna o número de operações pendentes no outbox. */
export async function getPendingSyncCount(): Promise<number> {
  return getPendingCount();
}

/** Retorna o resumo do outbox agrupado por inspeção. */
export interface OutboxSummary {
  pending: number;
  failed: number;
  succeeded: number;
  total: number;
}

export async function getOutboxSummary(): Promise<OutboxSummary> {
  const outbox = await getOutbox();
  return {
    pending: outbox.filter((o) => o.status === 'PENDING').length,
    failed: outbox.filter((o) => o.status === 'FAILED').length,
    succeeded: outbox.filter((o) => o.status === 'SUCCESS').length,
    total: outbox.length,
  };
}
