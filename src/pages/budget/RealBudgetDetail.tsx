import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, ChevronDown, ChevronRight,
  FileText, Image, Pencil, X
} from 'lucide-react';
import { api } from '../../api/client';
import { useApp } from '../../context/AppContext';
import {
  RealBudget, RealBudgetLine, BudgetLineDetail,
  BudgetLineType, BudgetAccessGrant
} from '../../types';

function isTreasurer(role: string) {
  return role === 'treasurer' || role === 'admin';
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtCurrency(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

const PAYMENT_METHODS = ['Espèces', 'Virement', 'Chèque', 'Carte bancaire', 'Autre'];

interface DetailForm {
  detailDate: string;
  label: string;
  paymentMethod: string;
  qty: string;
  unitPrice: string;
  receiptFile: string | null;
  receiptFileName: string | null;
  receiptFileType: string | null;
}

const emptyDetailForm = (): DetailForm => ({
  detailDate: '',
  label: '',
  paymentMethod: 'Virement',
  qty: '1',
  unitPrice: '',
  receiptFile: null,
  receiptFileName: null,
  receiptFileType: null,
});

interface AddLineForm {
  type: BudgetLineType;
  label: string;
  forecastAmount: string;
}

export default function RealBudgetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, users } = useApp();

  const [budget, setBudget] = useState<RealBudget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Expanded lines
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());

  // Detail modal
  const [detailModal, setDetailModal] = useState<{
    lineId: string;
    lineType: 'income' | 'expense';
    editId?: string;
  } | null>(null);
  const [detailForm, setDetailForm] = useState<DetailForm>(emptyDetailForm());
  const [savingDetail, setSavingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  // Add line form
  const [showAddLine, setShowAddLine] = useState(false);
  const [addLineForm, setAddLineForm] = useState<AddLineForm>({ type: 'income', label: '', forecastAmount: '' });
  const [savingLine, setSavingLine] = useState(false);

  // Access form
  const [addAccessUserId, setAddAccessUserId] = useState('');
  const [savingAccess, setSavingAccess] = useState(false);

  // Receipt viewer
  const [viewReceipt, setViewReceipt] = useState<{ data: string; name: string; type: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<RealBudget>(`/budgets/real/${id}`);
      setBudget(data);
    } catch {
      setError('Erreur lors du chargement du budget');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!currentUser) return null;

  const canEdit = budget
    ? isTreasurer(currentUser.role) || budget.userId === currentUser.id
    : false;

  const canAddDetails = budget
    ? canEdit || (budget.accessGrants || []).some(g => g.userId === currentUser.id)
    : false;

  const toggleLine = (lineId: string) => {
    setExpandedLines(prev => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const toggleStatus = async () => {
    if (!budget) return;
    const newStatus = budget.status === 'active' ? 'closed' : 'active';
    try {
      const updated = await api.put<RealBudget>(`/budgets/real/${id}/status`, { status: newStatus });
      setBudget(prev => prev ? { ...prev, status: updated.status } : prev);
    } catch {
      setError('Erreur lors de la mise à jour du statut');
    }
  };

  const handleDeleteLine = async (lineId: string) => {
    if (!confirm('Supprimer cette ligne ?')) return;
    try {
      await api.delete(`/budgets/real/${id}/lines/${lineId}`);
      setBudget(prev => prev ? { ...prev, lines: (prev.lines || []).filter(l => l.id !== lineId) } : prev);
    } catch {
      setError('Erreur lors de la suppression');
    }
  };

  const handleAddLine = async () => {
    if (!addLineForm.label) return;
    setSavingLine(true);
    try {
      const line = await api.post<RealBudgetLine>(`/budgets/real/${id}/lines`, {
        type: addLineForm.type,
        label: addLineForm.label,
        forecastAmount: parseFloat(addLineForm.forecastAmount) || 0,
      });
      setBudget(prev => prev ? { ...prev, lines: [...(prev.lines || []), line] } : prev);
      setAddLineForm({ type: 'income', label: '', forecastAmount: '' });
      setShowAddLine(false);
    } catch {
      setError('Erreur lors de l\'ajout de la ligne');
    } finally {
      setSavingLine(false);
    }
  };

  const openAddDetail = (lineId: string) => {
    const lineType = (budget?.lines ?? []).find(l => l.id === lineId)?.type ?? 'expense';
    setDetailModal({ lineId, lineType });
    setDetailForm(emptyDetailForm());
    setDetailError(null);
  };

  const openEditDetail = (lineId: string, detail: BudgetLineDetail) => {
    const lineType = (budget?.lines ?? []).find(l => l.id === lineId)?.type ?? 'expense';
    setDetailModal({ lineId, lineType, editId: detail.id });
    setDetailForm({
      detailDate: detail.detailDate,
      label: detail.label,
      paymentMethod: detail.paymentMethod,
      qty: '1',
      unitPrice: String(detail.amount),
      receiptFile: detail.receiptFile,
      receiptFileName: detail.receiptFileName,
      receiptFileType: detail.receiptFileType,
    });
    setDetailError(null);
  };

  const handleDetailFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      const base64 = result.split(',')[1];
      setDetailForm(prev => ({
        ...prev,
        receiptFile: base64,
        receiptFileName: file.name,
        receiptFileType: file.type,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveDetail = async () => {
    if (!detailModal) return;
    if (!detailForm.detailDate || !detailForm.label || !detailForm.paymentMethod || !detailForm.unitPrice) {
      setDetailError('Tous les champs obligatoires doivent être remplis');
      return;
    }
    const computedAmount = (parseFloat(detailForm.qty) || 0) * (parseFloat(detailForm.unitPrice) || 0);
    setSavingDetail(true);
    setDetailError(null);
    try {
      const payload = {
        detailDate: detailForm.detailDate,
        label: detailForm.label,
        paymentMethod: detailForm.paymentMethod,
        amount: computedAmount,
        receiptFile: detailForm.receiptFile,
        receiptFileName: detailForm.receiptFileName,
        receiptFileType: detailForm.receiptFileType,
      };
      const { lineId, editId } = detailModal;
      if (editId) {
        const updated = await api.put<BudgetLineDetail>(
          `/budgets/real/${id}/lines/${lineId}/details/${editId}`, payload
        );
        setBudget(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            lines: (prev.lines || []).map(l => {
              if (l.id !== lineId) return l;
              return {
                ...l,
                details: (l.details || []).map(d => d.id === editId ? updated : d),
              };
            }),
          };
        });
        setDetailModal(null);
      } else {
        const created = await api.post<BudgetLineDetail>(
          `/budgets/real/${id}/lines/${lineId}/details`, payload
        );
        setBudget(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            lines: (prev.lines || []).map(l => {
              if (l.id !== lineId) return l;
              return { ...l, details: [...(l.details || []), created] };
            }),
          };
        });
        setExpandedLines(prev => new Set([...prev, lineId]));
        // Keep modal open, reset form, auto-focus label for next entry
        setDetailForm(emptyDetailForm());
        setTimeout(() => labelRef.current?.focus(), 50);
      }
    } catch {
      setDetailError('Erreur lors de l\'enregistrement');
    } finally {
      setSavingDetail(false);
    }
  };

  const handleDeleteDetail = async (lineId: string, detailId: string) => {
    if (!confirm('Supprimer ce détail ?')) return;
    try {
      await api.delete(`/budgets/real/${id}/lines/${lineId}/details/${detailId}`);
      setBudget(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          lines: (prev.lines || []).map(l => {
            if (l.id !== lineId) return l;
            return { ...l, details: (l.details || []).filter(d => d.id !== detailId) };
          }),
        };
      });
    } catch {
      setError('Erreur lors de la suppression');
    }
  };

  const handleAddAccess = async () => {
    if (!addAccessUserId) return;
    setSavingAccess(true);
    try {
      const grant = await api.post<BudgetAccessGrant>(`/budgets/real/${id}/access`, { userId: addAccessUserId });
      setBudget(prev => prev ? { ...prev, accessGrants: [...(prev.accessGrants || []), grant] } : prev);
      setAddAccessUserId('');
    } catch {
      setError('Erreur lors de l\'ajout de l\'accès');
    } finally {
      setSavingAccess(false);
    }
  };

  const handleRevokeAccess = async (grantId: string) => {
    if (!confirm('Révoquer cet accès ?')) return;
    try {
      await api.delete(`/budgets/real/${id}/access/${grantId}`);
      setBudget(prev => prev ? { ...prev, accessGrants: (prev.accessGrants || []).filter(g => g.id !== grantId) } : prev);
    } catch {
      setError('Erreur lors de la révocation');
    }
  };

  const canEditDetail = (detail: BudgetLineDetail) =>
    canEdit || detail.userId === currentUser.id;

  const renderLines = (lineType: BudgetLineType) => {
    const filtered = (budget?.lines || []).filter(l => l.type === lineType);
    const totalForecast = filtered.reduce((s, l) => s + l.forecastAmount, 0);
    const totalRealized = filtered.reduce((s, l) =>
      s + (l.details || []).reduce((ds, d) => ds + d.amount, 0), 0);

    return (
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">
            {lineType === 'income' ? 'Recettes' : 'Dépenses'}
          </h2>
          <div className="text-xs text-gray-500 flex gap-4">
            <span>Prévu: <strong>{fmtCurrency(totalForecast)}</strong></span>
            <span>Réalisé: <strong className={lineType === 'income' ? 'text-green-700' : 'text-red-600'}>{fmtCurrency(totalRealized)}</strong></span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-gray-400 text-sm">Aucune ligne</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(line => {
              const realized = (line.details || []).reduce((s, d) => s + d.amount, 0);
              const diff = line.forecastAmount - realized;
              const isExpanded = expandedLines.has(line.id);

              return (
                <div key={line.id} className="border border-gray-100 rounded-lg overflow-hidden">
                  {/* Line header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => toggleLine(line.id)}
                  >
                    <span className="text-gray-400">
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <span className="flex-1 text-sm font-medium text-gray-800">{line.label}</span>
                    <span className="text-xs text-gray-500">Prévu: {fmtCurrency(line.forecastAmount)}</span>
                    <span className={`text-xs font-medium ${lineType === 'income' ? 'text-green-700' : 'text-red-600'}`}>
                      Réalisé: {fmtCurrency(realized)}
                    </span>
                    <span className={`text-xs ${diff >= 0 ? 'text-gray-500' : 'text-red-600'}`}>
                      Écart: {fmtCurrency(diff)}
                    </span>
                    <div className="flex gap-1 ml-2">
                      {canAddDetails && (
                        <button
                          className="text-xs btn-secondary py-0.5 px-2"
                          onClick={e => { e.stopPropagation(); openAddDetail(line.id); }}
                        >
                          <Plus size={12} className="inline mr-0.5" />
                          Détail
                        </button>
                      )}
                      {canEdit && (
                        <button
                          className="text-red-400 hover:text-red-600 p-1"
                          onClick={e => { e.stopPropagation(); handleDeleteLine(line.id); }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Detail list */}
                  {isExpanded && (
                    <div className="px-3 py-2">
                      {(line.details || []).length === 0 ? (
                        <p className="text-gray-400 text-xs py-1">Aucun détail</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-500 border-b border-gray-100">
                              <th className="text-left pb-1 pr-3">Date</th>
                              <th className="text-left pb-1 pr-3">Libellé</th>
                              <th className="text-left pb-1 pr-3">Paiement</th>
                              <th className="text-right pb-1 pr-3">Montant</th>
                              <th className="text-center pb-1 pr-3">Justif.</th>
                              <th className="pb-1"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(line.details || []).map(detail => (
                              <tr key={detail.id} className="border-b border-gray-50">
                                <td className="py-1 pr-3">{fmtDate(detail.detailDate)}</td>
                                <td className="py-1 pr-3">{detail.label}</td>
                                <td className="py-1 pr-3">{detail.paymentMethod}</td>
                                <td className="py-1 pr-3 text-right font-medium">{fmtCurrency(detail.amount)}</td>
                                <td className="py-1 pr-3 text-center">
                                  {detail.receiptFile ? (
                                    <button
                                      onClick={() => setViewReceipt({
                                        data: detail.receiptFile!,
                                        name: detail.receiptFileName || 'justificatif',
                                        type: detail.receiptFileType || '',
                                      })}
                                      className="text-blue-500 hover:text-blue-700"
                                    >
                                      {detail.receiptFileType?.startsWith('image/') ? (
                                        <Image size={14} />
                                      ) : (
                                        <FileText size={14} />
                                      )}
                                    </button>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                <td className="py-1">
                                  {canEditDetail(detail) && (
                                    <div className="flex gap-1">
                                      <button
                                        className="text-blue-400 hover:text-blue-600"
                                        onClick={() => openEditDetail(line.id, detail)}
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        className="text-red-400 hover:text-red-600"
                                        onClick={() => handleDeleteDetail(line.id, detail.id)}
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Chargement…</div>;
  if (!budget) return <div className="p-6 text-center text-red-500">{error || 'Budget non trouvé'}</div>;

  const incomeLines = (budget.lines || []).filter(l => l.type === 'income');
  const expenseLines = (budget.lines || []).filter(l => l.type === 'expense');
  const totalIncome = incomeLines.reduce((s, l) => s + (l.details || []).reduce((ds, d) => ds + d.amount, 0), 0);
  const totalExpense = expenseLines.reduce((s, l) => s + (l.details || []).reduce((ds, d) => ds + d.amount, 0), 0);
  const balance = totalIncome - totalExpense;

  const grantedUserIds = new Set((budget.accessGrants || []).map(g => g.userId));
  const availableForGrant = users.filter(u =>
    u.id !== budget.userId && !grantedUserIds.has(u.id)
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => navigate('/budget')} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-800 flex-1">{budget.label}</h1>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          budget.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {budget.status === 'active' ? 'Actif' : 'Clôturé'}
        </span>
        {canEdit && (
          <button
            onClick={toggleStatus}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
              budget.status === 'active' ? 'bg-green-500' : 'bg-gray-300'
            }`}
            title={budget.status === 'active' ? 'Clôturer' : 'Réactiver'}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
              budget.status === 'active' ? 'translate-x-4' : 'translate-x-0'
            }`} />
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500 mb-6 ml-9">
        {fmtDate(budget.startDate)} → {fmtDate(budget.endDate)}
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Lines */}
      {renderLines('income')}
      {renderLines('expense')}

      {/* Totals */}
      <div className="card mb-6 bg-gray-50">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="text-sm">
            <span className="text-gray-500">Recettes réalisées :</span>
            <span className="ml-2 font-semibold text-green-700">{fmtCurrency(totalIncome)}</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-500">Dépenses réalisées :</span>
            <span className="ml-2 font-semibold text-red-600">{fmtCurrency(totalExpense)}</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-500">Solde :</span>
            <span className={`ml-2 font-bold text-base ${balance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {fmtCurrency(balance)}
            </span>
          </div>
        </div>
      </div>

      {/* Add line (owner/treasurer) */}
      {canEdit && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Ajouter une ligne</h3>
            <button className="text-tennis-green text-sm" onClick={() => setShowAddLine(!showAddLine)}>
              {showAddLine ? 'Masquer' : 'Afficher'}
            </button>
          </div>
          {showAddLine && (
            <div className="flex gap-2 items-end flex-wrap">
              <div>
                <label className="label text-xs">Type</label>
                <select
                  className="input text-sm"
                  value={addLineForm.type}
                  onChange={e => setAddLineForm(prev => ({ ...prev, type: e.target.value as BudgetLineType }))}
                >
                  <option value="income">Recette</option>
                  <option value="expense">Dépense</option>
                </select>
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="label text-xs">Libellé</label>
                <input
                  className="input text-sm"
                  value={addLineForm.label}
                  onChange={e => setAddLineForm(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="Libellé"
                />
              </div>
              <div className="w-32">
                <label className="label text-xs">Montant prévu €</label>
                <input
                  type="number"
                  className="input text-sm"
                  value={addLineForm.forecastAmount}
                  onChange={e => setAddLineForm(prev => ({ ...prev, forecastAmount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <button
                className="btn-primary text-sm flex items-center gap-1"
                onClick={handleAddLine}
                disabled={savingLine}
              >
                <Plus size={14} />
                {savingLine ? '…' : 'Ajouter'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Access grants (owner or treasurer) */}
      {(canEdit) && (
        <div className="card mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Accès partagés</h3>
          {(budget.accessGrants || []).length === 0 ? (
            <p className="text-gray-400 text-sm mb-3">Aucun accès partagé</p>
          ) : (
            <ul className="mb-3 space-y-1">
              {(budget.accessGrants || []).map(grant => (
                <li key={grant.id} className="flex items-center justify-between text-sm text-gray-700 py-1 border-b border-gray-50">
                  <span>{grant.userName} <span className="text-gray-400 text-xs">{grant.userEmail}</span></span>
                  <button
                    className="text-red-400 hover:text-red-600 text-xs"
                    onClick={() => handleRevokeAccess(grant.id)}
                  >
                    Révoquer
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="label text-xs">Ajouter un accès</label>
              <select
                className="input text-sm"
                value={addAccessUserId}
                onChange={e => setAddAccessUserId(e.target.value)}
              >
                <option value="">— Sélectionner un utilisateur —</option>
                {availableForGrant.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn-secondary text-sm"
              onClick={handleAddAccess}
              disabled={!addAccessUserId || savingAccess}
            >
              {savingAccess ? '…' : 'Ajouter'}
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">
                {detailModal.editId
                  ? `Modifier le détail (${detailModal.lineType === 'income' ? 'recette' : 'dépense'})`
                  : `Ajouter un détail de ${detailModal.lineType === 'income' ? 'recette' : 'dépense'}`}
              </h2>
              <button onClick={() => setDetailModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {detailError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
                {detailError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="label">Date *</label>
                <input
                  type="date"
                  className="input"
                  value={detailForm.detailDate}
                  onChange={e => setDetailForm(prev => ({ ...prev, detailDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Libellé *</label>
                <input
                  ref={labelRef}
                  className="input"
                  value={detailForm.label}
                  onChange={e => setDetailForm(prev => ({ ...prev, label: e.target.value }))}
                  placeholder={detailModal.lineType === 'income' ? 'Description de la recette' : 'Description de la dépense'}
                />
              </div>
              <div>
                <label className="label">Mode de paiement *</label>
                <select
                  className="input"
                  value={detailForm.paymentMethod}
                  onChange={e => setDetailForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                >
                  {PAYMENT_METHODS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="w-24">
                  <label className="label">Quantité</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className="input"
                    value={detailForm.qty}
                    onChange={e => setDetailForm(prev => ({ ...prev, qty: e.target.value }))}
                    placeholder="1"
                  />
                </div>
                <div className="flex-1">
                  <label className="label">Prix unitaire (€) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    value={detailForm.unitPrice}
                    onChange={e => setDetailForm(prev => ({ ...prev, unitPrice: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="w-28">
                  <label className="label">Montant (€)</label>
                  <input
                    type="text"
                    className="input bg-gray-50 text-gray-600 cursor-not-allowed"
                    value={((parseFloat(detailForm.qty) || 0) * (parseFloat(detailForm.unitPrice) || 0)).toFixed(2)}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
              </div>
              <div>
                <label className="label">Justificatif (optionnel)</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="input text-sm"
                  onChange={handleDetailFileChange}
                />
                {detailForm.receiptFile && detailForm.receiptFileType?.startsWith('image/') && (
                  <img
                    src={`data:${detailForm.receiptFileType};base64,${detailForm.receiptFile}`}
                    alt="aperçu"
                    className="mt-2 max-h-32 rounded border border-gray-200"
                  />
                )}
                {detailForm.receiptFile && !detailForm.receiptFileType?.startsWith('image/') && (
                  <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                    <FileText size={12} /> {detailForm.receiptFileName}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-4">
              <button className="btn-secondary" onClick={() => setDetailModal(null)}>
                Annuler
              </button>
              <button className="btn-primary" onClick={handleSaveDetail} disabled={savingDetail}>
                {savingDetail ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt viewer modal */}
      {viewReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setViewReceipt(null)}>
          <div className="bg-white rounded-xl shadow-xl p-4 max-w-3xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <span className="font-medium text-sm">{viewReceipt.name}</span>
              <button onClick={() => setViewReceipt(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            {viewReceipt.type.startsWith('image/') ? (
              <img
                src={`data:${viewReceipt.type};base64,${viewReceipt.data}`}
                alt={viewReceipt.name}
                className="max-w-full rounded"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-8">
                <FileText size={48} className="text-gray-400" />
                <p className="text-gray-600 text-sm">{viewReceipt.name}</p>
                <a
                  href={`data:${viewReceipt.type};base64,${viewReceipt.data}`}
                  download={viewReceipt.name}
                  className="btn-primary text-sm"
                >
                  Télécharger
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
