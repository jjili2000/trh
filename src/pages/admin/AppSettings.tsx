import { useState, FormEvent } from 'react';
import { Save, CheckCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function AppSettings() {
  const { appSettings, updateSettings, currentUser } = useApp();
  const [clubName, setClubName] = useState(appSettings.clubName);
  const [calendarStartHour, setCalendarStartHour] = useState(appSettings.calendarStartHour ?? 8);
  const [calendarEndHour,   setCalendarEndHour]   = useState(appSettings.calendarEndHour   ?? 21);
  const [appUrl, setAppUrl] = useState(appSettings.appUrl ?? '');
  const [saved, setSaved] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    updateSettings({ clubName, calendarStartHour, calendarEndHour, appUrl: appUrl || undefined });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-semibold text-gray-800">Paramètres de l'application</h2>
        <p className="text-sm text-gray-400">Configurez les informations générales du club.</p>
      </div>

      <div className="max-w-xl">
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-5">Informations du club</h3>

          {saved && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center gap-2">
              <CheckCircle size={16} />
              Paramètres sauvegardés avec succès !
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Nom du club *</label>
              <input
                className="input"
                value={clubName}
                onChange={e => setClubName(e.target.value)}
                placeholder="Ex: Tennis Club de Paris"
                required
                disabled={!isAdmin}
              />
              <p className="text-xs text-gray-400 mt-1">
                Ce nom apparaît dans la barre latérale et les en-têtes de l'application.
              </p>
            </div>

            <div>
              <label className="label">URL de l'application</label>
              <input
                className="input"
                type="url"
                value={appUrl}
                onChange={e => setAppUrl(e.target.value)}
                placeholder="https://monclub.exemple.com"
                disabled={!isAdmin}
              />
              <p className="text-xs text-gray-400 mt-1">
                Lien inclus dans les e-mails envoyés aux utilisateurs (invitation, notifications). Doit être l'adresse publique de l'application.
              </p>
            </div>

            <div>
              <label className="label">Plage horaire du calendrier</label>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">De</span>
                  <select
                    className="input w-24"
                    value={calendarStartHour}
                    onChange={e => setCalendarStartHour(Number(e.target.value))}
                    disabled={!isAdmin}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i} disabled={i >= calendarEndHour}>{String(i).padStart(2,'0')}h00</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">à</span>
                  <select
                    className="input w-24"
                    value={calendarEndHour}
                    onChange={e => setCalendarEndHour(Number(e.target.value))}
                    disabled={!isAdmin}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i} disabled={i <= calendarStartHour}>{String(i).padStart(2,'0')}h00</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Plage affichée dans les vues calendrier hebdomadaire et semaines type.
              </p>
            </div>

            {isAdmin && (
              <div className="flex justify-end">
                <button type="submit" className="btn-primary flex items-center gap-2">
                  <Save size={16} />
                  Enregistrer
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Info card */}
        <div className="card mt-4 bg-tennis-yellow-light border-tennis-yellow">
          <h4 className="font-medium text-gray-700 mb-2">À propos de l'application</h4>
          <div className="space-y-1 text-sm text-gray-600">
            <p><span className="font-medium">Version :</span> 1.0.0</p>
            <p><span className="font-medium">Stockage :</span> LocalStorage (navigateur)</p>
            <p><span className="font-medium">Technologie :</span> React + TypeScript + Tailwind CSS</p>
          </div>
        </div>

      </div>
    </div>
  );
}
