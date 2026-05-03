import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, ChevronRight, X } from 'lucide-react';
import { api } from '../../api/client';
import { Season, SeasonStatus } from '../../types';

const STATUS_CFG: Record<SeasonStatus, { label: string; color: string }> = {
  draft:     { label: 'Brouillon', color: 'bg-gray-100 text-gray-600' },
  published: { label: 'Publiée',   color: 'bg-green-100 text-green-700' },
  closed:    { label: 'Clôturée',  color: 'bg-blue-100 text-blue-700' },
  deleted:   { label: 'Supprimée', color: 'bg-red-100 text-red-700' },
};

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin',
                 'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function computeEndDate(month: number, year: number): string {
  const d = new Date(year + 1, month - 1, 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().substring(0, 10);
}

export default function SeasonList() {
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', startMonth: 9, startYear: new Date().getFullYear() });
  const [nameEdited, setNameEdited] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setSeasons(await api.get<Season[]>('/seasons')); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const autoName = (m: number, y: number) => `Saison ${y}-${y + 1}`;

  const openNew = () => {
    let month = 9, year = new Date().getFullYear();
    if (seasons.length > 0) {
      const latest = [...seasons].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
      const next = new Date(latest.endDate + 'T00:00:00');
      next.setDate(next.getDate() + 1);
      month = next.getMonth() + 1;
      year  = next.getFullYear();
    }
    setForm({ name: autoName(month, year), startMonth: month, startYear: year });
    setNameEdited(false);
    setFormError('');
    setShowModal(true);
  };

  const updateDates = (month: number, year: number) => {
    setForm(f => ({
      ...f, startMonth: month, startYear: year,
      name: nameEdited ? f.name : autoName(month, year),
    }));
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) { setFormError('Le nom est obligatoire.'); return; }
    setSaving(true);
    try {
      const startDate = `${form.startYear}-${String(form.startMonth).padStart(2, '0')}-01`;
      const endDate   = computeEndDate(form.startMonth, form.startYear);
      await api.post('/seasons', { name: form.name, startDate, endDate });
      await load();
      setShowModal(false);
    } catch { setFormError('Erreur lors de la création.'); }
    finally { setSaving(false); }
  };

  const endPreview = computeEndDate(form.startMonth, form.startYear);
  const endObj     = new Date(endPreview + 'T00:00:00');

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Saisons d'enseignement</h1>
          <p className="text-gray-500 mt-1">Gérez les saisons et leurs calendriers de cours.</p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nouvelle saison
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Chargement…</div>
      ) : seasons.length === 0 ? (
        <div className="card text-center py-16">
          <Calendar size={48} className="mx-auto text-gray-200 mb-4" />
          <h3 className="text-gray-500 font-medium">Aucune saison</h3>
          <p className="text-gray-400 text-sm mt-1">Créez votre première saison d'enseignement.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {seasons.map(s => {
            const cfg = STATUS_CFG[s.status];
            return (
              <div
                key={s.id}
                onClick={() => navigate(`/seasons/${s.id}`)}
                className="card flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-tennis-green/10 flex items-center justify-center flex-shrink-0">
                  <Calendar size={22} className="text-tennis-green" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-gray-900">{s.name}</span>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {formatDate(s.startDate)} → {formatDate(s.endDate)}
                  </p>
                </div>
                <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Nouvelle saison</h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{formError}</div>}
              <div>
                <label className="label">Nom de la saison *</label>
                <input className="input" value={form.name}
                  onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setNameEdited(true); }}
                  required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Mois de début *</label>
                  <select className="input" value={form.startMonth}
                    onChange={e => updateDates(parseInt(e.target.value), form.startYear)}>
                    {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Année *</label>
                  <input type="number" className="input" value={form.startYear} min={2020} max={2040}
                    onChange={e => updateDates(form.startMonth, parseInt(e.target.value))} />
                </div>
              </div>
              <div className="p-3 bg-tennis-green/5 border border-tennis-green/20 rounded-lg text-sm text-gray-600">
                <strong>Période :</strong>{' '}
                1 {MONTHS[form.startMonth - 1]} {form.startYear}
                {' → '}
                {endObj.getDate()} {MONTHS[endObj.getMonth()]} {endObj.getFullYear()}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Annuler</button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Création…' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
