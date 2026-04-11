import { useState, FormEvent } from 'react';
import { Save, CheckCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function AppSettings() {
  const { appSettings, updateSettings, currentUser } = useApp();
  const [clubName, setClubName] = useState(appSettings.clubName);
  const [saved, setSaved] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    updateSettings({ clubName });
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

        {/* Danger zone (admin only) */}
        {isAdmin && (
          <div className="card mt-4 border-red-100">
            <h4 className="font-medium text-red-600 mb-2">Zone de danger</h4>
            <p className="text-sm text-gray-500 mb-4">
              Réinitialiser toutes les données de l'application. Cette action est irréversible.
            </p>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Êtes-vous sûr de vouloir réinitialiser toutes les données ? Cette action est irréversible.')) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}
              className="btn-danger text-sm"
            >
              Réinitialiser toutes les données
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
