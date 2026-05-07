import type { PermissionSnapshot, RoleName } from '../../shared/types/index.js';

export interface LegacyPermissionRecord {
  legacyUserId: string;
  accessType: number | null;
  adjustmentPageAccess: boolean;
  adjustmentEditAccess: boolean;
  adjustmentDeleteAccess: boolean;
  isSuperUser: boolean;
}

const rolePermissionDefaults: Record<RoleName, PermissionSnapshot> = {
  Admin: {
    dashboardRead: true,
    inventoryRead: true,
    inventoryWrite: false,
    auditRead: true,
    usersRead: true,
    usersWrite: true,
    permissionsRead: true,
    permissionsWrite: true,
    adjustmentPageAccess: true,
    adjustmentSave: true,
    adjustmentEdit: true,
    adjustmentDelete: false,
    adjustmentPost: true,
    adjustmentPrint: true,
  },
  Supervisor: {
    dashboardRead: true,
    inventoryRead: true,
    inventoryWrite: false,
    auditRead: true,
    usersRead: false,
    usersWrite: false,
    permissionsRead: false,
    permissionsWrite: false,
    adjustmentPageAccess: true,
    adjustmentSave: true,
    adjustmentEdit: true,
    adjustmentDelete: false,
    adjustmentPost: true,
    adjustmentPrint: true,
  },
  Encoder: {
    dashboardRead: true,
    inventoryRead: true,
    inventoryWrite: false,
    auditRead: false,
    usersRead: false,
    usersWrite: false,
    permissionsRead: false,
    permissionsWrite: false,
    adjustmentPageAccess: true,
    adjustmentSave: true,
    adjustmentEdit: true,
    adjustmentDelete: false,
    adjustmentPost: false,
    adjustmentPrint: true,
  },
  'POS User': {
    dashboardRead: true,
    inventoryRead: true,
    inventoryWrite: false,
    auditRead: false,
    usersRead: false,
    usersWrite: false,
    permissionsRead: false,
    permissionsWrite: false,
    adjustmentPageAccess: false,
    adjustmentSave: false,
    adjustmentEdit: false,
    adjustmentDelete: false,
    adjustmentPost: false,
    adjustmentPrint: false,
  },
  'Security Level 2': {
    dashboardRead: true,
    inventoryRead: true,
    inventoryWrite: false,
    auditRead: false,
    usersRead: false,
    usersWrite: false,
    permissionsRead: false,
    permissionsWrite: false,
    adjustmentPageAccess: false,
    adjustmentSave: false,
    adjustmentEdit: false,
    adjustmentDelete: false,
    adjustmentPost: false,
    adjustmentPrint: false,
  },
};

export function getRolePermissionDefaults(role: RoleName): PermissionSnapshot {
  return rolePermissionDefaults[role] ?? rolePermissionDefaults['POS User'];
}

export function getRolePermissions(role: RoleName): PermissionSnapshot {
  return getRolePermissionDefaults(role);
}

export function deriveRoleFromLegacyAccess(record: LegacyPermissionRecord | null): RoleName {
  if (!record) return 'POS User';
  if (record.isSuperUser && record.accessType !== 2) return 'Admin';
  if (record.accessType === 2) return 'Security Level 2';
  if (record.adjustmentPageAccess && record.accessType === 1) return 'Supervisor';
  if (record.adjustmentPageAccess) return 'Encoder';
  return 'POS User';
}

const LEGACY_MERGE_ELIGIBLE: RoleName[] = ['Supervisor', 'Encoder'];

export function buildEffectivePermissions(
  role: RoleName,
  legacyRecord: LegacyPermissionRecord | null,
  _username?: string,
  overrides?: Partial<PermissionSnapshot>
): PermissionSnapshot {
  const base: PermissionSnapshot = { ...getRolePermissionDefaults(role), ...overrides };

  if (!legacyRecord || !LEGACY_MERGE_ELIGIBLE.includes(role)) {
    return base;
  }

  if (!overrides || !('adjustmentPageAccess' in overrides)) {
    base.adjustmentPageAccess = base.adjustmentPageAccess || legacyRecord.adjustmentPageAccess;
  }
  if (!overrides || !('adjustmentSave' in overrides)) {
    base.adjustmentSave = base.adjustmentSave || legacyRecord.adjustmentPageAccess;
  }
  if (!overrides || !('adjustmentEdit' in overrides)) {
    base.adjustmentEdit = base.adjustmentEdit || legacyRecord.adjustmentEditAccess;
  }
  if (!overrides || !('adjustmentDelete' in overrides)) {
    base.adjustmentDelete = base.adjustmentDelete || legacyRecord.adjustmentDeleteAccess;
  }
  if (!overrides || !('adjustmentPrint' in overrides)) {
    base.adjustmentPrint = base.adjustmentPrint || base.adjustmentPageAccess;
  }

  return base;
}

export function assertPermission(
  permissions: PermissionSnapshot,
  permission: keyof PermissionSnapshot
) {
  return permissions[permission];
}

