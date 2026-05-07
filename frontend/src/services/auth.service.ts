import api from './api';
import type { AuthUser } from '../store/authStore';

export interface LoginCredentials {
  username: string;
  password: string;
}

export async function login(credentials: LoginCredentials): Promise<AuthUser> {
  const res = await api.post<{ success: boolean; data: { user: AuthUser } }>('/auth/login', credentials);
  return res.data.data.user;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function getProfile(): Promise<AuthUser> {
  const res = await api.get<{ success: boolean; data: AuthUser }>('/auth/profile');
  return res.data.data;
}
