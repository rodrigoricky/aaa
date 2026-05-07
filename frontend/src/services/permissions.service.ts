import api from './api';

export interface RolePermissions {
  roleId: number;
  roleName: string;
  permissions: Record<string, boolean>;
}

export async function getPermissions(): Promise<RolePermissions[]> {
  const res = await api.get<{ success: boolean; data: RolePermissions[] }>('/permissions');
  return res.data.data;
}

export async function updateRolePermissions(
  roleId: number,
  permissions: Record<string, boolean>
): Promise<RolePermissions> {
  const res = await api.patch<{ success: boolean; data: RolePermissions }>(
    `/permissions/${roleId}`,
    { permissions }
  );
  return res.data.data;
}
