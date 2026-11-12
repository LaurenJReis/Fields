/**
 * Cliente HTTP para a API FieldOps.
 * Inclui autenticação JWT e tratamento de erros.
 */

import { getApiUrl, getAuth } from './storage';
import type {
  ApiResponseApi,
  LoginResponseApi,
  InspectionResponseApi,
  EquipmentResponseApi,
  SyncBatchRequestApi,
  SyncBatchResponseApi,
} from '../types/api';

// ─── Fetch com auth ──────────────────────────────────────────────

async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const baseUrl = await getApiUrl();
  const auth = await getAuth();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };

  if (auth?.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }

  const response = await fetch(url, { ...options, headers });
  return response;
}

// ─── Login ───────────────────────────────────────────────────────

export async function login(
  email: string,
  password: string,
): Promise<LoginResponseApi> {
  const baseUrl = await getApiUrl();
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Erro ${response.status} no login`);
  }

  return (await response.json()) as LoginResponseApi;
}

// ─── Registro ────────────────────────────────────────────────────

export interface RegisterRequestApi {
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'TECNICO';
}

export async function register(data: RegisterRequestApi): Promise<void> {
  const baseUrl = await getApiUrl();
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    // Extrai mensagem legível do JSON de erro se houver
    try {
      const json = JSON.parse(text);
      throw new Error(json.message ?? json.error ?? `Erro ${response.status}`);
    } catch {
      throw new Error(text || `Erro ${response.status} ao criar conta`);
    }
  }
}



/** Busca inspeções atribuídas ao técnico (com paginação). */
export async function fetchAssignedInspections(
  technicianId: number,
  page = 0,
  size = 50,
): Promise<InspectionResponseApi[]> {
  const path = `/api/v1/inspections/assigned?technicianId=${technicianId}&page=${page}&size=${size}`;
  const response = await authFetch(path);

  if (!response.ok) {
    throw new Error(`Erro ${response.status} ao buscar inspeções`);
  }

  const json = await response.json();
  // Spring Page retorna { content: [...], ... }
  return (json.content ?? json) as InspectionResponseApi[];
}

/** Busca uma inspeção específica com itemSnapshots. */
export async function fetchInspectionById(
  id: number,
): Promise<InspectionResponseApi> {
  const response = await authFetch(`/api/v1/inspections/${id}`);

  if (!response.ok) {
    throw new Error(`Erro ${response.status} ao buscar inspeção ${id}`);
  }

  return (await response.json()) as InspectionResponseApi;
}

// ─── Equipamentos ────────────────────────────────────────────────

/** Busca equipamento pelo QR Code (usado ao escanear no mobile). */
export async function fetchEquipmentByQrCode(
  qrCode: string,
): Promise<EquipmentResponseApi> {
  const response = await authFetch(`/api/v1/equipments/qrcode/${encodeURIComponent(qrCode)}`);

  if (!response.ok) {
    throw new Error(`Equipamento não encontrado para o QR Code: ${qrCode}`);
  }

  const json: ApiResponseApi<EquipmentResponseApi> = await response.json();
  return json.data as EquipmentResponseApi;
}

// ─── Sync ───────────────────────────────────────────────────────

/** Envia lote de operações para sincronização. */
export async function syncBatch(
  technicianId: number,
  batch: SyncBatchRequestApi,
): Promise<SyncBatchResponseApi> {
  const path = `/api/v1/sync/batch?technicianId=${technicianId}`;
  const response = await authFetch(path, {
    method: 'POST',
    body: JSON.stringify(batch),
  });

  if (!response.ok) {
    throw new Error(`Erro ${response.status} na sincronização`);
  }

  const json: ApiResponseApi<SyncBatchResponseApi> = await response.json();
  // O server envelopa em ApiResponse, mas pode retornar direto
  return (json.data ?? (json as unknown as SyncBatchResponseApi));
}

// ─── Upload de evidência (multipart) ────────────────────────────

export async function uploadEvidence(
  inspectionId: number,
  fileUri: string,
  uploadedByUserId: number,
  responseId?: number,
): Promise<number | null> {
  const baseUrl = await getApiUrl();
  const auth = await getAuth();

  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    type: 'image/jpeg',
    name: `evidence_${Date.now()}.jpg`,
  } as unknown as Blob);

  const params = new URLSearchParams({
    uploadedByUserId: String(uploadedByUserId),
  });
  if (responseId) params.set('responseId', String(responseId));

  const response = await fetch(
    `${baseUrl}/api/v1/inspections/${inspectionId}/evidences?${params}`,
    {
      method: 'POST',
      headers: auth?.token
        ? { Authorization: `Bearer ${auth.token}` }
        : {},
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error(`Erro ${response.status} ao enviar evidência`);
  }

  const json = await response.json();
  // Retorna o ID da evidência criada
  return json.data?.id ?? json.id ?? null;
}
