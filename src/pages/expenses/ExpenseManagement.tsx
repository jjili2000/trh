import { useState, useEffect, useRef, ReactNode, FormEvent, ChangeEvent } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Plus, Check, X, Receipt, ChevronDown, ChevronUp, FileText,
  Image, Upload, Camera, Loader2, Sparkles, Trash2, PlusCircle,
  Clock, CalendarCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Expense, VatLine } from '../../types';
import { api } from '../../api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type FormStep = 'upload' | 'recognizing' | 'form';

interface VatLineForm {
  rate: string;
  amount: string;
}

interface FormData {
  date: string;
  amount: string;       // TTC
  amountHt: string;
  vatLines: VatLineForm[];
  vendor: string;
  reason: string;
  receiptFile: string;
  receiptFileName: string;
  receiptFileType: string;
}

interface RecognizeResult {
  vendor: string | null;
  date: string | null;
  amountHt: number | null;
  vatLines: { rate: string; amount: number }[];
  amountTtc: number | null;
}

interface MyStats {
  pendingAmount: number;
  nextPayrollAmount: number;
  nextPayrollLabel: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const statusLabels = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Rejeté',
};

const today = new Date().toISOString().slice(0, 10);

const emptyForm: FormData = {
  date: today,
  amount: '',
  amountHt: '',
  vatLines: [],
  vendor: '',
  reason: '',
  receiptFile: '',
  receiptFileName: '',
  receiptFileType: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number) {
  return amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

/** Compresse une image via Canvas (JPEG, max 1600px, qualité 82 %).
 *  Les PDF et fichiers non-image sont renvoyés tels quels. */
function compressImage(dataUrl: string, fileType: string): Promise<string> {
  return new Promise(resolve => {
    if (!fileType.startsWith('image/')) { resolve(dataUrl); return; }
    const img = new window.Image();
    img.onload = () => {
      const MAX = 1600;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else                { width  = Math.round(width  * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(dataUrl); // fallback sans compression
    img.src = dataUrl;
  });
}

function expenseToForm(expense: Expense): FormData {
  return {
    date: expense.date,
    amount: String(expense.amount),
    amountHt: expense.amountHt != null ? String(expense.amountHt) : '',
    vatLines: expense.vatDetails
      ? expense.vatDetails.map(l => ({ rate: l.rate, amount: String(l.amount) }))
      : [],
    vendor: expense.vendor ?? '',
    reason: expense.reason,
    receiptFile: expense.receiptFile ?? '',
    receiptFileName: expense.receiptFileName ?? '',
    receiptFileType: expense.receiptFileType ?? '',
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ReceiptThumb({ file, fileName, fileType, onClick }: {
  file: string; fileName: string; fileType: string; onClick?: () => void;
}) {
  if (!file) return null;
  const isPdf = fileType === 'application/pdf';
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors w-full text-left"
    >
      {isPdf ? <FileText size={16} className="text-red-400 flex-shrink-0" /> : <Image size={16} className="text-blue-400 flex-shrink-0" />}
      <span className="truncate flex-1">{fileName}</span>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExpenseManagement() {
  const location = useLocation();
  const {
    currentUser,
    users,
    expenses,
    addExpense,
    updateExpense,
    approveExpense,
    rejectExpense,
  } = useApp();

  // Stats de remboursement
  const [myStats, setMyStats] = useState<MyStats>({ pendingAmount: 0, nextPayrollAmount: 0, nextPayrollLabel: null });

  useEffect(() => {
    api.get<MyStats>('/expenses/my-stats')
      .then(setMyStats)
      .catch(() => {/* silencieux si l'endpoint n'est pas encore dispo */});
  }, [expenses]); // recalcul si la liste change (approbation, etc.)

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formStep, setFormStep] = useState<FormStep>('upload');
  const [form, setForm] = useState<FormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [recognizeError, setRecognizeError] = useState('');

  // UI state
  const [expandedSection, setExpandedSection] = useState<'mine' | 'team'>('mine');
  const [previewExpense, setPreviewExpense] = useState<Expense | null>(null);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Handle navigation state
  useEffect(() => {
    const state = location.state as { openForm?: boolean; showTeam?: boolean } | null;
    if (state?.openForm) {
      openAdd();
      window.history.replaceState({}, '');
    }
    if (state?.showTeam) {
      setExpandedSection('team');
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  const isAdmin = currentUser?.role === 'admin';
  const isManagerOrAdmin = isAdmin || expenses.some(e => e.userId !== currentUser?.id);

  const myExpenses = expenses
    .filter(e => e.userId === currentUser?.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const teamExpenses = expenses
    .filter(e => e.userId !== currentUser?.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pendingTeamExpenses = teamExpenses.filter(e => e.status === 'pending');


  // ─── Open / close ───────────────────────────────────────────────────────────

  const openAdd = () => {
    setForm(emptyForm);
    setEditingExpense(null);
    setFormError('');
    setRecognizeError('');
    setFormStep('upload');
    setShowForm(true);
  };

  const openEdit = (expense: Expense) => {
    setForm(expenseToForm(expense));
    setEditingExpense(expense);
    setFormError('');
    setRecognizeError('');
    setFormStep('form');
    setShowForm(true);
  };

  const closeForm = () => setShowForm(false);

  // ─── File loading ───────────────────────────────────────────────────────────

  const loadFile = (file: File) => {
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setRecognizeError('Le fichier ne doit pas dépasser 5 Mo.');
      return;
    }
    setRecognizeError('');
    const reader = new FileReader();
    reader.onload = async ev => {
      const raw      = ev.target?.result as string;
      const fileName = file.name;
      const fileType = file.type;
      // Compression des images avant envoi (réduit la taille de la requête)
      const fileData = await compressImage(raw, fileType);
      setForm(f => ({ ...f, receiptFile: fileData, receiptFileName: fileName, receiptFileType: fileType }));
      startRecognition(fileData, fileType);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  // ─── AI Recognition ─────────────────────────────────────────────────────────

  const startRecognition = async (fileData: string, fileType: string) => {
    setFormStep('recognizing');
    try {
      const result = await api.post<RecognizeResult>('/expenses/recognize', { fileData, fileType });
      setForm(f => ({
        ...f,
        vendor:   result.vendor   ?? '',
        date:     result.date     ?? f.date,
        amountHt: result.amountHt != null ? String(result.amountHt) : '',
        vatLines: result.vatLines.map(l => ({ rate: l.rate, amount: String(l.amount) })),
        amount:   result.amountTtc != null ? String(result.amountTtc) : '',
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setRecognizeError(`Reconnaissance automatique indisponible : ${msg}`);
    } finally {
      setFormStep('form');
    }
  };

  // ─── VAT lines helpers ───────────────────────────────────────────────────────

  const addVatLine = () => setForm(f => ({ ...f, vatLines: [...f.vatLines, { rate: '20', amount: '' }] }));
  const removeVatLine = (i: number) => setForm(f => ({ ...f, vatLines: f.vatLines.filter((_, idx) => idx !== i) }));
  const updateVatLine = (i: number, field: keyof VatLineForm, value: string) =>
    setForm(f => ({ ...f, vatLines: f.vatLines.map((l, idx) => idx === i ? { ...l, [field]: value } : l) }));

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const amount = parseFloat(form.amount);
    if (!form.date)                       { setFormError('La date est obligatoire.'); return; }
    if (isNaN(amount) || amount <= 0)     { setFormError('Le montant TTC doit être supérieur à 0.'); return; }
    if (!form.reason.trim())              { setFormError('Le motif est obligatoire.'); return; }
    if (!form.receiptFile)                { setFormError('Le justificatif est obligatoire.'); return; }

    const amountHt  = form.amountHt  ? parseFloat(form.amountHt)  : undefined;
    const vatDetails: VatLine[] | undefined = form.vatLines.length > 0
      ? form.vatLines
          .filter(l => l.rate && l.amount)
          .map(l => ({ rate: l.rate, amount: parseFloat(l.amount) }))
      : undefined;

    const expenseData = {
      userId: currentUser!.id,
      date: form.date,
      amount,
      reason: form.reason.trim(),
      vendor: form.vendor.trim() || undefined,
      amountHt,
      vatDetails,
      receiptFile: form.receiptFile || undefined,
      receiptFileName: form.receiptFileName || undefined,
      receiptFileType: form.receiptFileType || undefined,
    };

    if (editingExpense) {
      updateExpense(editingExpense.id, { ...expenseData, status: 'pending', validatedBy: undefined, validatedAt: undefined });
    } else {
      addExpense(expenseData);
    }
    closeForm();
  };

  const getUser = (userId: string) => users.find(u => u.id === userId);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notes de frais</h1>
          <p className="text-gray-500 mt-1">Soumettez et suivez vos remboursements de frais.</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Nouvelle note
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-3xl font-bold text-yellow-500">
            {myExpenses.filter(e => e.status === 'pending').length}
          </p>
          <p className="text-sm text-gray-500 mt-1">En attente</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-500">
            {myExpenses.filter(e => e.status === 'approved').length}
          </p>
          <p className="text-sm text-gray-500 mt-1">Approuvées</p>
        </div>
        <div className="card flex flex-col divide-y divide-gray-100">
          {/* En attente de remboursement */}
          <div className="flex items-center gap-3 pb-3">
            <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center flex-shrink-0">
              <Clock size={16} className="text-yellow-500" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-yellow-500 leading-tight">
                {formatCurrency(myStats.pendingAmount)}
              </p>
              <p className="text-xs text-gray-400">En attente de remboursement</p>
            </div>
          </div>
          {/* Prochaine paie */}
          <div className="flex items-center gap-3 pt-3">
            <div className="w-8 h-8 rounded-lg bg-tennis-green/10 flex items-center justify-center flex-shrink-0">
              <CalendarCheck size={16} className="text-tennis-green" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-tennis-green leading-tight">
                {formatCurrency(myStats.nextPayrollAmount)}
              </p>
              <p className="text-xs text-gray-400">
                Prochaine paie
                {myStats.nextPayrollLabel && (
                  <span className="ml-1 text-gray-300">· {myStats.nextPayrollLabel}</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Manager alert */}
      {isManagerOrAdmin && pendingTeamExpenses.length > 0 && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
          <Receipt size={18} className="text-blue-500 flex-shrink-0" />
          <p className="text-sm text-blue-800">
            <span className="font-semibold">{pendingTeamExpenses.length}</span> note(s) de frais en attente de validation.
          </p>
        </div>
      )}

      {/* My expenses */}
      <div className="card mb-4">
        <button
          onClick={() => setExpandedSection(expandedSection === 'mine' ? 'team' : 'mine')}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900">Mes notes de frais</h2>
            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{myExpenses.length}</span>
          </div>
          {expandedSection === 'mine' ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>

        {expandedSection === 'mine' && (
          <div className="mt-4">
            {myExpenses.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Receipt size={32} className="mx-auto mb-2 opacity-40" />
                <p>Aucune note de frais. Cliquez sur "Nouvelle note" pour soumettre.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myExpenses.map(expense => (
                  <div key={expense.id} className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg font-bold text-tennis-green">
                            {formatCurrency(expense.amount)}
                          </span>
                          <span className={`badge-${expense.status}`}>{statusLabels[expense.status]}</span>
                        </div>
                        {expense.vendor && (
                          <p className="text-sm font-semibold text-gray-800">{expense.vendor}</p>
                        )}
                        <p className="text-sm text-gray-700">{expense.reason}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(expense.date).toLocaleDateString('fr-FR')}
                        </p>
                        {expense.amountHt != null && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            HT {formatCurrency(expense.amountHt)}
                            {expense.vatDetails && expense.vatDetails.length > 0 && (
                              <span className="ml-2">
                                TVA {expense.vatDetails.map(l => `${l.rate}% (${formatCurrency(l.amount)})`).join(' · ')}
                              </span>
                            )}
                          </p>
                        )}
                        {expense.receiptFile && (
                          <button
                            onClick={() => setPreviewExpense(expense)}
                            className="mt-2 flex items-center gap-1.5 text-xs text-tennis-green hover:underline"
                          >
                            {expense.receiptFileType === 'application/pdf' ? <FileText size={13} /> : <Image size={13} />}
                            Voir le justificatif
                          </button>
                        )}
                      </div>
                      {expense.status === 'pending' && (
                        <button
                          onClick={() => openEdit(expense)}
                          className="text-xs text-tennis-green hover:underline flex-shrink-0"
                        >
                          Modifier
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Team expenses (manager/admin) */}
      {isManagerOrAdmin && (
        <div className="card">
          <button
            onClick={() => setExpandedSection(expandedSection === 'team' ? 'mine' : 'team')}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900">Notes de l'équipe</h2>
              <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{teamExpenses.length}</span>
              {pendingTeamExpenses.length > 0 && (
                <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full">
                  {pendingTeamExpenses.length} en attente
                </span>
              )}
            </div>
            {expandedSection === 'team' ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
          </button>

          {expandedSection === 'team' && (
            <div className="mt-4">
              {teamExpenses.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p>Aucune note de frais de l'équipe.</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Employé</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Date</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Montant TTC</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Prestataire / Motif</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Justificatif</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Statut</th>
                        <th className="text-right py-2 text-gray-500 font-medium">Validation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {teamExpenses.map(expense => {
                        const user = getUser(expense.userId);
                        return (
                          <tr key={expense.id} className={`hover:bg-gray-50 ${expense.status === 'pending' ? 'bg-yellow-50/40' : ''}`}>
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-tennis-green flex items-center justify-center text-white text-xs font-bold">
                                  {user?.firstName[0]}{user?.lastName[0]}
                                </div>
                                <span className="text-gray-700 font-medium">{user?.firstName} {user?.lastName}</span>
                              </div>
                            </td>
                            <td className="py-3 pr-4 text-gray-600">
                              {new Date(expense.date).toLocaleDateString('fr-FR')}
                            </td>
                            <td className="py-3 pr-4 font-semibold text-tennis-green">
                              {formatCurrency(expense.amount)}
                              {expense.amountHt != null && (
                                <div className="text-xs font-normal text-gray-400">HT {formatCurrency(expense.amountHt)}</div>
                              )}
                            </td>
                            <td className="py-3 pr-4 text-gray-600 max-w-xs">
                              {expense.vendor && <div className="font-medium text-gray-800 truncate">{expense.vendor}</div>}
                              <div className="truncate text-gray-500">{expense.reason}</div>
                            </td>
                            <td className="py-3 pr-4">
                              {expense.receiptFile ? (
                                <button
                                  onClick={() => setPreviewExpense(expense)}
                                  className="flex items-center gap-1 text-xs text-tennis-green hover:underline"
                                >
                                  {expense.receiptFileType === 'application/pdf' ? <FileText size={13} /> : <Image size={13} />}
                                  Voir
                                </button>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>
                            <td className="py-3 pr-4">
                              <span className={`badge-${expense.status}`}>{statusLabels[expense.status]}</span>
                            </td>
                            <td className="py-3 text-right">
                              {expense.status === 'pending' && (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => approveExpense(expense.id)}
                                    className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                    title="Approuver"
                                  >
                                    <Check size={16} />
                                  </button>
                                  <button
                                    onClick={() => rejectExpense(expense.id)}
                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Rejeter"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Add/Edit Form Modal ─────────────────────────────────────────────── */}
      {showForm && (
        <Modal
          title={editingExpense ? 'Modifier la note de frais' : 'Nouvelle note de frais'}
          onClose={closeForm}
        >
          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFileInput}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileInput}
          />

          {/* ── Step 1: Upload only ─────────────────────────────────────── */}
          {formStep === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 text-center">
                Chargez votre justificatif pour démarrer la reconnaissance automatique.
              </p>

              {/* Drop/click zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-2xl p-10 text-center cursor-pointer hover:border-tennis-green hover:bg-tennis-green/5 transition-colors"
              >
                <Upload size={36} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium text-gray-600">Cliquez pour sélectionner un fichier</p>
                <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — max 5 Mo</p>
              </div>

              {/* Camera button (useful on mobile) */}
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Camera size={18} className="text-gray-400" />
                Prendre une photo
              </button>

              {recognizeError && (
                <p className="text-xs text-red-500 text-center">{recognizeError}</p>
              )}

              <div className="flex justify-end">
                <button type="button" onClick={closeForm} className="btn-secondary">Annuler</button>
              </div>
            </div>
          )}

          {/* ── Step 2: Recognizing ─────────────────────────────────────── */}
          {formStep === 'recognizing' && (
            <div className="py-12 flex flex-col items-center gap-4 text-gray-500">
              <div className="relative">
                <Loader2 size={40} className="animate-spin text-tennis-green" />
                <Sparkles size={18} className="absolute -top-1 -right-1 text-yellow-400" />
              </div>
              <p className="text-sm font-medium">Analyse du justificatif en cours…</p>
              <p className="text-xs text-gray-400">Identification du prestataire, des montants et de la TVA</p>
            </div>
          )}

          {/* ── Step 3: Editable form ───────────────────────────────────── */}
          {formStep === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Receipt thumbnail + change button */}
              {form.receiptFile && (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <ReceiptThumb
                      file={form.receiptFile}
                      fileName={form.receiptFileName}
                      fileType={form.receiptFileType}
                      onClick={() => setPreviewExpense({
                        id: '', userId: '', date: form.date, amount: 0, reason: form.reason,
                        receiptFile: form.receiptFile, receiptFileName: form.receiptFileName,
                        receiptFileType: form.receiptFileType, status: 'pending', createdAt: '',
                      })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 text-xs text-gray-400 hover:text-tennis-green underline"
                  >
                    Changer
                  </button>
                </div>
              )}

              {/* AI banner or error */}
              {recognizeError ? (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                  <Sparkles size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{recognizeError}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2.5 bg-tennis-green/5 border border-tennis-green/20 rounded-lg text-xs text-tennis-green">
                  <Sparkles size={14} className="flex-shrink-0" />
                  <span>Champs pré-remplis par IA — vérifiez et corrigez si nécessaire.</span>
                </div>
              )}

              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {formError}
                </div>
              )}

              {/* Prestataire */}
              <div>
                <label className="label">Prestataire</label>
                <input
                  type="text"
                  className="input"
                  value={form.vendor}
                  onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
                  placeholder="Ex: SNCF, Carrefour…"
                />
              </div>

              {/* Date */}
              <div>
                <label className="label">Date *</label>
                <input
                  type="date"
                  className="input"
                  value={form.date}
                  max={today}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>

              {/* Montant HT */}
              <div>
                <label className="label">Montant HT (€)</label>
                <input
                  type="number"
                  className="input"
                  value={form.amountHt}
                  onChange={e => setForm(f => ({ ...f, amountHt: e.target.value }))}
                  min="0"
                  step="0.01"
                  placeholder="Ex: 37.92"
                />
              </div>

              {/* TVA lines */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">Lignes TVA</label>
                  <button
                    type="button"
                    onClick={addVatLine}
                    className="flex items-center gap-1 text-xs text-tennis-green hover:underline"
                  >
                    <PlusCircle size={13} />
                    Ajouter une ligne
                  </button>
                </div>
                {form.vatLines.length > 0 ? (
                  <div className="space-y-2">
                    {form.vatLines.map((line, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-1">
                          <input
                            type="number"
                            className="input py-1.5 text-sm w-20"
                            value={line.rate}
                            onChange={e => updateVatLine(i, 'rate', e.target.value)}
                            min="0"
                            step="0.1"
                            placeholder="Taux %"
                          />
                          <span className="text-gray-400 text-sm">%</span>
                        </div>
                        <div className="flex-1 flex items-center gap-1">
                          <input
                            type="number"
                            className="input py-1.5 text-sm"
                            value={line.amount}
                            onChange={e => updateVatLine(i, 'amount', e.target.value)}
                            min="0"
                            step="0.01"
                            placeholder="Montant €"
                          />
                          <span className="text-gray-400 text-sm">€</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeVatLine(i)}
                          className="p-1 text-red-400 hover:bg-red-50 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Aucune ligne TVA</p>
                )}
              </div>

              {/* Montant TTC */}
              <div>
                <label className="label">Montant TTC (€) *</label>
                <input
                  type="number"
                  className="input"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  min="0.01"
                  step="0.01"
                  placeholder="Ex: 45.50"
                  required
                />
              </div>

              {/* Motif */}
              <div>
                <label className="label">Motif *</label>
                <input
                  type="text"
                  className="input"
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Ex: Déplacement Paris, Achat matériel…"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeForm} className="btn-secondary">Annuler</button>
                <button type="submit" className="btn-primary">
                  {editingExpense ? 'Enregistrer' : 'Soumettre'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* ── Receipt Preview Modal ─────────────────────────────────────────── */}
      {previewExpense && previewExpense.receiptFile && (
        <Modal title="Justificatif" onClose={() => setPreviewExpense(null)}>
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-4">{previewExpense.receiptFileName}</p>
            {previewExpense.receiptFileType === 'application/pdf' ? (
              <div className="p-8 bg-red-50 rounded-xl">
                <FileText size={48} className="mx-auto text-red-400 mb-3" />
                <p className="text-sm text-gray-600 mb-4">Fichier PDF</p>
                <a
                  href={previewExpense.receiptFile}
                  download={previewExpense.receiptFileName}
                  className="btn-primary inline-block"
                >
                  Télécharger le PDF
                </a>
              </div>
            ) : (
              <img
                src={previewExpense.receiptFile}
                alt="Justificatif"
                className="max-w-full max-h-96 rounded-xl mx-auto object-contain"
              />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
