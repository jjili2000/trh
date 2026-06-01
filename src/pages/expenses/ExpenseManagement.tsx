import { useState, useEffect, useRef, ReactNode, FormEvent, ChangeEvent } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Plus, Check, X, Receipt, ChevronDown, ChevronUp, FileText,
  Image, Upload, Camera, Loader2, Sparkles, Trash2, PlusCircle,
  Clock, CalendarCheck, Edit2, Lock,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Expense, VatLine } from '../../types';
import { api, fileUrl } from '../../api/client';
import RejectReasonModal from '../../components/RejectReasonModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type FormStep = 'upload' | 'recognizing' | 'form';

interface VatLineForm {
  rate: string;
  amount: string;
}

interface ExpenseForm {
  date: string;
  amount: string;
  amountHt: string;
  vatLines: VatLineForm[];
  vendor: string;
  reason: string;
  receiptPreview: string;   // data URL local pour l'aperçu uniquement
  receiptFileName: string;
  receiptFileType: string;
  receiptFileObj: File | null;
  receiptFilePath: string;  // chemin serveur (pour les notes existantes)
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

const emptyForm: ExpenseForm = {
  date: today,
  amount: '',
  amountHt: '',
  vatLines: [],
  vendor: '',
  reason: '',
  receiptPreview: '',
  receiptFileName: '',
  receiptFileType: '',
  receiptFileObj: null,
  receiptFilePath: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number) {
  return amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('fr-FR');
}

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
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Construit une data-URL à partir du champ base64 legacy. */
function legacyReceiptPreview(expense: Expense): string {
  if (!expense.receiptFile) return '';
  if (expense.receiptFile.startsWith('data:')) return expense.receiptFile;
  const mime = expense.receiptFileType || 'image/jpeg';
  return `data:${mime};base64,${expense.receiptFile}`;
}

function expenseToForm(expense: Expense): ExpenseForm {
  return {
    date: expense.date,
    amount: String(expense.amount),
    amountHt: expense.amountHt != null ? String(expense.amountHt) : '',
    vatLines: expense.vatDetails
      ? expense.vatDetails.map(l => ({ rate: l.rate, amount: String(l.amount) }))
      : [],
    vendor: expense.vendor ?? '',
    reason: expense.reason,
    // Si pas encore migré vers filesystem, on recupère le base64 pour l'affichage
    receiptPreview: expense.receiptFilePath ? '' : legacyReceiptPreview(expense),
    receiptFileName: expense.receiptFileName ?? '',
    receiptFileType: expense.receiptFileType ?? '',
    receiptFileObj: null,
    receiptFilePath: expense.receiptFilePath ?? '',
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Modal({
  title, onClose, children, footer,
}: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex items-center justify-between gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function ReceiptThumb({ fileName, fileType, onClick }: {
  fileName: string; fileType: string; onClick?: () => void;
}) {
  if (!fileName) return null;
  const isPdf = fileType === 'application/pdf';
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors w-full text-left"
    >
      {isPdf
        ? <FileText size={16} className="text-red-400 flex-shrink-0" />
        : <Image size={16} className="text-blue-400 flex-shrink-0" />}
      <span className="truncate flex-1">{fileName}</span>
    </button>
  );
}

// ── Modale de détail (lecture seule ou éditable selon statut) ─────────────────

interface DetailModalProps {
  expense: Expense;
  isOwner: boolean;
  users: { id: string; firstName: string; lastName: string }[];
  onClose: () => void;
  onSave: (id: string, fd: FormData) => void;
  onDelete: (id: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
}

function ExpenseDetailModal({
  expense, isOwner, users, onClose, onSave, onDelete, onApprove, onReject,
}: DetailModalProps) {
  const isEditable = isOwner && expense.status !== 'approved';
  const [form, setForm] = useState<ExpenseForm>(expenseToForm(expense));
  const [formError, setFormError] = useState('');
  const [localPreview, setLocalPreview] = useState<{ url: string; name: string; type: string } | null>(null);
  const [showReceiptImg, setShowReceiptImg] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraRef    = useRef<HTMLInputElement>(null);

  const validatedByUser = expense.validatedBy ? users.find(u => u.id === expense.validatedBy) : null;

  // ── Gestion du fichier ────────────────────────────────────────────────────

  const loadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async ev => {
      const raw = ev.target?.result as string;
      const preview = await compressImage(raw, file.type);
      setForm(f => ({
        ...f,
        receiptPreview: preview,
        receiptFileName: file.name,
        receiptFileType: file.type,
        receiptFileObj: file,
        receiptFilePath: '',
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const amount = parseFloat(form.amount);
    if (!form.date)              { setFormError('La date est obligatoire.'); return; }
    if (isNaN(amount) || amount <= 0) { setFormError('Le montant TTC doit être supérieur à 0.'); return; }
    if (!form.reason.trim())     { setFormError('Le motif est obligatoire.'); return; }
    // Justificatif obligatoire — sauf si un ancien fichier (base64 legacy) existe déjà
    if (!form.receiptFileObj && !form.receiptFilePath && !form.receiptPreview) {
      setFormError('Le justificatif est obligatoire.');
      return;
    }

    const vatDetails: VatLine[] | undefined = form.vatLines.length > 0
      ? form.vatLines.filter(l => l.rate && l.amount).map(l => ({ rate: l.rate, amount: parseFloat(l.amount) }))
      : undefined;

    const fd = new globalThis.FormData();
    fd.append('date', form.date);
    fd.append('amount', String(amount));
    fd.append('reason', form.reason.trim());
    if (form.vendor.trim()) fd.append('vendor', form.vendor.trim());
    if (form.amountHt)      fd.append('amountHt', form.amountHt);
    if (vatDetails)         fd.append('vatDetails', JSON.stringify(vatDetails));
    if (form.receiptFileObj) fd.append('receipt', form.receiptFileObj);

    onSave(expense.id, fd);
    onClose();
  };

  // ── Justificatif helpers ──────────────────────────────────────────────────

  const currentFilePath = form.receiptFilePath || expense.receiptFilePath;
  const currentFileName = form.receiptFileName || expense.receiptFileName;
  const currentFileType = form.receiptFileType || expense.receiptFileType;
  const hasReceipt = !!(form.receiptPreview || currentFilePath);

  const openReceipt = () => {
    if (form.receiptPreview) {
      setLocalPreview({ url: form.receiptPreview, name: form.receiptFileName, type: form.receiptFileType });
    } else if (currentFilePath) {
      setShowReceiptImg(true);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const addVatLine    = () => setForm(f => ({ ...f, vatLines: [...f.vatLines, { rate: '20', amount: '' }] }));
  const removeVatLine = (i: number) => setForm(f => ({ ...f, vatLines: f.vatLines.filter((_, idx) => idx !== i) }));
  const updateVatLine = (i: number, field: keyof VatLineForm, value: string) =>
    setForm(f => ({ ...f, vatLines: f.vatLines.map((l, idx) => idx === i ? { ...l, [field]: value } : l) }));

  // Titre de la modale
  const modalTitle = expense.status === 'approved'
    ? 'Note de frais — Approuvée'
    : expense.status === 'rejected'
    ? 'Note de frais — Refusée'
    : 'Note de frais';

  // Pied de modale
  const footer = (
    <>
      {/* Côté gauche : Supprimer */}
      <div>
        {isOwner && expense.status !== 'approved' && (
          confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Supprimer ?</span>
              <button onClick={() => { onDelete(expense.id); onClose(); }} className="text-sm text-red-600 font-medium hover:underline">Oui</button>
              <button onClick={() => setConfirmDelete(false)} className="text-sm text-gray-400 hover:underline">Non</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-600 transition-colors">
              <Trash2 size={15} />
              Supprimer
            </button>
          )
        )}
      </div>

      {/* Côté droit : actions principales */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Approve / Reject (manager/admin, note en attente) */}
        {onApprove && onReject && expense.status === 'pending' && !isOwner && (
          confirmAction ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {confirmAction === 'approve' ? 'Approuver ?' : 'Rejeter ?'}
              </span>
              <button
                onClick={() => {
                  if (confirmAction === 'approve') onApprove(expense.id);
                  else onReject(expense.id);
                  onClose();
                }}
                className={`text-sm font-medium hover:underline ${confirmAction === 'approve' ? 'text-green-600' : 'text-red-600'}`}
              >
                Confirmer
              </button>
              <button onClick={() => setConfirmAction(null)} className="text-sm text-gray-400 hover:underline">Annuler</button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setConfirmAction('reject')}
                className="btn-danger flex items-center gap-1.5 py-1.5 px-3 text-sm"
              >
                <X size={14} /> Rejeter
              </button>
              <button
                onClick={() => setConfirmAction('approve')}
                className="btn-primary flex items-center gap-1.5 py-1.5 px-3 text-sm"
              >
                <Check size={14} /> Approuver
              </button>
            </>
          )
        )}

        {/* Fermer (lecture seule) ou Enregistrer (éditable) */}
        {isEditable ? (
          <>
            <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
            <button
              type="submit"
              form="detail-expense-form"
              className="btn-primary"
            >
              Enregistrer
            </button>
          </>
        ) : (
          <button onClick={onClose} className="btn-secondary">Fermer</button>
        )}
      </div>
    </>
  );

  return (
    <>
      <Modal title={modalTitle} onClose={onClose} footer={footer}>
        {/* Inputs cachés pour les fichiers */}
        {isEditable && (
          <>
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileInput} />
            <input ref={cameraRef}    type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileInput} />
          </>
        )}

        {isEditable ? (
          /* ── Mode édition ───────────────────────────────────────────── */
          <form id="detail-expense-form" onSubmit={handleSubmit} className="space-y-4">

            {/* Justificatif */}
            <div>
              <label className="label">Justificatif</label>
              {hasReceipt ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <ReceiptThumb
                      fileName={currentFileName || ''}
                      fileType={currentFileType || ''}
                      onClick={openReceipt}
                    />
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-gray-400 hover:text-tennis-green underline">Changer</button>
                    <span className="text-gray-200">|</span>
                    <button type="button" onClick={() => cameraRef.current?.click()} className="text-xs text-gray-400 hover:text-tennis-green underline flex items-center gap-1">
                      <Camera size={11} />Photo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-tennis-green hover:bg-tennis-green/5 transition-colors"
                  >
                    <Upload size={16} /> Fichier
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-tennis-green hover:bg-tennis-green/5 transition-colors"
                  >
                    <Camera size={16} /> Photo
                  </button>
                </div>
              )}
            </div>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{formError}</div>
            )}

            {/* Prestataire */}
            <div>
              <label className="label">Prestataire</label>
              <input type="text" className="input" value={form.vendor}
                onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))}
                placeholder="Ex: SNCF, Carrefour…" />
            </div>

            {/* Date */}
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" value={form.date} max={today}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
            </div>

            {/* Montant HT */}
            <div>
              <label className="label">Montant HT (€)</label>
              <input type="number" className="input" value={form.amountHt}
                onChange={e => setForm(f => ({ ...f, amountHt: e.target.value }))}
                min="0" step="0.01" placeholder="Ex: 37.92" />
            </div>

            {/* Lignes TVA */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">Lignes TVA</label>
                <button type="button" onClick={addVatLine} className="flex items-center gap-1 text-xs text-tennis-green hover:underline">
                  <PlusCircle size={13} /> Ajouter
                </button>
              </div>
              {form.vatLines.length > 0 ? (
                <div className="space-y-2">
                  {form.vatLines.map((line, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1 flex items-center gap-1">
                        <input type="number" className="input py-1.5 text-sm w-20"
                          value={line.rate} onChange={e => updateVatLine(i, 'rate', e.target.value)}
                          min="0" step="0.1" placeholder="Taux %" />
                        <span className="text-gray-400 text-sm">%</span>
                      </div>
                      <div className="flex-1 flex items-center gap-1">
                        <input type="number" className="input py-1.5 text-sm"
                          value={line.amount} onChange={e => updateVatLine(i, 'amount', e.target.value)}
                          min="0" step="0.01" placeholder="Montant €" />
                        <span className="text-gray-400 text-sm">€</span>
                      </div>
                      <button type="button" onClick={() => removeVatLine(i)} className="p-1 text-red-400 hover:bg-red-50 rounded">
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
              <input type="number" className="input" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                min="0.01" step="0.01" placeholder="Ex: 45.50" required />
            </div>

            {/* Motif */}
            <div>
              <label className="label">Motif *</label>
              <input type="text" className="input" value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Ex: Déplacement Paris, Achat matériel…" required />
            </div>
          </form>

        ) : (
          /* ── Mode lecture seule ─────────────────────────────────────── */
          <div className="space-y-4">

            {/* Montant + statut */}
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
              <div className="flex-1">
                <p className="text-2xl font-bold text-tennis-green">{formatCurrency(expense.amount)}</p>
                {expense.amountHt != null && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    HT {formatCurrency(expense.amountHt)}
                    {expense.vatDetails && expense.vatDetails.length > 0 && (
                      <span className="ml-2 text-gray-400">
                        TVA {expense.vatDetails.map(l => `${l.rate}%`).join(' · ')}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <span className={`badge-${expense.status} text-sm px-3 py-1`}>{statusLabels[expense.status]}</span>
            </div>

            {/* Détails */}
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-28 text-gray-400 flex-shrink-0">Date</dt>
                <dd className="text-gray-800 font-medium">{formatDate(expense.date)}</dd>
              </div>
              {expense.vendor && (
                <div className="flex gap-2">
                  <dt className="w-28 text-gray-400 flex-shrink-0">Prestataire</dt>
                  <dd className="text-gray-800 font-medium">{expense.vendor}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="w-28 text-gray-400 flex-shrink-0">Motif</dt>
                <dd className="text-gray-800">{expense.reason}</dd>
              </div>
              {expense.vatDetails && expense.vatDetails.length > 0 && (
                <div className="flex gap-2">
                  <dt className="w-28 text-gray-400 flex-shrink-0">TVA</dt>
                  <dd className="text-gray-800">
                    {expense.vatDetails.map((l, i) => (
                      <span key={i} className="mr-2">{l.rate}% → {formatCurrency(l.amount)}</span>
                    ))}
                  </dd>
                </div>
              )}
              {expense.status === 'approved' && validatedByUser && (
                <div className="flex gap-2">
                  <dt className="w-28 text-gray-400 flex-shrink-0">Approuvé par</dt>
                  <dd className="text-gray-800">{validatedByUser.firstName} {validatedByUser.lastName}{expense.validatedAt && <span className="text-gray-400 ml-1">· {formatDate(expense.validatedAt.slice(0, 10))}</span>}</dd>
                </div>
              )}
              {expense.status === 'rejected' && validatedByUser && (
                <div className="flex gap-2">
                  <dt className="w-28 text-gray-400 flex-shrink-0">Refusé par</dt>
                  <dd className="text-gray-800">{validatedByUser.firstName} {validatedByUser.lastName}{expense.validatedAt && <span className="text-gray-400 ml-1">· {formatDate(expense.validatedAt.slice(0, 10))}</span>}</dd>
                </div>
              )}
            </dl>

            {/* Justificatif */}
            {(currentFilePath || form.receiptPreview) && (
              <div>
                <p className="label">Justificatif</p>
                {currentFilePath && currentFileType === 'application/pdf' ? (
                  <a
                    href={fileUrl('expenses', currentFilePath)}
                    download={currentFileName}
                    className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700 hover:bg-red-100 transition-colors"
                  >
                    <FileText size={16} className="flex-shrink-0" />
                    <span className="truncate flex-1">{currentFileName}</span>
                    <span className="text-xs text-red-400 flex-shrink-0">Télécharger</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowReceiptImg(true)}
                    className="w-full"
                  >
                    <img
                      src={currentFilePath ? fileUrl('expenses', currentFilePath) : form.receiptPreview}
                      alt="Justificatif"
                      className="w-full max-h-48 object-cover rounded-xl border border-gray-100 hover:opacity-90 transition-opacity cursor-pointer"
                    />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Aperçu local (avant upload) */}
      {localPreview && (
        <Modal title="Aperçu" onClose={() => setLocalPreview(null)}>
          {localPreview.type === 'application/pdf' ? (
            <div className="p-8 bg-red-50 rounded-xl text-center">
              <FileText size={48} className="mx-auto text-red-400 mb-3" />
              <p className="text-sm text-gray-500">Le PDF sera visible après enregistrement.</p>
            </div>
          ) : (
            <img src={localPreview.url} alt="Aperçu" className="max-w-full rounded-xl mx-auto object-contain" />
          )}
        </Modal>
      )}

      {/* Aperçu plein écran (fichier serveur ou base64 legacy) */}
      {showReceiptImg && (currentFilePath || form.receiptPreview) && currentFileType !== 'application/pdf' && (
        <Modal title={currentFileName || 'Justificatif'} onClose={() => setShowReceiptImg(false)}>
          <img
            src={currentFilePath ? fileUrl('expenses', currentFilePath) : form.receiptPreview}
            alt="Justificatif"
            className="max-w-full rounded-xl mx-auto object-contain"
          />
        </Modal>
      )}
    </>
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
    deleteExpense,
  } = useApp();

  const [myStats, setMyStats] = useState<MyStats>({ pendingAmount: 0, nextPayrollAmount: 0, nextPayrollLabel: null });

  useEffect(() => {
    api.get<MyStats>('/expenses/my-stats')
      .then(setMyStats)
      .catch(() => {});
  }, [expenses]);

  // Modale "Nouvelle note"
  const [showNewForm, setShowNewForm] = useState(false);
  const [newFormStep, setNewFormStep] = useState<FormStep>('upload');
  const [newForm, setNewForm] = useState<ExpenseForm>(emptyForm);
  const [newFormError, setNewFormError] = useState('');
  const [recognizeError, setRecognizeError] = useState('');

  // Modale de détail
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [pendingRejectExpenseId, setPendingRejectExpenseId] = useState<string | null>(null);

  // UI
  const [expandedSection, setExpandedSection] = useState<'mine' | 'team'>('mine');
  const [localPreview, setLocalPreview] = useState<{ url: string; name: string; type: string } | null>(null);

  const newFileInputRef   = useRef<HTMLInputElement>(null);
  const newCameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const state = location.state as { openForm?: boolean; showTeam?: boolean } | null;
    if (state?.openForm) { openNewForm(); window.history.replaceState({}, ''); }
    if (state?.showTeam) { setExpandedSection('team'); window.history.replaceState({}, ''); }
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

  // ── Nouvelle note (flow upload → AI → form) ─────────────────────────────

  const openNewForm = () => {
    setNewForm(emptyForm);
    setNewFormError('');
    setRecognizeError('');
    setNewFormStep('upload');
    setShowNewForm(true);
  };

  const closeNewForm = () => setShowNewForm(false);

  const loadNewFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) { setRecognizeError('Le fichier ne doit pas dépasser 10 Mo.'); return; }
    setRecognizeError('');
    const reader = new FileReader();
    reader.onload = async ev => {
      const raw = ev.target?.result as string;
      const preview = await compressImage(raw, file.type);
      setNewForm(f => ({
        ...f,
        receiptPreview: preview,
        receiptFileName: file.name,
        receiptFileType: file.type,
        receiptFileObj: file,
        receiptFilePath: '',
      }));
      startRecognition(preview, file.type);
    };
    reader.readAsDataURL(file);
  };

  const handleNewFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadNewFile(file);
    e.target.value = '';
  };

  const startRecognition = async (fileData: string, fileType: string) => {
    setNewFormStep('recognizing');
    try {
      const result = await api.post<RecognizeResult>('/expenses/recognize', { fileData, fileType });
      setNewForm(f => ({
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
      setNewFormStep('form');
    }
  };

  const addVatLineNew    = () => setNewForm(f => ({ ...f, vatLines: [...f.vatLines, { rate: '20', amount: '' }] }));
  const removeVatLineNew = (i: number) => setNewForm(f => ({ ...f, vatLines: f.vatLines.filter((_, idx) => idx !== i) }));
  const updateVatLineNew = (i: number, field: keyof VatLineForm, value: string) =>
    setNewForm(f => ({ ...f, vatLines: f.vatLines.map((l, idx) => idx === i ? { ...l, [field]: value } : l) }));

  const handleNewSubmit = (e: FormEvent) => {
    e.preventDefault();
    setNewFormError('');
    const amount = parseFloat(newForm.amount);
    if (!newForm.date)                          { setNewFormError('La date est obligatoire.'); return; }
    if (isNaN(amount) || amount <= 0)           { setNewFormError('Le montant TTC doit être supérieur à 0.'); return; }
    if (!newForm.reason.trim())                 { setNewFormError('Le motif est obligatoire.'); return; }
    if (!newForm.receiptFileObj && !newForm.receiptFilePath) { setNewFormError('Le justificatif est obligatoire.'); return; }

    const vatDetails: VatLine[] | undefined = newForm.vatLines.length > 0
      ? newForm.vatLines.filter(l => l.rate && l.amount).map(l => ({ rate: l.rate, amount: parseFloat(l.amount) }))
      : undefined;

    const fd = new globalThis.FormData();
    fd.append('date', newForm.date);
    fd.append('amount', String(amount));
    fd.append('reason', newForm.reason.trim());
    if (newForm.vendor.trim()) fd.append('vendor', newForm.vendor.trim());
    if (newForm.amountHt)      fd.append('amountHt', newForm.amountHt);
    if (vatDetails)            fd.append('vatDetails', JSON.stringify(vatDetails));
    if (newForm.receiptFileObj) fd.append('receipt', newForm.receiptFileObj);

    addExpense(fd);
    closeNewForm();
  };

  const getUser = (userId: string) => users.find(u => u.id === userId);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notes de frais</h1>
          <p className="text-gray-500 mt-1">Soumettez et suivez vos remboursements de frais.</p>
        </div>
        <button onClick={openNewForm} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Nouvelle note
        </button>
      </div>

      {/* Stats */}
      <div className={`grid grid-cols-1 gap-4 mb-6 ${isManagerOrAdmin ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
        <div className="card text-center">
          <p className="text-3xl font-bold text-yellow-500">{myExpenses.filter(e => e.status === 'pending').length}</p>
          <p className="text-sm text-gray-500 mt-1">En attente</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-500">{myExpenses.filter(e => e.status === 'approved').length}</p>
          <p className="text-sm text-gray-500 mt-1">Approuvées</p>
        </div>
        <div className="card flex flex-col divide-y divide-gray-100">
          <div className="flex items-center gap-3 pb-3">
            <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center flex-shrink-0">
              <Clock size={16} className="text-yellow-500" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-yellow-500 leading-tight">{formatCurrency(myStats.pendingAmount)}</p>
              <p className="text-xs text-gray-400">En attente de remboursement</p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-3">
            <div className="w-8 h-8 rounded-lg bg-tennis-green/10 flex items-center justify-center flex-shrink-0">
              <CalendarCheck size={16} className="text-tennis-green" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-tennis-green leading-tight">{formatCurrency(myStats.nextPayrollAmount)}</p>
              <p className="text-xs text-gray-400">
                Prochaine paie
                {myStats.nextPayrollLabel && <span className="ml-1 text-gray-300">· {myStats.nextPayrollLabel}</span>}
              </p>
            </div>
          </div>
        </div>

        {isManagerOrAdmin && (
          <div
            className="card text-center cursor-pointer hover:border-orange-200 hover:shadow-sm transition-all"
            onClick={() => setExpandedSection('team')}
          >
            <p className={`text-3xl font-bold ${pendingTeamExpenses.length > 0 ? 'text-orange-500' : 'text-gray-300'}`}>
              {pendingTeamExpenses.length}
            </p>
            <p className="text-sm text-gray-500 mt-1">À valider</p>
            {pendingTeamExpenses.length > 0 && <p className="text-xs text-orange-400 mt-1">Cliquer pour voir</p>}
          </div>
        )}
      </div>

      {/* Mes notes de frais */}
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
              <div className="space-y-2">
                {myExpenses.map(expense => (
                  <button
                    key={expense.id}
                    onClick={() => setDetailExpense(expense)}
                    className="w-full text-left border border-gray-100 rounded-xl p-4 hover:bg-gray-50 hover:border-gray-200 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-base font-bold text-tennis-green">{formatCurrency(expense.amount)}</span>
                          <span className={`badge-${expense.status}`}>{statusLabels[expense.status]}</span>
                          {expense.receiptFilePath && (
                            <span className="text-gray-300">
                              {expense.receiptFileType === 'application/pdf' ? <FileText size={12} /> : <Image size={12} />}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          {expense.vendor && <span className="font-medium truncate">{expense.vendor}</span>}
                          {expense.vendor && <span className="text-gray-300">·</span>}
                          <span className="truncate text-gray-500">{expense.reason}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(expense.date)}</p>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1.5 text-gray-300 group-hover:text-gray-400 transition-colors">
                        {expense.status !== 'approved'
                          ? <Edit2 size={15} />
                          : <Lock size={14} />
                        }
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notes de l'équipe */}
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
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Motif</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {teamExpenses.map(expense => {
                        const user = getUser(expense.userId);
                        return (
                          <tr
                            key={expense.id}
                            onClick={() => setDetailExpense(expense)}
                            className={`cursor-pointer hover:bg-gray-50 transition-colors ${expense.status === 'pending' ? 'bg-yellow-50/40' : ''}`}
                          >
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-tennis-green flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                  {user?.firstName[0]}{user?.lastName[0]}
                                </div>
                                <span className="text-gray-700 font-medium">{user?.firstName} {user?.lastName}</span>
                              </div>
                            </td>
                            <td className="py-3 pr-4 text-gray-600">{formatDate(expense.date)}</td>
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
                              <div className="flex items-center gap-2">
                                <span className={`badge-${expense.status}`}>{statusLabels[expense.status]}</span>
                                {expense.receiptFilePath && (
                                  <span className="text-gray-300">
                                    {expense.receiptFileType === 'application/pdf' ? <FileText size={12} /> : <Image size={12} />}
                                  </span>
                                )}
                              </div>
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

      {/* ── Modale de détail ────────────────────────────────────────────────── */}
      {detailExpense && (
        <ExpenseDetailModal
          expense={detailExpense}
          isOwner={detailExpense.userId === currentUser?.id}
          users={users}
          onClose={() => setDetailExpense(null)}
          onSave={(id, fd) => { updateExpense(id, fd); setDetailExpense(null); }}
          onDelete={(id) => { deleteExpense(id); setDetailExpense(null); }}
          onApprove={isManagerOrAdmin ? (id) => { approveExpense(id); setDetailExpense(null); } : undefined}
          onReject={isManagerOrAdmin ? (id) => { setPendingRejectExpenseId(id); } : undefined}
        />
      )}

      {/* ── Modale "Nouvelle note" ───────────────────────────────────────────── */}
      {showNewForm && (
        <Modal
          title="Nouvelle note de frais"
          onClose={closeNewForm}
        >
          {/* Inputs fichier cachés */}
          <input ref={newFileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleNewFileInput} />
          <input ref={newCameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleNewFileInput} />

          {/* Étape 1 : upload */}
          {newFormStep === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 text-center">
                Chargez votre justificatif pour démarrer la reconnaissance automatique.
              </p>
              <div
                onClick={() => newFileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-2xl p-10 text-center cursor-pointer hover:border-tennis-green hover:bg-tennis-green/5 transition-colors"
              >
                <Upload size={36} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium text-gray-600">Cliquez pour sélectionner un fichier</p>
                <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — max 10 Mo</p>
              </div>
              <button
                type="button"
                onClick={() => newCameraInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Camera size={18} className="text-gray-400" />
                Prendre une photo
              </button>
              {recognizeError && <p className="text-xs text-red-500 text-center">{recognizeError}</p>}
              <div className="flex justify-end">
                <button type="button" onClick={closeNewForm} className="btn-secondary">Annuler</button>
              </div>
            </div>
          )}

          {/* Étape 2 : reconnaissance */}
          {newFormStep === 'recognizing' && (
            <div className="py-12 flex flex-col items-center gap-4 text-gray-500">
              <div className="relative">
                <Loader2 size={40} className="animate-spin text-tennis-green" />
                <Sparkles size={18} className="absolute -top-1 -right-1 text-yellow-400" />
              </div>
              <p className="text-sm font-medium">Analyse du justificatif en cours…</p>
              <p className="text-xs text-gray-400">Identification du prestataire, des montants et de la TVA</p>
            </div>
          )}

          {/* Étape 3 : formulaire */}
          {newFormStep === 'form' && (
            <form onSubmit={handleNewSubmit} className="space-y-4">
              {/* Aperçu justificatif */}
              {newForm.receiptFileName && (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <ReceiptThumb
                      fileName={newForm.receiptFileName}
                      fileType={newForm.receiptFileType}
                      onClick={() => {
                        if (newForm.receiptPreview) {
                          setLocalPreview({ url: newForm.receiptPreview, name: newForm.receiptFileName, type: newForm.receiptFileType });
                        }
                      }}
                    />
                  </div>
                  <button type="button" onClick={() => newFileInputRef.current?.click()} className="flex-shrink-0 text-xs text-gray-400 hover:text-tennis-green underline">
                    Changer
                  </button>
                </div>
              )}

              {recognizeError ? (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                  <Sparkles size={14} className="flex-shrink-0 mt-0.5" /><span>{recognizeError}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2.5 bg-tennis-green/5 border border-tennis-green/20 rounded-lg text-xs text-tennis-green">
                  <Sparkles size={14} className="flex-shrink-0" />
                  <span>Champs pré-remplis par IA — vérifiez et corrigez si nécessaire.</span>
                </div>
              )}

              {newFormError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{newFormError}</div>
              )}

              <div>
                <label className="label">Prestataire</label>
                <input type="text" className="input" value={newForm.vendor}
                  onChange={e => setNewForm(f => ({ ...f, vendor: e.target.value }))} placeholder="Ex: SNCF, Carrefour…" />
              </div>
              <div>
                <label className="label">Date *</label>
                <input type="date" className="input" value={newForm.date} max={today}
                  onChange={e => setNewForm(f => ({ ...f, date: e.target.value }))} required />
              </div>
              <div>
                <label className="label">Montant HT (€)</label>
                <input type="number" className="input" value={newForm.amountHt}
                  onChange={e => setNewForm(f => ({ ...f, amountHt: e.target.value }))} min="0" step="0.01" placeholder="Ex: 37.92" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">Lignes TVA</label>
                  <button type="button" onClick={addVatLineNew} className="flex items-center gap-1 text-xs text-tennis-green hover:underline">
                    <PlusCircle size={13} /> Ajouter
                  </button>
                </div>
                {newForm.vatLines.length > 0 ? (
                  <div className="space-y-2">
                    {newForm.vatLines.map((line, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-1">
                          <input type="number" className="input py-1.5 text-sm w-20"
                            value={line.rate} onChange={e => updateVatLineNew(i, 'rate', e.target.value)} min="0" step="0.1" placeholder="Taux %" />
                          <span className="text-gray-400 text-sm">%</span>
                        </div>
                        <div className="flex-1 flex items-center gap-1">
                          <input type="number" className="input py-1.5 text-sm"
                            value={line.amount} onChange={e => updateVatLineNew(i, 'amount', e.target.value)} min="0" step="0.01" placeholder="Montant €" />
                          <span className="text-gray-400 text-sm">€</span>
                        </div>
                        <button type="button" onClick={() => removeVatLineNew(i)} className="p-1 text-red-400 hover:bg-red-50 rounded">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-gray-400 italic">Aucune ligne TVA</p>}
              </div>
              <div>
                <label className="label">Montant TTC (€) *</label>
                <input type="number" className="input" value={newForm.amount}
                  onChange={e => setNewForm(f => ({ ...f, amount: e.target.value }))} min="0.01" step="0.01" placeholder="Ex: 45.50" required />
              </div>
              <div>
                <label className="label">Motif *</label>
                <input type="text" className="input" value={newForm.reason}
                  onChange={e => setNewForm(f => ({ ...f, reason: e.target.value }))} placeholder="Ex: Déplacement Paris, Achat matériel…" required />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeNewForm} className="btn-secondary">Annuler</button>
                <button type="submit" className="btn-primary">Soumettre</button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* Aperçu local (modale "Nouvelle note") */}
      {localPreview && (
        <Modal title="Aperçu" onClose={() => setLocalPreview(null)}>
          {localPreview.type === 'application/pdf' ? (
            <div className="p-8 bg-red-50 rounded-xl text-center">
              <FileText size={48} className="mx-auto text-red-400 mb-3" />
              <p className="text-sm text-gray-500">Le PDF sera visible après envoi.</p>
            </div>
          ) : (
            <img src={localPreview.url} alt="Aperçu" className="max-w-full rounded-xl mx-auto object-contain" />
          )}
        </Modal>
      )}

      {/* Modale motif de refus note de frais */}
      {pendingRejectExpenseId && (
        <RejectReasonModal
          title="Refuser la note de frais"
          onConfirm={async (reason) => {
            await rejectExpense(pendingRejectExpenseId, reason || undefined);
            setPendingRejectExpenseId(null);
            setDetailExpense(null);
          }}
          onCancel={() => setPendingRejectExpenseId(null)}
        />
      )}
    </div>
  );
}
