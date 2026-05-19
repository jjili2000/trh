import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ExternalLink, Pencil, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { BudgetRequest, BudgetRequestLine, BudgetLineType } from '../../types';

// Budget validation is now config-based (server-side).
// On the frontend, we determine if the current user can validate by checking
// if their position is in the validationConfig.budget.positions list.
function useIsBudgetValidator() {
  const { currentUser, validationConfig } = useApp();
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  const pos = currentUser.position;
  if (!pos) return false;
  return validationConfig.budget.positions.includes(pos);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtCurrency(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

interface NewLine {
  type: BudgetLineType;
  label: string;
  qty: string;
  unitPrice: string;
}

const emptyNewLine = (type: BudgetLineType): NewLine => ({ type, label: '', qty: '1', unitPrice: '' });

export default function BudgetRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const isNew = id === 'new';

  const [request, setRequest] = useState<BudgetRequest | null>(null);
  const [label, setLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [comment, setComment] = useState('');
  const [lines, setLines] = useState<BudgetRequestLine[]>([]);
  const [newIncome, setNewIncome] = useState<NewLine>(emptyNewLine('income'));
  const [newExpense, setNewExpense] = useState<NewLine>(emptyNewLine('expense'));
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnModal, setReturnModal] = useState(false);
  const [returnComment, setReturnComment] = useState('');
  const incomeLabelRef = useRef<HTMLInputElement>(null);
  const expenseLabelRef = useRef<HTMLInputElement>(null);
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  // Auto-save
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const savedStatusTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const skipAutoSaveRef = useRef(0); // nb de déclenchements à ignorer (ex : après chargement)
  const isCreatingRef = useRef(false); // empêche la double-création pour les nouveaux brouillons

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const data = await api.get<BudgetRequest>(`/budgets/requests/${id}`);
      // Toutes ces setState seront batchées → 1 seul render → 1 seul déclenchement de l'effet
      skipAutoSaveRef.current++;
      setRequest(data);
      setLabel(data.label);
      setStartDate(data.startDate);
      setEndDate(data.endDate);
      setComment(data.comment || '');
      setLines(data.lines || []);
    } catch {
      setError('Erreur lors du chargement de la demande');
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => { load(); }, [load]);

  // ── Auto-save ──────────────────────────────────────────────────────────────
  useEffect(() => {
    // Ignorer les déclenchements provoqués par le chargement initial
    if (skipAutoSaveRef.current > 0) {
      skipAutoSaveRef.current--;
      return;
    }
    if (!label.trim() || !startDate || !endDate) return;

    clearTimeout(autoSaveTimerRef.current);
    clearTimeout(savedStatusTimerRef.current);

    autoSaveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        if (isNew) {
          // Créer le brouillon automatiquement au premier auto-save
          if (isCreatingRef.current) return;
          isCreatingRef.current = true;
          const created = await api.post<BudgetRequest>('/budgets/requests', {
            label, startDate, endDate, comment: comment || null, lines: allLinesForSave(),
          });
          setSaveStatus('saved');
          savedStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2500);
          navigate(`/budget/requests/${created.id}`, { replace: true });
        } else {
          if (!id) return;
          await api.put<BudgetRequest>(`/budgets/requests/${id}`, {
            label, startDate, endDate, comment: comment || null,
            lines: lines.map(l => ({ type: l.type, label: l.label, qty: l.qty, unitPrice: l.unitPrice, amount: l.amount })),
          });
          setSaveStatus('saved');
          savedStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2500);
        }
      } catch {
        setSaveStatus('error');
        isCreatingRef.current = false;
      }
    }, isNew ? 1500 : 800);

    return () => clearTimeout(autoSaveTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, startDate, endDate, comment, lines]);

  const isOwner = currentUser && request && request.userId === currentUser.id;
  const isTreas = useIsBudgetValidator();
  const isDraft = request?.status === 'draft' || isNew;
  const isSubmitted = request?.status === 'submitted';
  const incomeLines = lines.filter(l => l.type === 'income');
  const expenseLines = lines.filter(l => l.type === 'expense');
  const totalIncome = incomeLines.reduce((s, l) => s + l.amount, 0);
  const totalExpense = expenseLines.reduce((s, l) => s + l.amount, 0);
  const balance = totalIncome - totalExpense;

  const allLinesForSave = () =>
    lines.map(l => ({ type: l.type, label: l.label, qty: l.qty, unitPrice: l.unitPrice, amount: l.amount }));

  const handleSaveDraft = async () => {
    if (!label || !startDate || !endDate) {
      setError('Libellé, date de début et date de fin requis');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await api.post<BudgetRequest>('/budgets/requests', {
          label, startDate, endDate, comment: comment || null, lines: allLinesForSave(),
        });
        navigate(`/budget/requests/${created.id}`, { replace: true });
      } else {
        const updated = await api.put<BudgetRequest>(`/budgets/requests/${id}`, {
          label, startDate, endDate, comment: comment || null, lines: allLinesForSave(),
        });
        setRequest(updated);
        setLines(updated.lines || []);
      }
    } catch {
      setError('Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!label.trim() || !startDate || !endDate) {
      setError('Libellé, date de début et date de fin requis pour soumettre');
      return;
    }
    if (!confirm('Soumettre cette demande pour approbation ?')) return;
    setSaving(true);
    setError(null);
    try {
      let targetId = id;
      if (isNew) {
        // Créer le brouillon puis soumettre
        clearTimeout(autoSaveTimerRef.current);
        const created = await api.post<BudgetRequest>('/budgets/requests', {
          label, startDate, endDate, comment: comment || null, lines: allLinesForSave(),
        });
        targetId = created.id;
      } else {
        await api.put<BudgetRequest>(`/budgets/requests/${id}`, {
          label, startDate, endDate, comment: comment || null, lines: allLinesForSave(),
        });
      }
      const updated = await api.post<BudgetRequest>(`/budgets/requests/${targetId}/submit`, {});
      if (isNew) {
        navigate(`/budget/requests/${targetId}`, { replace: true });
      } else {
        setRequest(updated);
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message || 'Erreur lors de la soumission');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (isNew) {
      // Pas encore de demande en base : retour simple à la liste
      if (!confirm('Abandonner la création de cette demande ?')) return;
      navigate('/budget');
      return;
    }
    if (!confirm('Annuler cette demande de budget ?')) return;
    setSaving(true);
    try {
      const updated = await api.post<BudgetRequest>(`/budgets/requests/${id}/cancel`, {});
      setRequest(updated);
    } catch {
      setError('Erreur lors de l\'annulation');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!confirm('Approuver cette demande et créer le budget réel ?')) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.post<BudgetRequest>(`/budgets/requests/${id}/approve`, {});
      setRequest(updated);
    } catch {
      setError('Erreur lors de l\'approbation');
    } finally {
      setSaving(false);
    }
  };

  const handleReturnToDraft = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.post<BudgetRequest>(`/budgets/requests/${id}/return-to-draft`, {
        approverComment: returnComment,
      });
      setRequest(updated);
      setLines(updated.lines || []);
      setReturnModal(false);
      setReturnComment('');
    } catch {
      setError('Erreur lors du renvoi en brouillon');
    } finally {
      setSaving(false);
    }
  };

  const removeLine = (lineId: string) => {
    setLines(prev => prev.filter(l => l.id !== lineId));
  };

  const addIncomeLine = () => {
    if (!newIncome.label) return;
    const qty = parseFloat(newIncome.qty) || 1;
    const unitPrice = parseFloat(newIncome.unitPrice) || 0;
    const amount = qty * unitPrice;
    if (editingIncomeId) {
      setLines(prev => prev.map(l =>
        l.id === editingIncomeId ? { ...l, label: newIncome.label, qty, unitPrice, amount } : l
      ));
      setEditingIncomeId(null);
    } else {
      const tempLine: BudgetRequestLine = {
        id: `tmp_${Date.now()}`,
        requestId: id || '',
        type: 'income',
        label: newIncome.label,
        qty,
        unitPrice,
        amount,
        sortOrder: lines.length,
        createdAt: new Date().toISOString(),
      };
      setLines(prev => [...prev, tempLine]);
    }
    setNewIncome(emptyNewLine('income'));
    setTimeout(() => incomeLabelRef.current?.focus(), 0);
  };

  const startEditIncome = (line: BudgetRequestLine) => {
    setEditingIncomeId(line.id);
    setNewIncome({ type: 'income', label: line.label, qty: String(line.qty ?? 1), unitPrice: String(line.unitPrice ?? line.amount) });
    setTimeout(() => incomeLabelRef.current?.focus(), 0);
  };

  const cancelEditIncome = () => {
    setEditingIncomeId(null);
    setNewIncome(emptyNewLine('income'));
  };

  const addExpenseLine = () => {
    if (!newExpense.label) return;
    const qty = parseFloat(newExpense.qty) || 1;
    const unitPrice = parseFloat(newExpense.unitPrice) || 0;
    const amount = qty * unitPrice;
    if (editingExpenseId) {
      setLines(prev => prev.map(l =>
        l.id === editingExpenseId ? { ...l, label: newExpense.label, qty, unitPrice, amount } : l
      ));
      setEditingExpenseId(null);
    } else {
      const tempLine: BudgetRequestLine = {
        id: `tmp_${Date.now()}`,
        requestId: id || '',
        type: 'expense',
        label: newExpense.label,
        qty,
        unitPrice,
        amount,
        sortOrder: lines.length,
        createdAt: new Date().toISOString(),
      };
      setLines(prev => [...prev, tempLine]);
    }
    setNewExpense(emptyNewLine('expense'));
    setTimeout(() => expenseLabelRef.current?.focus(), 0);
  };

  const startEditExpense = (line: BudgetRequestLine) => {
    setEditingExpenseId(line.id);
    setNewExpense({ type: 'expense', label: line.label, qty: String(line.qty ?? 1), unitPrice: String(line.unitPrice ?? line.amount) });
    setTimeout(() => expenseLabelRef.current?.focus(), 0);
  };

  const cancelEditExpense = () => {
    setEditingExpenseId(null);
    setNewExpense(emptyNewLine('expense'));
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-500">Chargement…</div>
    );
  }

  const canEdit = (isNew || isDraft) && (isNew || isOwner);
  const showApproverActions = isSubmitted && isTreas;
  const showOwnerSubmittedView = isSubmitted && !isTreas;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button onClick={() => navigate('/budget')} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-800 flex-1">
          {isNew ? 'Nouvelle demande de budget' : request?.label || 'Demande de budget'}
        </h1>
        {request && !isNew && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            request.status === 'draft' ? 'bg-gray-100 text-gray-600' :
            request.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
            request.status === 'approved' ? 'bg-green-100 text-green-700' :
            'bg-red-100 text-red-600'
          }`}>
            {request.status === 'draft' ? 'Brouillon' :
             request.status === 'submitted' ? 'Soumise' :
             request.status === 'approved' ? 'Approuvée' : 'Annulée'}
          </span>
        )}
        {/* Indicateur d'auto-save */}
        {isDraft && (
          <div className="flex items-center gap-1.5 text-xs">
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-gray-400">
                <Loader2 size={13} className="animate-spin" /> Enregistrement…
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 size={13} /> Enregistré
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1 text-red-500">
                <AlertCircle size={13} /> Erreur d'enregistrement
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Approver comment info box */}
      {isDraft && request?.approverComment && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg text-sm">
          <strong>Commentaire de l'approbateur :</strong> {request.approverComment}
        </div>
      )}

      {/* Approved real budget link */}
      {request?.status === 'approved' && request.realBudgetId && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-800 rounded-lg text-sm flex items-center gap-2">
          <span>Cette demande a été approuvée.</span>
          <Link
            to={`/budget/real/${request.realBudgetId}`}
            className="underline font-medium flex items-center gap-1"
          >
            Voir le budget réel <ExternalLink size={12} />
          </Link>
        </div>
      )}

      <div className="card mb-6">
        <div className="space-y-4">
          <div>
            <label className="label">Libellé *</label>
            <input
              className="input"
              value={label}
              onChange={e => setLabel(e.target.value)}
              disabled={!canEdit}
              placeholder="Nom du budget"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Date de début *</label>
              <input
                type="date"
                className="input"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="label">Date de fin *</label>
              <input
                type="date"
                className="input"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>
          <div>
            <label className="label">Commentaire</label>
            <textarea
              className="input"
              rows={3}
              value={comment}
              onChange={e => setComment(e.target.value)}
              disabled={!canEdit}
              placeholder="Commentaire optionnel"
            />
          </div>
        </div>
      </div>

      {/* Lines */}
      {/* Recettes */}
      <div className="card mb-4">
        <h2 className="text-base font-semibold text-gray-700 mb-3">Recettes</h2>
        {incomeLines.length === 0 ? (
          <p className="text-gray-400 text-sm mb-3">Aucune recette</p>
        ) : (
          <table className="w-full mb-3">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="pb-2 pr-4">Libellé</th>
                <th className="pb-2 pr-4 text-right">Montant</th>
                {canEdit && <th className="pb-2"></th>}
              </tr>
            </thead>
            <tbody>
              {incomeLines.map(line => (
                <tr key={line.id} className={`border-b border-gray-50 ${editingIncomeId === line.id ? 'bg-blue-50' : ''}`}>
                  <td className="py-2 pr-4 text-sm text-gray-800">{line.label}</td>
                  <td className="py-2 pr-4 text-sm text-right text-green-700 font-medium">{fmtCurrency(line.amount)}</td>
                  {canEdit && (
                    <td className="py-2">
                      <div className="flex gap-1">
                        <button onClick={() => startEditIncome(line)} className="text-blue-400 hover:text-blue-600">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => removeLine(line.id)} className="text-red-400 hover:text-red-600">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {canEdit && (
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <input
                ref={incomeLabelRef}
                className="input text-sm"
                placeholder="Libellé de la recette"
                value={newIncome.label}
                onChange={e => setNewIncome(prev => ({ ...prev, label: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addIncomeLine()}
              />
            </div>
            <div className="w-20">
              <input
                type="number"
                step="1"
                min="0"
                className="input text-sm"
                placeholder="Qté"
                value={newIncome.qty}
                onChange={e => setNewIncome(prev => ({ ...prev, qty: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addIncomeLine()}
              />
            </div>
            <div className="w-32">
              <input
                type="number"
                step="0.01"
                min="0"
                className="input text-sm"
                placeholder="Prix unit. €"
                value={newIncome.unitPrice}
                onChange={e => setNewIncome(prev => ({ ...prev, unitPrice: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addIncomeLine()}
              />
            </div>
            <div className="w-28">
              <input
                type="text"
                className="input text-sm bg-gray-50 text-gray-600 cursor-not-allowed"
                value={((parseFloat(newIncome.qty) || 0) * (parseFloat(newIncome.unitPrice) || 0)).toFixed(2) + ' €'}
                readOnly
                tabIndex={-1}
              />
            </div>
            <button
              className="btn-primary flex items-center gap-1 text-sm"
              onClick={addIncomeLine}
            >
              {editingIncomeId ? <><Pencil size={14} /> Modifier</> : <><Plus size={14} /> Ajouter</>}
            </button>
            {editingIncomeId && (
              <button className="btn-secondary text-sm flex items-center gap-1" onClick={cancelEditIncome}>
                <X size={14} /> Annuler
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dépenses */}
      <div className="card mb-4">
        <h2 className="text-base font-semibold text-gray-700 mb-3">Dépenses</h2>
        {expenseLines.length === 0 ? (
          <p className="text-gray-400 text-sm mb-3">Aucune dépense</p>
        ) : (
          <table className="w-full mb-3">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="pb-2 pr-4">Libellé</th>
                <th className="pb-2 pr-4 text-right">Montant</th>
                {canEdit && <th className="pb-2"></th>}
              </tr>
            </thead>
            <tbody>
              {expenseLines.map(line => (
                <tr key={line.id} className={`border-b border-gray-50 ${editingExpenseId === line.id ? 'bg-blue-50' : ''}`}>
                  <td className="py-2 pr-4 text-sm text-gray-800">{line.label}</td>
                  <td className="py-2 pr-4 text-sm text-right text-red-600 font-medium">{fmtCurrency(line.amount)}</td>
                  {canEdit && (
                    <td className="py-2">
                      <div className="flex gap-1">
                        <button onClick={() => startEditExpense(line)} className="text-blue-400 hover:text-blue-600">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => removeLine(line.id)} className="text-red-400 hover:text-red-600">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {canEdit && (
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <input
                ref={expenseLabelRef}
                className="input text-sm"
                placeholder="Libellé de la dépense"
                value={newExpense.label}
                onChange={e => setNewExpense(prev => ({ ...prev, label: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addExpenseLine()}
              />
            </div>
            <div className="w-20">
              <input
                type="number"
                step="1"
                min="0"
                className="input text-sm"
                placeholder="Qté"
                value={newExpense.qty}
                onChange={e => setNewExpense(prev => ({ ...prev, qty: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addExpenseLine()}
              />
            </div>
            <div className="w-32">
              <input
                type="number"
                step="0.01"
                min="0"
                className="input text-sm"
                placeholder="Prix unit. €"
                value={newExpense.unitPrice}
                onChange={e => setNewExpense(prev => ({ ...prev, unitPrice: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addExpenseLine()}
              />
            </div>
            <div className="w-28">
              <input
                type="text"
                className="input text-sm bg-gray-50 text-gray-600 cursor-not-allowed"
                value={((parseFloat(newExpense.qty) || 0) * (parseFloat(newExpense.unitPrice) || 0)).toFixed(2) + ' €'}
                readOnly
                tabIndex={-1}
              />
            </div>
            <button
              className="btn-primary flex items-center gap-1 text-sm"
              onClick={addExpenseLine}
            >
              {editingExpenseId ? <><Pencil size={14} /> Modifier</> : <><Plus size={14} /> Ajouter</>}
            </button>
            {editingExpenseId && (
              <button className="btn-secondary text-sm flex items-center gap-1" onClick={cancelEditExpense}>
                <X size={14} /> Annuler
              </button>
            )}
          </div>
        )}
      </div>

      {/* Totals bar */}
      <div className="card mb-6 bg-gray-50">
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="text-sm">
            <span className="text-gray-500">Total recettes :</span>
            <span className="ml-2 font-semibold text-green-700">{fmtCurrency(totalIncome)}</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-500">Total dépenses :</span>
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

      {/* Read-only info for submitted status non-treasurer */}
      {isSubmitted && request && !isNew && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm">
          Période : {fmtDate(request.startDate)} → {fmtDate(request.endDate)}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {canEdit && (
          <>
            <button
              className="btn-secondary flex items-center gap-2"
              onClick={handleSaveDraft}
              disabled={saving || saveStatus === 'saving'}
            >
              {saving && !saveStatus ? <Loader2 size={14} className="animate-spin" /> : null}
              Enregistrer le brouillon
            </button>
            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={saving || saveStatus === 'saving'}
            >
              Soumettre
            </button>
            <button className="btn-danger" onClick={handleCancel} disabled={saving}>
              Annuler la demande
            </button>
          </>
        )}

        {showApproverActions && (
          <>
            <button className="btn-primary" onClick={handleApprove} disabled={saving}>
              Approuver
            </button>
            <button
              className="btn-secondary"
              onClick={() => setReturnModal(true)}
              disabled={saving}
            >
              Renvoyer en brouillon
            </button>
          </>
        )}

        {showOwnerSubmittedView && (
          <>
            <button
              className="btn-secondary"
              disabled={saving}
              onClick={async () => {
                if (!confirm('Repasser cette demande en brouillon ? Elle ne sera plus en attente de validation.')) return;
                setSaving(true);
                setError(null);
                try {
                  const updated = await api.post<BudgetRequest>(`/budgets/requests/${id}/return-to-draft`, {});
                  setRequest(updated);
                  setLines(updated.lines || []);
                } catch {
                  setError('Erreur lors du retour en brouillon');
                } finally {
                  setSaving(false);
                }
              }}
            >
              Retour en brouillon
            </button>
            <button className="btn-danger" onClick={handleCancel} disabled={saving}>
              Annuler la demande
            </button>
          </>
        )}
      </div>

      {/* Return to draft modal */}
      {returnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={e => { if (e.target === e.currentTarget) setReturnModal(false); }}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold mb-3">Renvoyer en brouillon</h2>
            <p className="text-sm text-gray-500 mb-3">Ajoutez un commentaire expliquant pourquoi la demande est renvoyée.</p>
            <textarea
              className="input mb-4"
              rows={3}
              value={returnComment}
              onChange={e => setReturnComment(e.target.value)}
              placeholder="Commentaire (optionnel)"
            />
            <div className="flex gap-3 justify-end">
              <button className="btn-secondary" onClick={() => { setReturnModal(false); setReturnComment(''); }}>
                Annuler
              </button>
              <button className="btn-primary" onClick={handleReturnToDraft} disabled={saving}>
                {saving ? 'Envoi…' : 'Renvoyer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
