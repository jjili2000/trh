import { useState, useEffect } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { api } from '../../api/client';

interface Preferences {
  notifInApp: boolean;
  notifEmail: boolean;
}

export default function PreferencesPage() {
  const [prefs, setPrefs] = useState<Preferences>({ notifInApp: true, notifEmail: true });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Preferences>('/users/preferences')
      .then((data) => {
        setPrefs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function toggle(key: keyof Preferences) {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSaved(false);
    try {
      const data = await api.put<Preferences>('/users/preferences', {
        notifInApp: updated.notifInApp,
        notifEmail: updated.notifEmail,
      });
      setPrefs(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // rollback
      setPrefs(prefs);
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="animate-pulse h-8 bg-gray-200 rounded w-48 mb-6" />
        <div className="animate-pulse h-32 bg-gray-200 rounded" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <SlidersHorizontal size={24} className="text-tennis-green" />
        <h1 className="text-2xl font-bold text-gray-900">Préférences</h1>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Notifications</h2>

        <div className="space-y-4">
          {/* Notifications in-app */}
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-800">Notifications dans l'application</p>
              <p className="text-xs text-gray-500 mt-0.5">Afficher les notifications dans la barre de navigation</p>
            </div>
            <button
              onClick={() => toggle('notifInApp')}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                prefs.notifInApp ? 'bg-tennis-green' : 'bg-gray-200'
              }`}
              role="switch"
              aria-checked={prefs.notifInApp}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition duration-200 ease-in-out ${
                  prefs.notifInApp ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Notifications email */}
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Notifications par email</p>
              <p className="text-xs text-gray-500 mt-0.5">Recevoir un email pour chaque nouvelle notification</p>
            </div>
            <button
              onClick={() => toggle('notifEmail')}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                prefs.notifEmail ? 'bg-tennis-green' : 'bg-gray-200'
              }`}
              role="switch"
              aria-checked={prefs.notifEmail}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition duration-200 ease-in-out ${
                  prefs.notifEmail ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {saved && (
          <p className="mt-4 text-sm text-tennis-green font-medium">
            Préférences enregistrées
          </p>
        )}
      </div>
    </div>
  );
}
