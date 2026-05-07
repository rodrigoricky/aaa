import api from './api';

export interface Role {
  id: number;
  name: string;
}

export interface User {
  id: string;
  username: string;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
  role: Role;
  legacyUserId?: string | null;
  permissions?: {
    adjustmentPost?: boolean;
  };
}

export interface LegacyUser {
  id: string;
  username: string;
  fullName: string | null;
  source: 'USER_ACCESS' | 'USER_TABLE';
  accessType: number | null;
  adjustmentPageAccess: boolean;
  adjustmentEditAccess: boolean;
  adjustmentDeleteAccess: boolean;
  isSuperUser: boolean;
  isSecurityLevel2: boolean;
  linkedUtilityUser: { id: string; username: string | null } | null;
}

export interface UsersResponse {
  utility: {
    data: User[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  legacy: LegacyUser[];
}

export interface CreateUserData {
  username: string;
  password: string;
  roleId: number;
  legacyUserId?: string;
}

export interface UpdateUserData {
  roleId?: number;
  isActive?: boolean;
}

export async function getUsers(page = 1, limit = 20): Promise<UsersResponse> {
  const res = await api.get<{ success: boolean; data: UsersResponse }>(`/users?page=${page}&limit=${limit}`);
  return res.data.data;
}

export async function createUser(data: CreateUserData): Promise<User> {
  const res = await api.post<{ success: boolean; data: User }>('/users', data);
  return res.data.data;
}

export async function updateUser(id: string, data: UpdateUserData): Promise<User> {
  const res = await api.patch<{ success: boolean; data: User }>(`/users/${id}`, data);
  return res.data.data;
}

export async function resetPassword(id: string, newPassword: string): Promise<void> {
  await api.post(`/users/${id}/reset-password`, { newPassword });
}

export async function getRoles(): Promise<Role[]> {
  const res = await api.get<{ success: boolean; data: Role[] }>('/users/roles');
  return res.data.data;
}
