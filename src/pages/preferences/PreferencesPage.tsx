import { useState, useEffect } from 'react';
import { SlidersHorizontal, Bell, Mail } from 'lucide-react';
import { api } from '../../api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChannelPrefs  { inApp: boolean; email: boolean; }
interface DirectionPrefs { action: ChannelPrefs; response: ChannelPrefs; }
type AllPrefs = Record<string, DirectionPrefs>;

// ─── Constantes ───────────────────────────────────────────────────────────────

const MODULES = [
  { key: 'time',      label: 'Saisie des temps',  hasAction: true  },
  { key: 'absences',  label: 'Absences',           hasAction: true  },
  { key: 'expenses',  label: 'Notes de frais',     hasAction: true  },
  { key: 'documents', label: 'Documents',          hasAction: false },
  { key: 'budgets',   label: 'Budgets',            hasAction: true  },
] as const;

const DEFAULT_PREFS: AllPrefs = Object.fromEntries(
  MODULES.map(m => [m.key, {
    action:   { inApp: true, email: true },
    response: { inApp: true, email: true },
  }])
);

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={value}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        value ? 'bg-tennis-green' : 'bg-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform ring-0 transition duration-200 ease-in-out ${
          value ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PreferencesPage() {
  const [prefs, setPrefs]     = useState<AllPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved]     = useState(false);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    api.get<AllPrefs>('/users/preferences')
      .then(data => { setPrefs(data); setLoading(false); })
      .catch(()   => setLoading(false));
  }, []);

  async function toggle(module: string, direction: 'action' | 'response', channel: 'inApp' | 'email') {
    const current = prefs[module]?.[direction] ?? { inApp: true, email: true };
    const updated: ChannelPrefs = { ...current, [channel]: !current[channel] };

    // Optimistic update
    setPrefs(prev => ({
      ...prev,
      [module]: { ...prev[module], [direction]: updated },
    }));
    setSaved(false);
    setSaving(true);

    try {
      const data = await api.put<AllPrefs>('/users/preferences', {
        module,
        direction,
        inApp: updated.inApp,
        email: updated.email,
      });
      setPrefs(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // Rollback
      setPrefs(prev => ({
        ...prev,
        [module]: { ...prev[module], [direction]: current },
      }));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse h-8 bg-gray-200 rounded w-48 mb-6" />
        <div className="animate-pulse h-64 bg-gray-200 rounded" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <SlidersHorizontal size={24} className="text-tennis-green" />
        <h1 className="text-2xl font-bold text-gray-900">Préférences</h1>
      </div>

      <div className="card p-6">
        {/* En-tête section */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">Notifications</h2>
          {saved && (
            <span className="text-sm text-tennis-green font-medium">
              Préférences enregistrées
            </span>
          )}
          {saving && !saved && (
            <span className="text-sm text-gray-400">Enregistrement…</span>
          )}
        </div>

        {/* Légende canaux */}
        <div className="flex items-center gap-6 mb-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <Bell size={12} /> Application
          </span>
          <span className="flex items-center gap-1.5">
            <Mail size={12} /> Email
          </span>
        </div>

        {/* Grille */}
        <div className="overflow-x-auto -mx-2">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left font-medium text-gray-600 pb-2 pl-2 w-40">Module</th>
                <th className="text-center font-medium text-gray-600 pb-2 px-2" colSpan={2}>
                  <span className="inline-flex items-center gap-1.5 text-amber-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    À valider
                  </span>
                </th>
                <th className="text-center font-medium text-gray-600 pb-2 px-2" colSpan={2}>
                  <span className="inline-flex items-center gap-1.5 text-blue-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                    Retour sur demande
                  </span>
                </th>
              </tr>
              <tr className="border-b border-gray-100">
                <th className="pb-2 pl-2" />
                <th className="text-center pb-2 px-3">
                  <Bell size={13} className="mx-auto text-gray-400" />
                </th>
                <th className="text-center pb-2 px-3">
                  <Mail size={13} className="mx-auto text-gray-400" />
                </th>
                <th className="text-center pb-2 px-3">
                  <Bell size={13} className="mx-auto text-gray-400" />
                </th>
                <th className="text-center pb-2 px-3">
                  <Mail size={13} className="mx-auto text-gray-400" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {MODULES.map(mod => {
                const mPrefs = prefs[mod.key] ?? DEFAULT_PREFS[mod.key];
                return (
                  <tr key={mod.key} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 pl-2 font-medium text-gray-700">{mod.label}</td>

                    {/* Action — App */}
                    <td className="py-3 px-3 text-center">
                      {mod.hasAction ? (
                        <Toggle
                          value={mPrefs.action.inApp}
                          onChange={() => toggle(mod.key, 'action', 'inApp')}
                        />
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Action — Email */}
                    <td className="py-3 px-3 text-center">
                      {mod.hasAction ? (
                        <Toggle
                          value={mPrefs.action.email}
                          onChange={() => toggle(mod.key, 'action', 'email')}
                        />
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Response — App */}
                    <td className="py-3 px-3 text-center">
                      <Toggle
                        value={mPrefs.response.inApp}
                        onChange={() => toggle(mod.key, 'response', 'inApp')}
                      />
                    </td>

                    {/* Response — Email */}
                    <td className="py-3 px-3 text-center">
                      <Toggle
                        value={mPrefs.response.email}
                        onChange={() => toggle(mod.key, 'response', 'email')}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Note explicative */}
        <div className="mt-5 pt-4 border-t border-gray-100 space-y-1">
          <p className="text-xs text-gray-500">
            <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
              À valider
            </span>
            {' '}— notification reçue lorsque quelqu'un vous soumet une demande (managers et validateurs).
          </p>
          <p className="text-xs text-gray-500">
            <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
              Retour sur demande
            </span>
            {' '}— notification reçue lorsque l'une de vos demandes est approuvée ou refusée.
          </p>
        </div>
      </div>
    </div>
  );
}
