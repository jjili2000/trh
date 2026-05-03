import { useState, useRef, ReactNode, FormEvent, ChangeEvent } from 'react';
import { Plus, Check, X, Receipt, ChevronDown, ChevronUp, FileText, Image, Upload } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Expense } from '../../types';

const statusLabels = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Rejeté',
};

interface FormData {
  date: string;
  amount: string;
  reason: string;
  receiptFile: string;
  receiptFileName: string;
  receiptFileType: string;
}

const today = new Date().toISOString().slice(0, 10);

const emptyForm: FormData = {
  date: today,
  amount: '',
  reason: '',
  receiptFile: '',
  receiptFileName: '',
  receiptFileType: '',
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
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

function ReceiptPreview({ file, fileName, fileType }: { file: string; fileName: string; fileType: string }) {
  const isPdf = fileType === 'application/pdf';
  if (!file) return null;
  if (isPdf) {
    return (
      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
        <FileText size={18} />
        <span className="truncate">{fileName}</span>
      </div>
    );
  }
  return (
    <div className="mt-2">
      <img
        src={file}
        alt="Justificatif"
        className="max-h-32 rounded-lg border border-gray-200 object-contain"
      />
      <p className="text-xs text-gray-400 mt-1 truncate">{fileName}</p>
    </div>
  );
}

function formatCurrency(amount: number) {
  return amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

export default function ExpenseManagement() {
  const {
    currentUser,
    users,
    expenses,
    addExpense,
    updateExpense,
    approveExpense,
    rejectExpense,
  } = useApp();

  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [expandedSection, setExpandedSection] = useState<'mine' | 'team'>('mine');
  const [previewExpense, setPreviewExpense] = useState<Expense | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isManagerOrAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const myExpenses = expenses
    .filter(e => e.userId === currentUser?.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const subordinateIds =
    currentUser?.role === 'admin'
      ? users.map(u => u.id).filter(id => id !== currentUser.id)
      : users.filter(u => u.managerId === currentUser?.id).map(u => u.id);

  const teamExpenses = expenses
    .filter(e => subordinateIds.includes(e.userId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pendingTeamExpenses = teamExpenses.filter(e => e.status === 'pending');

  const totalApproved = myExpenses
    .filter(e => e.status === 'approved')
    .reduce((sum, e) => sum + e.amount, 0);

  const openAdd = () => {
    setForm(emptyForm);
    setEditingExpense(null);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (expense: Expense) => {
    setForm({
      date: expense.date,
      amount: String(expense.amount),
      reason: expense.reason,
      receiptFile: expense.receiptFile ?? '',
      receiptFileName: expense.receiptFileName ?? '',
      receiptFileType: expense.receiptFileType ?? '',
    });
    setEditingExpense(expense);
    setFormError('');
    setShowForm(true);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setFormError('Le fichier ne doit pas dépasser 5 Mo.');
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      setForm(f => ({
        ...f,
        receiptFile: ev.target?.result as string,
        receiptFileName: file.name,
        receiptFileType: file.type,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const amount = parseFloat(form.amount);
    if (!form.date) { setFormError('La date est obligatoire.'); return; }
    if (isNaN(amount) || amount <= 0) { setFormError('Le montant doit être supérieur à 0.'); return; }
    if (!form.reason.trim()) { setFormError('Le motif est obligatoire.'); return; }
    if (!form.receiptFile) { setFormError('Le justificatif est obligatoire.'); return; }

    const expenseData = {
      userId: currentUser!.id,
      date: form.date,
      amount,
      reason: form.reason,
      receiptFile: form.receiptFile || undefined,
      receiptFileName: form.receiptFileName || undefined,
      receiptFileType: form.receiptFileType || undefined,
    };

    if (editingExpense) {
      updateExpense(editingExpense.id, {
        ...expenseData,
        status: 'pending',
        validatedBy: undefined,
        validatedAt: undefined,
      });
    } else {
      addExpense(expenseData);
    }
    setShowForm(false);
  };

  const getUser = (userId: string) => users.find(u => u.id === userId);

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
        <div className="card text-center">
          <p className="text-2xl font-bold text-tennis-green">{formatCurrency(totalApproved)}</p>
          <p className="text-sm text-gray-500 mt-1">Total remboursé</p>
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
                        <p className="text-sm font-medium text-gray-700">{expense.reason}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(expense.date).toLocaleDateString('fr-FR')}
                        </p>
                        {expense.receiptFile && (
                          <button
                            onClick={() => setPreviewExpense(expense)}
                            className="mt-2 flex items-center gap-1.5 text-xs text-tennis-green hover:underline"
                          >
                            {expense.receiptFileType === 'application/pdf' ? (
                              <FileText size={13} />
                            ) : (
                              <Image size={13} />
                            )}
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
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Montant</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Motif</th>
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
                            </td>
                            <td className="py-3 pr-4 text-gray-600 max-w-xs truncate">{expense.reason}</td>
                            <td className="py-3 pr-4">
                              {expense.receiptFile ? (
                                <button
                                  onClick={() => setPreviewExpense(expense)}
                                  className="flex items-center gap-1 text-xs text-tennis-green hover:underline"
                                >
                                  {expense.receiptFileType === 'application/pdf' ? (
                                    <FileText size={13} />
                                  ) : (
                                    <Image size={13} />
                                  )}
                                  Voir
                                </button>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>
                            <td className="py-3 pr-4">
                              <span className={`badge-${expense.status}`}>
                                {statusLabels[expense.status]}
                              </span>
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

      {/* Add/Edit Form Modal */}
      {showForm && (
        <Modal
          title={editingExpense ? 'Modifier la note de frais' : 'Nouvelle note de frais'}
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {formError}
              </div>
            )}

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

            <div>
              <label className="label">Montant (€) *</label>
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

            <div>
              <label className="label">Motif *</label>
              <input
                type="text"
                className="input"
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Ex: Déplacement Paris, Achat matériel..."
                required
              />
            </div>

            <div>
              <label className="label">Justificatif *</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-tennis-green hover:bg-tennis-green/5 transition-colors"
              >
                <Upload size={24} className="mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-500">
                  Cliquez pour sélectionner un fichier
                </p>
                <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — max 5 Mo</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />

              {form.receiptFile && (
                <div className="mt-3">
                  <ReceiptPreview
                    file={form.receiptFile}
                    fileName={form.receiptFileName}
                    fileType={form.receiptFileType}
                  />
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, receiptFile: '', receiptFileName: '', receiptFileType: '' }))}
                    className="mt-2 text-xs text-red-500 hover:underline"
                  >
                    Supprimer le fichier
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Annuler
              </button>
              <button type="submit" className="btn-primary">
                {editingExpense ? 'Enregistrer' : 'Soumettre'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Receipt Preview Modal */}
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
