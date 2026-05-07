import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

export interface AuthUser {
  id: string | number;
  username: string;
  role: RoleName;
  permissions?: Partial<PermissionSnapshot>;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: true }),
      clearUser: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: 'gnp-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
