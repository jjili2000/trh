import { useState, ReactNode, FormEvent } from 'react';
import { Plus, Check, X, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AbsenceRequest } from '../../types';

const statusLabels = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Rejeté',
};

const absenceTypeLabels = {
  vacation: 'Congés payés',
  sick: 'Arrêt maladie',
  personal: 'Congés personnels',
  other: 'Autre',
};

interface FormData {
  startDate: string;
  endDate: string;
  type: AbsenceRequest['type'];
  reason: string;
}

const today = new Date().toISOString().slice(0, 10);

const emptyForm: FormData = {
  startDate: today,
  endDate: today,
  type: 'vacation',
  reason: '',
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4">
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

function diffDays(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
}

export default function AbsenceManagement() {
  const {
    currentUser,
    users,
    absenceRequests,
    addAbsenceRequest,
    updateAbsenceRequest,
    approveAbsenceRequest,
    rejectAbsenceRequest,
  } = useApp();

  const [showForm, setShowForm] = useState(false);
  const [editingRequest, setEditingRequest] = useState<AbsenceRequest | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [expandedSection, setExpandedSection] = useState<'mine' | 'team'>('mine');

  const isManagerOrAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const myRequests = absenceRequests
    .filter(r => r.userId === currentUser?.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const subordinateIds =
    currentUser?.role === 'admin'
      ? users.map(u => u.id).filter(id => id !== currentUser.id)
      : users.filter(u => u.managerId === currentUser?.id).map(u => u.id);

  const teamRequests = absenceRequests
    .filter(r => subordinateIds.includes(r.userId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pendingTeamRequests = teamRequests.filter(r => r.status === 'pending');

  const openAdd = () => {
    setForm(emptyForm);
    setEditingRequest(null);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (req: AbsenceRequest) => {
    setForm({
      startDate: req.startDate,
      endDate: req.endDate,
      type: req.type,
      reason: req.reason ?? '',
    });
    setEditingRequest(req);
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.startDate || !form.endDate) {
      setFormError('Les dates sont obligatoires.');
      return;
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      setFormError('La date de fin doit être après la date de début.');
      return;
    }

    if (editingRequest) {
      updateAbsenceRequest(editingRequest.id, {
        startDate: form.startDate,
        endDate: form.endDate,
        type: form.type,
        reason: form.reason || undefined,
        status: 'pending',
        validatedBy: undefined,
        validatedAt: undefined,
      });
    } else {
      addAbsenceRequest({
        userId: currentUser!.id,
        startDate: form.startDate,
        endDate: form.endDate,
        type: form.type,
        reason: form.reason || undefined,
      });
    }
    setShowForm(false);
  };

  const getUser = (userId: string) => users.find(u => u.id === userId);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des absences</h1>
          <p className="text-gray-500 mt-1">Soumettez et suivez vos demandes d'absence.</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Nouvelle demande
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-3xl font-bold text-yellow-500">
            {myRequests.filter(r => r.status === 'pending').length}
          </p>
          <p className="text-sm text-gray-500 mt-1">En attente</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-500">
            {myRequests.filter(r => r.status === 'approved').length}
          </p>
          <p className="text-sm text-gray-500 mt-1">Approuvées</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-tennis-green">
            {myRequests
              .filter(r => r.status === 'approved')
              .reduce((sum, r) => sum + diffDays(r.startDate, r.endDate), 0)}
          </p>
          <p className="text-sm text-gray-500 mt-1">Jours approuvés</p>
        </div>
      </div>

      {/* Manager: pending team requests alert */}
      {isManagerOrAdmin && pendingTeamRequests.length > 0 && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
          <Calendar size={18} className="text-blue-500 flex-shrink-0" />
          <p className="text-sm text-blue-800">
            <span className="font-semibold">{pendingTeamRequests.length}</span> demande(s) en attente de validation de votre équipe.
          </p>
        </div>
      )}

      {/* My requests */}
      <div className="card mb-4">
        <button
          onClick={() => setExpandedSection(expandedSection === 'mine' ? 'team' : 'mine')}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900">Mes demandes</h2>
            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{myRequests.length}</span>
          </div>
          {expandedSection === 'mine' ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>

        {expandedSection === 'mine' && (
          <div className="mt-4">
            {myRequests.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Calendar size={32} className="mx-auto mb-2 opacity-40" />
                <p>Aucune demande. Cliquez sur "Nouvelle demande" pour soumettre une absence.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myRequests.map(req => (
                  <div key={req.id} className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">{absenceTypeLabels[req.type]}</span>
                          <span className={`badge-${req.status}`}>{statusLabels[req.status]}</span>
                        </div>
                        <p className="text-sm text-gray-500">
                          {new Date(req.startDate).toLocaleDateString('fr-FR')}
                          {' → '}
                          {new Date(req.endDate).toLocaleDateString('fr-FR')}
                          {' · '}
                          <span className="font-medium">{diffDays(req.startDate, req.endDate)} jour(s)</span>
                        </p>
                        {req.reason && (
                          <p className="text-sm text-gray-400 mt-1 italic">« {req.reason} »</p>
                        )}
                      </div>
                      {req.status === 'pending' && (
                        <button
                          onClick={() => openEdit(req)}
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

      {/* Team requests (manager/admin) */}
      {isManagerOrAdmin && (
        <div className="card">
          <button
            onClick={() => setExpandedSection(expandedSection === 'team' ? 'mine' : 'team')}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900">Demandes de l'équipe</h2>
              <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{teamRequests.length}</span>
              {pendingTeamRequests.length > 0 && (
                <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full">
                  {pendingTeamRequests.length} en attente
                </span>
              )}
            </div>
            {expandedSection === 'team' ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
          </button>

          {expandedSection === 'team' && (
            <div className="mt-4">
              {teamRequests.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p>Aucune demande de l'équipe.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {teamRequests.map(req => {
                    const user = getUser(req.userId);
                    return (
                      <div key={req.id} className={`border rounded-xl p-4 ${req.status === 'pending' ? 'border-yellow-200 bg-yellow-50/30' : 'border-gray-100'}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-6 h-6 rounded-full bg-tennis-green flex items-center justify-center text-white text-xs font-bold">
                                {user?.firstName[0]}{user?.lastName[0]}
                              </div>
                              <span className="font-medium text-gray-900">{user?.firstName} {user?.lastName}</span>
                              <span className="text-gray-400 text-sm">·</span>
                              <span className="text-sm text-gray-600">{absenceTypeLabels[req.type]}</span>
                              <span className={`badge-${req.status}`}>{statusLabels[req.status]}</span>
                            </div>
                            <p className="text-sm text-gray-500 ml-8">
                              {new Date(req.startDate).toLocaleDateString('fr-FR')}
                              {' → '}
                              {new Date(req.endDate).toLocaleDateString('fr-FR')}
                              {' · '}
                              <span className="font-medium">{diffDays(req.startDate, req.endDate)} jour(s)</span>
                            </p>
                            {req.reason && (
                              <p className="text-sm text-gray-400 ml-8 mt-1 italic">« {req.reason} »</p>
                            )}
                          </div>
                          {req.status === 'pending' && (
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => approveAbsenceRequest(req.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
                              >
                                <Check size={13} />
                                Approuver
                              </button>
                              <button
                                onClick={() => rejectAbsenceRequest(req.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
                              >
                                <X size={13} />
                                Rejeter
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <Modal
          title={editingRequest ? 'Modifier la demande' : "Nouvelle demande d'absence"}
          onClose={() => setShowForm(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {formError}
              </div>
            )}

            <div>
              <label className="label">Type d'absence *</label>
              <select
                className="input"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as AbsenceRequest['type'] }))}
              >
                <option value="vacation">Congés payés</option>
                <option value="sick">Arrêt maladie</option>
                <option value="personal">Congés personnels</option>
                <option value="other">Autre</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Date de début *</label>
                <input
                  type="date"
                  className="input"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label">Date de fin *</label>
                <input
                  type="date"
                  className="input"
                  value={form.endDate}
                  min={form.startDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  required
                />
              </div>
            </div>

            {form.startDate && form.endDate && (
              <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                Durée : <strong>{diffDays(form.startDate, form.endDate)} jour(s)</strong>
              </div>
            )}

            <div>
              <label className="label">Motif (optionnel)</label>
              <textarea
                className="input resize-none"
                rows={3}
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Précisez le motif de l'absence..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Annuler
              </button>
              <button type="submit" className="btn-primary">
                {editingRequest ? 'Enregistrer' : 'Soumettre'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
