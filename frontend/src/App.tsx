import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import AppLayout from './layouts/AppLayout';
import ErrorBoundary from './components/ErrorBoundary';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inventory = lazy(() => import('./pages/Inventory'));
const QuantityAdjustments = lazy(() => import('./pages/QuantityAdjustments'));
const QuantityAdjustmentHistory = lazy(() => import('./pages/QuantityAdjustmentHistory'));
const QaNumberingSettings = lazy(() => import('./pages/QaNumberingSettings'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const Users = lazy(() => import('./pages/Users'));
const Permissions = lazy(() => import('./pages/Permissions'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isAdmin()) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RoleRoute({
  roles,
  children,
}: {
  roles: Array<'Admin' | 'Supervisor'>;
  children: React.ReactNode;
}) {
  const { isAuthenticated, hasRole } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!roles.some((role) => hasRole(role))) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return (
    <Suspense fallback={<LoginSkeleton />}>
      {children}
    </Suspense>
  );
}

function PermissionRoute({
  permission,
  children,
}: {
  permission: 'adjustmentPageAccess';
  children: React.ReactNode;
}) {
  const { isAuthenticated, hasPermission } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!hasPermission(permission)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function LoginSkeleton() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#111111' }}>
      <div style={{ width: 40, height: 40, border: '2px solid rgba(255,255,255,0.15)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="inventory" element={<Inventory />} />
            <Route
              path="quantity-adjustments"
              element={
                <PermissionRoute permission="adjustmentPageAccess">
                  <QuantityAdjustments />
                </PermissionRoute>
              }
            />
            <Route
              path="quantity-adjustments/history"
              element={
                <PermissionRoute permission="adjustmentPageAccess">
                  <QuantityAdjustmentHistory />
                </PermissionRoute>
              }
            />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route
              path="users"
              element={
                <AdminRoute>
                  <Users />
                </AdminRoute>
              }
            />
            <Route
              path="permissions"
              element={
                <AdminRoute>
                  <Permissions />
                </AdminRoute>
              }
            />
            <Route
              path="settings/qa-numbering"
              element={
                <RoleRoute roles={['Admin', 'Supervisor']}>
                  <QaNumberingSettings />
                </RoleRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
