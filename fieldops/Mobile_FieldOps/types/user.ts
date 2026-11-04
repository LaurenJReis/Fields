/**
 * Re-exporta o tipo de usuário da API para compatibilidade
 * com imports existentes (import { User } from '../types/user').
 */
export type { UserResponseApi as User } from './api';
