/**
 * Tipos compatíveis com a API FieldOps.
 * Espelham os DTOs e enums do backend Spring Boot.
 */

// ─── Enums da API ──────────────────────────────────────────────

export type InspectionStatusApi =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type ResponseTypeApi =
  | 'TEXT_SHORT'
  | 'TEXT_LONG'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'CONFORMITY'
  | 'SINGLE_CHOICE'
  | 'DATE';

export type ConformityValueApi = 'CONFORMING' | 'NON_CONFORMING' | 'NOT_APPLICABLE';

export type SyncOperationTypeApi =
  | 'START_INSPECTION'
  | 'SAVE_RESPONSE'
  | 'SAVE_NON_CONFORMITY'
  | 'UPLOAD_EVIDENCE'
  | 'COMPLETE_INSPECTION';

export type SyncStatusApi = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

export type UserRoleApi = 'ADMIN' | 'SUPERVISOR' | 'TECNICO';

// ─── DTOs de resposta da API ────────────────────────────────────

export interface UserResponseApi {
  id: number;
  name: string;
  email: string;
  role: UserRoleApi;
  active: boolean;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoginResponseApi {
  token: string;
  type: string;
  expiresIn: number;
  user: UserResponseApi;
}

export interface InspectionItemSnapshotApi {
  id: number;
  originalItemId: number;
  code: string;
  title: string;
  description: string;
  responseType: ResponseTypeApi;
  required: boolean;
  observationRequiredOnFailure: boolean;
  evidenceRequiredOnFailure: boolean;
  optionsJson: string | null;
  sectionTitle: string;
  sectionDisplayOrder: number;
  itemDisplayOrder: number;
}

export interface InspectionResponseApi {
  id: number;
  code: string;
  title: string;
  status: InspectionStatusApi;
  scheduledDate?: string;
  completedDate?: string;
  clientName?: string;
  siteName?: string;
  equipmentName?: string;
  equipmentQrCode?: string;
  technicianName?: string;
  itemSnapshots?: InspectionItemSnapshotApi[];
}

// ─── DTOs de sync ───────────────────────────────────────────────

export interface SyncOperationRequestApi {
  idempotencyKey: string;
  inspectionId: number;
  operationType: SyncOperationTypeApi;
  payload: string; // JSON string
}

export interface SyncBatchRequestApi {
  operations: SyncOperationRequestApi[];
}

export interface SyncOperationResultApi {
  idempotencyKey: string;
  inspectionId: number;
  operationType: SyncOperationTypeApi;
  status: SyncStatusApi;
  errorMessage: string | null;
}

export interface SyncBatchResponseApi {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: SyncOperationResultApi[];
  processedAt: string;
}

export interface ApiResponseApi<T> {
  data: T | null;
  message: string | null;
  timestamp: string | null;
}

// ─── Tipos locais (offline) ─────────────────────────────────────

export interface LocalInspection {
  id: number;
  code: string;
  title: string;
  status: InspectionStatusApi;
  scheduledDate?: string;
  completedDate?: string;
  clientName?: string;
  siteName?: string;
  equipmentName?: string;
  equipmentQrCode?: string;
  technicianName?: string;
  itemSnapshots: InspectionItemSnapshotApi[];
  downloadedAt: string; // ISO timestamp do download
}

export interface LocalEvidence {
  id: string; // UUID local
  uri: string; // file:// path
  source: 'camera' | 'gallery';
  capturedAt: string; // ISO
  synced: boolean;
}

export interface LocalResponse {
  snapshotItemId: number;
  value: string | null;
  observation: string | null;
  notApplicable: boolean;
  evidences: LocalEvidence[];
  updatedAt: string;
}

export interface OutboxOperation {
  idempotencyKey: string;
  inspectionId: number;
  operationType: SyncOperationTypeApi;
  payload: string;
  status: SyncStatusApi;
  errorMessage: string | null;
  attemptCount: number;
  createdAt: string;
}

// ─── Mapeamento de tipos ────────────────────────────────────────

/** Mapeia ResponseType da API para o tipo usado na UI mobile. */
export type ChecklistItemTypeLocal =
  | 'CONFORMITY'
  | 'TEXT'
  | 'TEXT_LONG'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'CHOICE'
  | 'DATE';

export function responseTypeToLocal(rt: ResponseTypeApi): ChecklistItemTypeLocal {
  switch (rt) {
    case 'TEXT_SHORT': return 'TEXT';
    case 'TEXT_LONG': return 'TEXT_LONG';
    case 'NUMBER': return 'NUMBER';
    case 'BOOLEAN': return 'BOOLEAN';
    case 'CONFORMITY': return 'CONFORMITY';
    case 'SINGLE_CHOICE': return 'CHOICE';
    case 'DATE': return 'DATE';
  }
}

/** Mapeia status da API para rótulo exibido na UI. */
export function inspectionStatusLabel(status: InspectionStatusApi): string {
  switch (status) {
    case 'SCHEDULED': return 'Atribuída';
    case 'IN_PROGRESS': return 'Em Andamento';
    case 'COMPLETED': return 'Concluída';
    case 'UNDER_REVIEW': return 'Em Revisão';
    case 'APPROVED': return 'Aprovada';
    case 'REJECTED': return 'Rejeitada';
    case 'CANCELLED': return 'Cancelada';
  }
}

/** Mapeia rótulo da UI para valor da API (para sync). */
export function conformityToApiValue(label: string): string | null {
  switch (label) {
    case 'Conforme': return 'CONFORMING';
    case 'Inconforme': return 'NON_CONFORMING';
    case 'Não Aplicável': return 'NOT_APPLICABLE';
    default: return null;
  }
}

/** Converte data DD/MM/AAAA para yyyy-MM-dd (formato da API). */
export function formatDateToApi(ddmmyyyy: string): string | null {
  const m = ddmmyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Gera um UUID v4 simples (para idempotencyKey). */
export function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
