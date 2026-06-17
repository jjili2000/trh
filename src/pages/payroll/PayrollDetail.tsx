import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, CheckCircle, X, Trash2, RotateCcw } from 'lucide-react';
import { api, getToken } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { PayrollDetail as IPayrollDetail, PayrollPeriod, PayrollUserRow } from '../../types';

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtCurrency(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function computeEndDate(startStr: string): string {
  const [year, month, day] = startStr.split('-').map(Number);
  const end = new Date(year, month, day - 1);
  return localDateStr(end);
}

type DetailTab = 'heures' | 'absences' | 'frais';

export default function PayrollDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const isAdmin = currentUser?.role === 'admin';

  const [data, setData] = useState<IPayrollDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edition des dates (brouillon seulement)
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [datesChanged, setDatesChanged] = useState(false);
  const [savingDates, setSavingDates] = useState(false);

  // Validation
  const [confirmValidate, setConfirmValidate] = useState(false);
  const [validating, setValidating] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  // Panneau détail utilisateur
  const [detailUser, setDetailUser] = useState<PayrollUserRow | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('heures');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<IPayrollDetail>(`/payroll/${id}`);
      setData(d);
      setEditStart(d.period.startDate);
      setEditEnd(d.period.endDate);
      setDatesChanged(false);
    } catch {
      setError('Erreur lors du chargement de la période');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleStartChange = (val: string) => {
    setEditStart(val);
    if (val) {
      const newEnd = computeEndDate(val);
      setEditEnd(newEnd);
    }
    setDatesChanged(true);
  };

  const handleEndChange = (val: string) => {
    setEditEnd(val);
    setDatesChanged(true);
  };

  const handleSaveDates = async () => {
    if (!editStart || !editEnd) return;
    setSavingDates(true);
    try {
      const updated = await api.put<PayrollPeriod>(`/payroll/${id}`, { startDate: editStart, endDate: editEnd });
      setData(prev => prev ? { ...prev, period: updated } : prev);
      setDatesChanged(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setSavingDates(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const updated = await api.put<PayrollPeriod>(`/payroll/${id}/validate`, {});
      setData(prev => prev ? { ...prev, period: updated } : prev);
      setConfirmValidate(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la validation');
    } finally {
      setValidating(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/payroll/${id}/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Erreur export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const period = data?.period;
      a.download = period
        ? `paie_${period.startDate}_${period.endDate}.xlsx`
        : 'paie.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Erreur lors de l\'export Excel');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Chargement…</div>;
  if (!data) return <div className="p-6 text-center text-red-500">{error || 'Période non trouvée'}</div>;

  const { period, rows } = data;
  const isDraft = period.status === 'draft';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => navigate('/payroll')} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-800 flex-1">Détail de la période</h1>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          isDraft ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'
        }`}>
          {isDraft ? 'Brouillon' : 'Validée'}
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
          <button className="ml-2 underline text-xs" onClick={() => setError(null)}>Fermer</button>
        </div>
      )}

      {/* Dates */}
      <div className="card mb-6">
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="label text-xs">Date de début</label>
            <input
              type="date"
              className={`input text-sm ${!isDraft ? 'bg-gray-50 cursor-not-allowed' : ''}`}
              value={editStart}
              onChange={e => isDraft && handleStartChange(e.target.value)}
              readOnly={!isDraft}
            />
          </div>
          <div>
            <label className="label text-xs">Date de fin</label>
            <input
              type="date"
              className={`input text-sm ${!isDraft ? 'bg-gray-50 cursor-not-allowed' : ''}`}
              value={editEnd}
              onChange={e => isDraft && handleEndChange(e.target.value)}
              readOnly={!isDraft}
            />
          </div>
          {editStart && editEnd && (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 self-end mb-0.5">
              du <strong>{fmtDate(editStart)}</strong> au <strong>{fmtDate(editEnd)}</strong> inclus
            </p>
          )}
          {isDraft && datesChanged && (
            <button
              className="btn-primary text-sm self-end mb-0.5"
              onClick={handleSaveDates}
              disabled={savingDates}
            >
              {savingDates ? 'Enregistrement…' : 'Enregistrer les dates'}
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {isDraft && (
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => setConfirmValidate(true)}
          >
            <CheckCircle size={16} />
            Valider la période
          </button>
        )}
        {isDraft && (
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            onClick={async () => {
              if (!confirm('Supprimer cette période de paie ?')) return;
              try {
                await api.delete(`/payroll/${id}`);
                navigate('/payroll');
              } catch {
                alert('Erreur lors de la suppression');
              }
            }}
          >
            <Trash2 size={16} />
            Supprimer
          </button>
        )}
        {!isDraft && (
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={handleExport}
            disabled={exporting}
          >
            <Download size={16} />
            {exporting ? 'Export…' : 'Exporter Excel'}
          </button>
        )}
        {!isDraft && isAdmin && (
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors"
            onClick={async () => {
              if (!confirm('Réouvrir cette période ? Elle repassera en brouillon et pourra être modifiée.')) return;
              try {
                const updated = await api.put<PayrollPeriod>(`/payroll/${id}/reopen`, {});
                setData(prev => prev ? { ...prev, period: updated } : prev);
              } catch (err: unknown) {
                alert(err instanceof Error ? err.message : 'Erreur lors de la réouverture');
              }
            }}
          >
            <RotateCcw size={16} />
            Réouvrir
          </button>
        )}
      </div>

      {/* Tableau des users */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Récapitulatif par employé</h2>
        {rows.length === 0 ? (
          <p className="text-gray-400 text-sm py-4 text-center">
            Aucune donnée validée dans cette période
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="pb-3 pr-4">Employé</th>
                <th className="pb-3 pr-4 text-right">Total heures</th>
                <th className="pb-3 pr-4 text-right">Jours d'absence</th>
                <th className="pb-3 pr-4 text-right">Montant frais</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.userId} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="py-3 pr-4 font-medium text-gray-800">
                    {row.lastName} {row.firstName}
                  </td>
                  <td className="py-3 pr-4 text-right text-sm text-gray-700">
                    {row.totalHours.toFixed(2)} h
                  </td>
                  <td className="py-3 pr-4 text-right text-sm text-gray-700">
                    {row.absenceDays} j
                  </td>
                  <td className="py-3 pr-4 text-right text-sm text-gray-700">
                    {fmtCurrency(row.totalExpenses)}
                  </td>
                  <td className="py-3">
                    <button
                      className="btn-secondary text-xs"
                      onClick={() => { setDetailUser(row); setDetailTab('heures'); }}
                    >
                      Détail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modale de confirmation validation */}
      {confirmValidate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onMouseDown={e => { if (e.target === e.currentTarget) setConfirmValidate(false); }}
        >
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-3">Valider la période ?</h2>
            <p className="text-sm text-gray-600 mb-5">
              Une fois validée, la période ne pourra plus être modifiée. Êtes-vous sûr de vouloir continuer ?
            </p>
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary" onClick={() => setConfirmValidate(false)}>
                Annuler
              </button>
              <button
                className="btn-primary"
                onClick={handleValidate}
                disabled={validating}
              >
                {validating ? 'Validation…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panneau détail utilisateur */}
      {detailUser && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onMouseDown={e => { if (e.target === e.currentTarget) setDetailUser(null); }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800">
                {detailUser.lastName} {detailUser.firstName}
              </h2>
              <button onClick={() => setDetailUser(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-6 pt-3 border-b border-gray-100">
              {(['heures', 'absences', 'frais'] as DetailTab[]).map(tab => (
                <button
                  key={tab}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                    detailTab === tab
                      ? 'border-tennis-green text-tennis-green'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                  onClick={() => setDetailTab(tab)}
                >
                  {tab === 'heures' && `Heures (${detailUser.totalHours.toFixed(2)} h)`}
                  {tab === 'absences' && `Absences (${detailUser.absenceDays} j)`}
                  {tab === 'frais' && `Frais (${fmtCurrency(detailUser.totalExpenses)})`}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {detailTab === 'heures' && (
                detailUser.timeEntries.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-6">Aucune heure dans cette période</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-100">
                        <th className="pb-2 pr-4 pl-6 pt-4">Date</th>
                        <th className="pb-2 pr-4">Heures</th>
                        <th className="pb-2 pr-4">Description</th>
                        <th className="pb-2 pr-6">Validé le</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailUser.timeEntries.map((te, i) => (
                        <tr key={te.id} className={`border-b border-gray-50 ${i === detailUser.timeEntries.length - 1 ? 'last:border-0' : ''}`}>
                          <td className="py-2 pr-4 pl-6">{fmtDate(te.date)}</td>
                          <td className="py-2 pr-4 font-medium">{te.hours} h</td>
                          <td className="py-2 pr-4 text-gray-600">{te.description || '—'}</td>
                          <td className="py-2 pr-6 text-gray-500 text-xs">
                            {te.validatedAt ? new Date(te.validatedAt).toLocaleDateString('fr-FR') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {detailTab === 'absences' && (
                detailUser.absenceRequests.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-6">Aucune absence dans cette période</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-100">
                        <th className="pb-2 pr-4 pl-6 pt-4">Début</th>
                        <th className="pb-2 pr-4">Fin</th>
                        <th className="pb-2 pr-4">Type</th>
                        <th className="pb-2 pr-4">Raison</th>
                        <th className="pb-2 pr-6">Validé le</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailUser.absenceRequests.map(ar => (
                        <tr key={ar.id} className="border-b border-gray-50">
                          <td className="py-2 pr-4 pl-6">{fmtDate(ar.startDate)}</td>
                          <td className="py-2 pr-4">{fmtDate(ar.endDate)}</td>
                          <td className="py-2 pr-4 text-gray-600">{ar.type}</td>
                          <td className="py-2 pr-4 text-gray-600">{ar.reason || '—'}</td>
                          <td className="py-2 pr-6 text-gray-500 text-xs">
                            {ar.validatedAt ? new Date(ar.validatedAt).toLocaleDateString('fr-FR') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}

              {detailTab === 'frais' && (
                detailUser.expenses.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-6">Aucun frais dans cette période</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="text-left text-xs font-semibold text-gray-500 uppercase border-b border-gray-100">
                        <th className="pb-2 pr-4 pl-6 pt-4">Date</th>
                        <th className="pb-2 pr-4">Raison</th>
                        <th className="pb-2 pr-4 text-right">Montant</th>
                        <th className="pb-2 pr-6">Validé le</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailUser.expenses.map(exp => (
                        <tr key={exp.id} className="border-b border-gray-50">
                          <td className="py-2 pr-4 pl-6">{fmtDate(exp.date)}</td>
                          <td className="py-2 pr-4 text-gray-600">{exp.reason}</td>
                          <td className="py-2 pr-4 text-right font-medium">{fmtCurrency(exp.amount)}</td>
                          <td className="py-2 pr-6 text-gray-500 text-xs">
                            {exp.validatedAt ? new Date(exp.validatedAt).toLocaleDateString('fr-FR') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
