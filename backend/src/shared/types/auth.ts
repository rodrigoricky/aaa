export type RoleName = 'Admin' | 'Supervisor' | 'Encoder' | 'POS User' | 'Security Level 2';

export interface PermissionSnapshot {
  dashboardRead: boolean;
  inventoryRead: boolean;
  inventoryWrite: boolean;
  auditRead: boolean;
  usersRead: boolean;
  usersWrite: boolean;
  permissionsRead: boolean;
  permissionsWrite: boolean;
  adjustmentPageAccess: boolean;
  adjustmentSave: boolean;
  adjustmentEdit: boolean;
  adjustmentDelete: boolean;
  adjustmentPost: boolean;
  adjustmentPrint: boolean;
}

export interface AuthenticatedUser {
  id: number;
  username: string;
  role: RoleName;
  roleId: number;
  isActive: boolean;
  legacyUserId: string | null;
  permissions: PermissionSnapshot;
}

export interface JwtPayload {
  userId: number;
  username: string;
}
