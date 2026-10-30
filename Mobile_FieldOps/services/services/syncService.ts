/**
 * Sincroniza respostas offline com a API na AWS.
 * Usa o endpoint /api/v1/sync/batch com idempotencyKey para evitar duplicação.
 */
import { API_BASE_URL } from '../config/api';
import {
  getOfflineInspections,
  markInspectionSynced,
  OfflineAnswer,
} from './offlineStorage';

interface SyncResult {
  total:     number;
  succeeded: number;
  failed:    number;
  errors:    string[];
}

export async function syncPendingInspections(
  token: string,
): Promise<SyncResult> {
  const inspections = await getOfflineInspections();
  const result: SyncResult = { total: 0, succeeded: 0, failed: 0, errors: [] };

  for (const insp of inspections) {
    const pending = insp.answers.filter((a) => !a.synced);
    if (pending.length === 0) continue;

    result.total += pending.length;

    try {
      // Monta operações no formato esperado pelo /api/v1/sync/batch
      const operations = pending.map((a: OfflineAnswer) => ({
        idempotencyKey: a.idempotencyKey,
        inspectionId:   parseInt(a.inspectionId, 10),
        operationType:  'SAVE_RESPONSE',
        payload: JSON.stringify({
          itemSnapshotId: parseInt(a.itemId, 10),
          value:          a.value,
          notes:          '',
        }),
      }));

      const res = await fetch(`${API_BASE_URL}/api/v1/sync/batch`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ operations }),
      });

      if (res.ok) {
        await markInspectionSynced(insp.id);
        result.succeeded += pending.length;
      } else {
        const err = await res.json().catch(() => ({}));
        result.failed += pending.length;
        result.errors.push(
          `Inspeção ${insp.id}: ${(err as any).message ?? res.status}`,
        );
      }
    } catch (e) {
      result.failed += pending.length;
      result.errors.push(
        `Inspeção ${insp.id}: ${e instanceof Error ? e.message : 'Erro de rede'}`,
      );
    }
  }

  return result;
}
