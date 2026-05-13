import { useNavigate } from 'react-router-dom';
import { useState, useCallback, ReactNode, ElementType } from 'react';
import {
  Clock, Calendar, Receipt, Users, TrendingUp, CheckCircle,
  AlertCircle, FileText, Settings2, X, ArrowUp, ArrowDown,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

// ────────────────────────────────────────────────────────────────────────────
// Catalogue des tuiles
// ────────────────────────────────────────────────────────────────────────────

type TileId =
  | 'stat_time'
  | 'stat_absences'
  | 'stat_expenses'
  | 'stat_documents'
  | 'stat_users'
  | 'stat_monthly_hours'
  | 'quick_actions';

interface TileDef {
  id: TileId;
  label: string;
  description: string;
  type: 'stat' | 'full'; // stat = petite carte dans une grille, full = pleine largeur
  module?: string;        // module requis
  adminOnly?: boolean;
  nonAdminOnly?: boolean;
}

const TILE_DEFS: TileDef[] = [
  {
    id: 'stat_time',
    label: 'Saisie des temps',
    description: 'Heures ce mois + entrées en attente',
    type: 'stat',
    module: 'time',
  },
  {
    id: 'stat_absences',
    label: 'Absences',
    description: "Demandes d'absence en attente",
    type: 'stat',
    module: 'absences',
  },
  {
    id: 'stat_expenses',
    label: 'Notes de frais',
    description: 'Notes en attente de validation',
    type: 'stat',
    module: 'expenses',
  },
  {
    id: 'stat_documents',
    label: 'Documents',
    description: 'Documents en attente / disponibles',
    type: 'stat',
    module: 'documents',
  },
  {
    id: 'stat_users',
    label: 'Utilisateurs',
    description: 'Nombre total de membres enregistrés',
    type: 'stat',
    adminOnly: true,
  },
  {
    id: 'stat_monthly_hours',
    label: 'Mes heures ce mois',
    description: 'Total de vos heures travaillées ce mois',
    type: 'stat',
    module: 'time',
    nonAdminOnly: true,
  },
  {
    id: 'quick_actions',
    label: 'Actions rapides',
    description: 'Raccourcis : saisir, déclarer, valider',
    type: 'full',
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Persistance des préférences (localStorage par utilisateur)
// ────────────────────────────────────────────────────────────────────────────

interface TilePref {
  id: TileId;
  visible: boolean;
}

function getDefaultPrefs(availableIds: TileId[]): TilePref[] {
  return TILE_DEFS
    .filter(d => availableIds.includes(d.id))
    .map(d => ({ id: d.id, visible: true }));
}

function loadPrefs(userId: string, availableIds: TileId[]): TilePref[] {
  try {
    const raw = localStorage.getItem(`trh_dashboard_${userId}`);
    if (!raw) return getDefaultPrefs(availableIds);
    const saved = JSON.parse(raw) as TilePref[];
    // Conserver l'ordre sauvegardé, ignorer les tuiles disparues, ajouter les nouvelles
    const valid = saved.filter(p => availableIds.includes(p.id));
    const fresh = availableIds
      .filter(id => !valid.find(p => p.id === id))
      .map(id => ({ id, visible: true }));
    return [...valid, ...fresh];
  } catch {
    return getDefaultPrefs(availableIds);
  }
}

function savePrefs(userId: string, prefs: TilePref[]) {
  try {
    localStorage.setItem(`trh_dashboard_${userId}`, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

// ────────────────────────────────────────────────────────────────────────────
// StatCard
// ────────────────────────────────────────────────────────────────────────────

function StatCard({
  title, value, subtitle, icon: Icon, color, onClick,
}: {
  title: string; value: string | number; subtitle: string;
  icon: ElementType; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="card text-left hover:shadow-md transition-shadow cursor-pointer w-full group"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
        </div>
        <div className={`p-3 rounded-xl ${color} group-hover:scale-110 transition-transform`}>
          <Icon size={22} className="text-white" />
        </div>
      </div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Drawer de personnalisation
// ────────────────────────────────────────────────────────────────────────────

function CustomizeDrawer({
  open, onClose, prefs, availableDefs, onChange,
}: {
  open: boolean;
  onClose: () => void;
  prefs: TilePref[];
  availableDefs: TileDef[];
  onChange: (p: TilePref[]) => void;
}) {
  const toggle = (id: TileId) =>
    onChange(prefs.map(p => p.id === id ? { ...p, visible: !p.visible } : p));

  const move = (id: TileId, dir: -1 | 1) => {
    const idx = prefs.findIndex(p => p.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= prefs.length) return;
    const copy = [...prefs];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    onChange(copy);
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-80 bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Personnaliser</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <p className="px-5 py-2.5 text-xs text-gray-400 bg-gray-50 border-b border-gray-100">
          Activez les tuiles souhaitées et réorganisez-les avec les flèches.
        </p>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {prefs.map((pref, idx) => {
            const def = availableDefs.find(d => d.id === pref.id);
            if (!def) return null;
            return (
              <div
                key={pref.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                  pref.visible
                    ? 'bg-white border-gray-200'
                    : 'bg-gray-50 border-gray-100'
                }`}
              >
                {/* Flèches */}
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
                    onClick={() => move(pref.id, -1)}
                    disabled={idx === 0}
                    title="Monter"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
                    onClick={() => move(pref.id, 1)}
                    disabled={idx === prefs.length - 1}
                    title="Descendre"
                  >
                    <ArrowDown size={13} />
                  </button>
                </div>

                {/* Libellé */}
                <div className={`flex-1 min-w-0 transition-opacity ${pref.visible ? '' : 'opacity-40'}`}>
                  <p className="text-sm font-medium text-gray-700 truncate">{def.label}</p>
                  <p className="text-xs text-gray-400 truncate">{def.description}</p>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => toggle(pref.id)}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 focus:outline-none ${
                    pref.visible ? 'bg-tennis-green' : 'bg-gray-200'
                  }`}
                  title={pref.visible ? 'Masquer' : 'Afficher'}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      pref.visible ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100">
          <button
            className="w-full btn-secondary text-sm"
            onClick={() => onChange(getDefaultPrefs(prefs.map(p => p.id)))}
          >
            Réinitialiser par défaut
          </button>
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Dashboard
// ────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { currentUser, timeEntries, absenceRequests, expenses, documents, users } = useApp();
  const navigate = useNavigate();

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const isAdmin = currentUser?.role === 'admin';
  const modules: string[] = currentUser?.moduleAccess ?? [];
  const hasModule = (m: string) => isAdmin || modules.includes(m);

  // ── Tuiles disponibles pour cet utilisateur ─────────────────────────────
  const availableDefs = TILE_DEFS.filter(d => {
    if (d.adminOnly && !isAdmin) return false;
    if (d.nonAdminOnly && isAdmin) return false;
    if (d.module && !hasModule(d.module)) return false;
    return true;
  });
  const availableIds = availableDefs.map(d => d.id);

  // ── Préférences ──────────────────────────────────────────────────────────
  const userId = currentUser?.id ?? '';
  const [prefs, setPrefsState] = useState<TilePref[]>(() =>
    loadPrefs(userId, availableIds)
  );
  const [showCustomize, setShowCustomize] = useState(false);

  const setPrefs = useCallback((next: TilePref[]) => {
    setPrefsState(next);
    savePrefs(userId, next);
  }, [userId]);

  // ── Calculs ──────────────────────────────────────────────────────────────
  const myTimeEntries = timeEntries.filter(e =>
    isAdmin ||
    e.userId === currentUser?.id ||
    users.find(u => u.id === e.userId)?.managerId === currentUser?.id
  );
  const hoursThisMonth = timeEntries
    .filter(e => {
      const d = new Date(e.date);
      return e.userId === currentUser?.id &&
        d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((sum, e) => sum + e.hours, 0);
  const pendingTime = myTimeEntries.filter(e => e.status === 'pending').length;

  const myAbsences = absenceRequests.filter(r =>
    isAdmin ||
    r.userId === currentUser?.id ||
    users.find(u => u.id === r.userId)?.managerId === currentUser?.id
  );
  const pendingAbsences = myAbsences.filter(r => r.status === 'pending').length;

  const myExpenses = expenses.filter(e => isAdmin || e.userId === currentUser?.id);
  const pendingExpenses = myExpenses.filter(e => e.status === 'pending').length;

  const pendingDocuments = documents.filter(d => d.status === 'pending_validation').length;
  const myValidatedDocuments = documents.filter(
    d => d.userId === currentUser?.id && d.status === 'validated'
  ).length;

  const isManagerOrAdmin = isAdmin || users.some(u => u.managerId === currentUser?.id);

  const greeting = () => {
    const h = now.getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  };

  const pendingAlertParts = [
    hasModule('time')     && pendingTime > 0    && `${pendingTime} saisie(s) de temps`,
    hasModule('absences') && pendingAbsences > 0 && `${pendingAbsences} demande(s) d'absence`,
    hasModule('expenses') && pendingExpenses > 0 && `${pendingExpenses} note(s) de frais`,
  ].filter(Boolean) as string[];
  const showPendingAlert = isManagerOrAdmin && pendingAlertParts.length > 0;

  // ── Rendu des tuiles ─────────────────────────────────────────────────────

  const renderStatTile = (id: TileId): ReactNode => {
    switch (id) {
      case 'stat_time':
        return (
          <StatCard
            key={id}
            title="Saisie des temps"
            value={`${hoursThisMonth}h`}
            subtitle={`${pendingTime} en attente`}
            icon={Clock}
            color="bg-tennis-green"
            onClick={() => navigate('/time')}
          />
        );
      case 'stat_absences':
        return (
          <StatCard
            key={id}
            title="Absences"
            value={pendingAbsences}
            subtitle="demandes en attente"
            icon={Calendar}
            color="bg-blue-500"
            onClick={() => navigate('/absences')}
          />
        );
      case 'stat_expenses':
        return (
          <StatCard
            key={id}
            title="Notes de frais"
            value={pendingExpenses}
            subtitle="en attente de validation"
            icon={Receipt}
            color="bg-orange-500"
            onClick={() => navigate('/expenses')}
          />
        );
      case 'stat_documents':
        return isManagerOrAdmin ? (
          <StatCard
            key={id}
            title="Documents"
            value={pendingDocuments}
            subtitle="en attente de validation"
            icon={FileText}
            color="bg-teal-500"
            onClick={() => navigate('/documents')}
          />
        ) : (
          <StatCard
            key={id}
            title="Mes documents"
            value={myValidatedDocuments}
            subtitle="documents disponibles"
            icon={FileText}
            color="bg-teal-500"
            onClick={() => navigate('/my-documents')}
          />
        );
      case 'stat_users':
        return (
          <StatCard
            key={id}
            title="Utilisateurs"
            value={users.length}
            subtitle="membres enregistrés"
            icon={Users}
            color="bg-purple-500"
            onClick={() => navigate('/admin')}
          />
        );
      case 'stat_monthly_hours':
        return (
          <StatCard
            key={id}
            title="Ce mois-ci"
            value={`${hoursThisMonth}h`}
            subtitle="heures travaillées"
            icon={TrendingUp}
            color="bg-tennis-green-light"
            onClick={() => navigate('/time')}
          />
        );
      default:
        return null;
    }
  };

  const renderFullTile = (id: TileId): ReactNode => {
    switch (id) {
      case 'quick_actions': {
        const hasAny = hasModule('time') || hasModule('absences') ||
          hasModule('expenses') || isManagerOrAdmin;
        if (!hasAny) return null;
        return (
          <div key={id} className="card">
            <h2 className="font-semibold text-gray-900 mb-4">Actions rapides</h2>
            <div className="flex flex-wrap gap-3">
              {hasModule('time') && (
                <button
                  onClick={() => navigate('/time', { state: { openForm: true } })}
                  className="btn-primary flex items-center gap-2"
                >
                  <Clock size={16} />
                  Saisir des heures
                </button>
              )}
              {hasModule('absences') && (
                <button
                  onClick={() => navigate('/absences', { state: { openForm: true } })}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Calendar size={16} />
                  Déclarer une absence
                </button>
              )}
              {hasModule('expenses') && (
                <button
                  onClick={() => navigate('/expenses', { state: { openForm: true } })}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Receipt size={16} />
                  Soumettre une note de frais
                </button>
              )}
              {isManagerOrAdmin && (
                <button
                  onClick={() => navigate(isAdmin ? '/admin' : '/time', { state: { showTeam: true } })}
                  className="btn-secondary flex items-center gap-2"
                >
                  <CheckCircle size={16} />
                  Valider les demandes
                </button>
              )}
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  // ── Assemblage des sections (tuiles stat groupées en grille) ──────────────
  const visiblePrefs = prefs.filter(p => p.visible);
  const sections: ReactNode[] = [];
  let statBatch: TileId[] = [];

  const flushStatBatch = () => {
    if (statBatch.length === 0) return;
    const batch = [...statBatch];
    sections.push(
      <div key={`stat-${batch[0]}`} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {batch.map(id => renderStatTile(id))}
      </div>
    );
    statBatch = [];
  };

  for (const pref of visiblePrefs) {
    const def = availableDefs.find(d => d.id === pref.id);
    if (!def) continue;
    if (def.type === 'stat') {
      statBatch.push(pref.id);
    } else {
      flushStatBatch();
      const node = renderFullTile(pref.id);
      if (node) sections.push(node);
    }
  }
  flushStatBatch();

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-8">
      {/* En-tête */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting()}, {currentUser?.firstName} !
          </h1>
          <p className="text-gray-500 mt-1">
            {now.toLocaleDateString('fr-FR', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
        </div>
        <button
          onClick={() => setShowCustomize(true)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors mt-1 flex-shrink-0"
          title="Personnaliser le tableau de bord"
        >
          <Settings2 size={16} />
          <span className="hidden sm:inline">Personnaliser</span>
        </button>
      </div>

      {/* Bandeau alertes */}
      {showPendingAlert && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
          <AlertCircle size={20} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            Vous avez {pendingAlertParts.join(', ')} en attente de validation.
          </p>
        </div>
      )}

      {/* Tuiles */}
      {sections.length > 0 ? (
        <div className="space-y-6">{sections}</div>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <Settings2 size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Aucune tuile affichée.</p>
          <button
            className="mt-3 text-sm text-tennis-green hover:underline"
            onClick={() => setShowCustomize(true)}
          >
            Personnaliser le tableau de bord
          </button>
        </div>
      )}

      {/* Drawer */}
      <CustomizeDrawer
        open={showCustomize}
        onClose={() => setShowCustomize(false)}
        prefs={prefs}
        availableDefs={availableDefs}
        onChange={setPrefs}
      />
    </div>
  );
}
