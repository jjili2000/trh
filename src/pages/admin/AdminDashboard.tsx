import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Users, Tag, Settings } from 'lucide-react';
import UserManagement from './UserManagement';
import ActivityTypes from './ActivityTypes';
import AppSettings from './AppSettings';

export default function AdminDashboard() {
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      isActive
        ? 'border-tennis-green text-tennis-green'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Administration</h1>
        <p className="text-gray-500 mt-1">Gérez les utilisateurs, les types d'activités et les paramètres du club.</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1 -mb-px">
          <NavLink to="/admin/users" className={tabClass}>
            <Users size={16} />
            Utilisateurs
          </NavLink>
          <NavLink to="/admin/activity-types" className={tabClass}>
            <Tag size={16} />
            Types d'activités
          </NavLink>
          <NavLink to="/admin/settings" className={tabClass}>
            <Settings size={16} />
            Paramètres
          </NavLink>
        </nav>
      </div>

      <Routes>
        <Route index element={<Navigate to="/admin/users" replace />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="activity-types" element={<ActivityTypes />} />
        <Route path="settings" element={<AppSettings />} />
      </Routes>
    </div>
  );
}
