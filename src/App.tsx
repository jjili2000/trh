import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { ReactNode } from 'react';

import Login from './pages/Login';
import AppLayout from './components/Layout/AppLayout';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/admin/AdminDashboard';
import TimeTracking from './pages/time/TimeTracking';
import AbsenceManagement from './pages/absences/AbsenceManagement';
import ExpenseManagement from './pages/expenses/ExpenseManagement';
import DocumentManagement from './pages/documents/DocumentManagement';
import MyDocuments from './pages/documents/MyDocuments';
import SeasonList from './pages/seasons/SeasonList';
import SeasonDetail from './pages/seasons/SeasonDetail';
import BudgetList from './pages/budget/BudgetList';
import BudgetRequestDetail from './pages/budget/BudgetRequestDetail';
import RealBudgetDetail from './pages/budget/RealBudgetDetail';
import NotificationsPage from './pages/notifications/NotificationsPage';
import AccountingPage from './pages/accounting/AccountingPage';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { currentUser } = useApp();
  if (!currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { currentUser } = useApp();
  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function ModuleRoute({ module, children }: { module: string; children: ReactNode }) {
  const { currentUser } = useApp();
  if (!currentUser) return <Navigate to="/login" replace />;
  const hasModule = currentUser.role === 'admin' || (currentUser.moduleAccess ?? []).includes(module);
  if (!hasModule) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { currentUser } = useApp();

  return (
    <Routes>
      <Route
        path="/login"
        element={currentUser ? <Navigate to="/dashboard" replace /> : <Login />}
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
        <Route
          path="admin/*"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />
        <Route path="time" element={<TimeTracking />} />
        <Route path="absences" element={<AbsenceManagement />} />
        <Route path="expenses" element={<ExpenseManagement />} />
        <Route path="documents" element={<DocumentManagement />} />
        <Route path="my-documents" element={<MyDocuments />} />
        <Route path="seasons" element={<ModuleRoute module="seasons"><SeasonList /></ModuleRoute>} />
        <Route path="seasons/:id" element={<ModuleRoute module="seasons"><SeasonDetail /></ModuleRoute>} />
        <Route path="budget" element={<BudgetList />} />
        <Route path="budget/requests/:id" element={<BudgetRequestDetail />} />
        <Route path="budget/real/:id" element={<RealBudgetDetail />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="accounting" element={<AccountingPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}
