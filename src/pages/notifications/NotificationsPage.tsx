import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { AppNotification } from '../../types';

function fmtDateTime(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { refreshNotifCount } = useApp();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { notifications: notifs } = await api.get<{ notifications: AppNotification[]; unreadCount: number }>('/notifications');
      setNotifications(notifs);
    } catch {
      setError('Erreur lors du chargement des notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all', {});
      setNotifications(prev => prev.map(n => ({ ...n, readAt: new Date().toISOString() })));
      refreshNotifCount();
    } catch {
      setError('Erreur lors de la mise à jour');
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`, {});
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n));
      refreshNotifCount();
    } catch {
      // silent
    }
  };

  const handleNotifClick = (notif: AppNotification) => {
    if (!notif.readAt) handleMarkRead(notif.id);
    if (notif.refType === 'budget_request' && notif.refId) {
      navigate(`/budget/requests/${notif.refId}`);
    } else if (notif.refType === 'real_budget' && notif.refId) {
      navigate(`/budget/real/${notif.refId}`);
    }
  };

  const unreadCount = notifications.filter(n => !n.readAt).length;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell size={22} className="text-gray-600" />
          <h1 className="text-2xl font-bold text-gray-800">Notifications</h1>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 whitespace-nowrap">
              {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            className="btn-secondary flex items-center gap-2 text-sm"
            onClick={handleMarkAllRead}
          >
            <CheckCheck size={14} />
            Tout marquer comme lu
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-center py-8">Chargement…</p>
      ) : notifications.length === 0 ? (
        <div className="card text-center py-12">
          <Bell size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">Aucune notification</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(notif => (
            <div
              key={notif.id}
              onClick={() => handleNotifClick(notif)}
              className={`card cursor-pointer hover:shadow-md transition-shadow border-l-4 ${
                notif.readAt ? 'border-l-gray-200' : 'border-l-tennis-green'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className={`text-sm font-medium ${notif.readAt ? 'text-gray-600' : 'text-gray-900'}`}>
                    {notif.title}
                  </p>
                  {notif.body && (
                    <p className="text-xs text-gray-500 mt-0.5">{notif.body}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{fmtDateTime(notif.createdAt)}</p>
                </div>
                {!notif.readAt && (
                  <span className="w-2 h-2 rounded-full bg-tennis-green flex-shrink-0 mt-1" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
