"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRolePermissionDefaults = getRolePermissionDefaults;
exports.getRolePermissions = getRolePermissions;
exports.deriveRoleFromLegacyAccess = deriveRoleFromLegacyAccess;
exports.buildEffectivePermissions = buildEffectivePermissions;
exports.assertPermission = assertPermission;
const rolePermissionDefaults = {
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
function getRolePermissionDefaults(role) {
    return rolePermissionDefaults[role] ?? rolePermissionDefaults['POS User'];
}
function getRolePermissions(role) {
    return getRolePermissionDefaults(role);
}
function deriveRoleFromLegacyAccess(record) {
    if (!record)
        return 'POS User';
    if (record.isSuperUser && record.accessType !== 2)
        return 'Admin';
    if (record.accessType === 2)
        return 'Security Level 2';
    if (record.adjustmentPageAccess && record.accessType === 1)
        return 'Supervisor';
    if (record.adjustmentPageAccess)
        return 'Encoder';
    return 'POS User';
}
const LEGACY_MERGE_ELIGIBLE = ['Supervisor', 'Encoder'];
function buildEffectivePermissions(role, legacyRecord, _username, overrides) {
    const base = { ...getRolePermissionDefaults(role), ...overrides };
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
function assertPermission(permissions, permission) {
    return permissions[permission];
}
