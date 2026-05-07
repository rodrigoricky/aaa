import { useAuthStore, type PermissionSnapshot, type RoleName } from '../store/authStore';

export function useAuth() {
  const { user, isAuthenticated, setUser, clearUser } = useAuthStore();

  const hasRole = (...roles: RoleName[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const hasPermission = (permission: keyof PermissionSnapshot) => {
    if (!user?.permissions) return false;
    return Boolean(user.permissions[permission]);
  };

  const canWrite = () => hasPermission('inventoryWrite');
  const isAdmin = () => hasRole('Admin');

  return {
    user,
    isAuthenticated,
    setUser,
    clearUser,
    hasRole,
    hasPermission,
    canWrite,
    isAdmin,
  };
}
