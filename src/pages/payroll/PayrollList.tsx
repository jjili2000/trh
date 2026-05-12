import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight, X } from 'lucide-react';
import { api } from '../../api/client';
import { PayrollPeriod, PayrollStatus } from '../../types';

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, n: number): string {
  const [y, m, day] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, day + n);
  return localDateStr(d);
}

function computeEndDate(startStr: string): string {
  // Fin = J/M+1 - 1 jour  →  new Date(year, month, day-1) en utilisant month 1-based
  // (JS month est 0-based donc month 1-based = month+1 en 0-based = mois suivant)
  const [year, month, day] = startStr.split('-').map(Number);
  const end = new Date(year, month, day - 1); // month = next month in 0-based JS
  return localDateStr(end);
}

const statusBadge: Record<PayrollStatus, { label: string; cls: string }> = {
  draft:     { label: 'Brouillon', cls: 'bg-gray-100 text-gray-600' },
  validated: { label: 'Validée',   cls: 'bg-green-100 text-green-700' },
};

type SortField = 'startDate' | 'endDate' | 'status' | 'createdAt';
type SortDir = 'asc' | 'desc';

export default function PayrollList() {
  const navigate = useNavigate();
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtres / tri / recherche
  const [filterStatus, setFilterStatus] = useState<PayrollStatus | ''>('');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('startDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Modale création
  const [showModal, setShowModal] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PayrollPeriod[]>('/payroll')
      .then(setPeriods)
      .catch(() => setError('Erreur lors du chargement des périodes'))
      .finally(() => setLoading(false));
  }, []);

  // Quand on ouvre la modale : charger le latest-end-date
  const openModal = async () => {
    setCreateError(null);
    setStartDate('');
    setEndDate('');
    try {
      const { endDate: latest } = await api.get<{ endDate: string | null }>('/payroll/latest-end-date');
      if (latest) {
        const newStart = addDays(latest, 1);
        setStartDate(newStart);
        setEndDate(computeEndDate(newStart));
      }
    } catch {
      // ignorer, on laisse vide
    }
    setShowModal(true);
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (val) {
      setEndDate(computeEndDate(val));
    } else {
      setEndDate('');
    }
  };

  const handleCreate = async () => {
    if (!startDate || !endDate) {
      setCreateError('Veuillez renseigner les deux dates');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const period = await api.post<PayrollPeriod>('/payroll', { startDate, endDate });
      navigate(`/payroll/${period.id}`);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Erreur lors de la création');
      setCreating(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Filtrage + tri + recherche
  const filtered = periods
    .filter(p => !filterStatus || p.status === filterStatus)
    .filter(p => {
      if (!search) return true;
      const txt = `${fmtDate(p.startDate)} ${fmtDate(p.endDate)}`.toLowerCase();
      return txt.includes(search.toLowerCase());
    })
    .sort((a, b) => {
      let va: string, vb: string;
      if (sortField === 'startDate') { va = a.startDate; vb = b.startDate; }
      else if (sortField === 'endDate') { va = a.endDate; vb = b.endDate; }
      else if (sortField === 'status') { va = a.status; vb = b.status; }
      else { va = a.createdAt; vb = b.createdAt; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const SortIndicator = ({ field }: { field: SortField }) => (
    <span className="ml-1 text-xs">
      {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Périodes de paie</h1>
        <button className="btn-primary flex items-center gap-2" onClick={openModal}>
          <Plus size={16} />
          Nouvelle période
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {/* Filtres */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div>
          <label className="label text-xs">Statut</label>
          <select
            className="input text-sm"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as PayrollStatus | '')}
          >
            <option value="">Tous</option>
            <option value="draft">Brouillon</option>
            <option value="validated">Validée</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="label text-xs">Rechercher</label>
          <input
            className="input text-sm"
            placeholder="Rechercher par date…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p className="text-gray-500 py-8 text-center">Chargement…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 py-8 text-center">Aucune période de paie</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th
                  className="pb-3 pr-4 cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort('startDate')}
                >
                  Période <SortIndicator field="startDate" />
                </th>
                <th
                  className="pb-3 pr-4 cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort('status')}
                >
                  Statut <SortIndicator field="status" />
                </th>
                <th
                  className="pb-3 pr-4 cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort('createdAt')}
                >
                  Créé le <SortIndicator field="createdAt" />
                </th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(period => {
                const badge = statusBadge[period.status];
                return (
                  <tr
                    key={period.id}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/payroll/${period.id}`)}
                  >
                    <td className="py-3 pr-4 font-medium text-gray-800">
                      du {fmtDate(period.startDate)} au {fmtDate(period.endDate)} inclus
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-sm text-gray-500">
                      {new Date(period.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        className="btn-secondary text-xs flex items-center gap-1 ml-auto"
                        onClick={e => { e.stopPropagation(); navigate(`/payroll/${period.id}`); }}
                      >
                        Voir <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modale création */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onMouseDown={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Nouvelle période de paie</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {createError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
                {createError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="label">Date de début</label>
                <input
                  type="date"
                  className="input"
                  value={startDate}
                  onChange={e => handleStartDateChange(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Date de fin</label>
                <input
                  type="date"
                  className="input"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
              {startDate && endDate && (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                  du <strong>{fmtDate(startDate)}</strong> au <strong>{fmtDate(endDate)}</strong> inclus
                </p>
              )}
            </div>

            <div className="flex gap-3 justify-end mt-5">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>
                Annuler
              </button>
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? 'Création…' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
