import { useState, ReactNode, FormEvent } from 'react';
import { Plus, Check, X, Clock, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TimeEntry } from '../../types';

const statusLabels = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Rejeté',
};

interface EntryFormData {
  date: string;
  hours: string;
  activityTypeId: string;
  description: string;
}

const emptyForm: EntryFormData = {
  date: new Date().toISOString().slice(0, 10),
  hours: '',
  activityTypeId: '',
  description: '',
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

export default function TimeTracking() {
  const {
    currentUser,
    users,
    activityTypes,
    timeEntries,
    addTimeEntry,
    updateTimeEntry,
    approveTimeEntry,
    rejectTimeEntry,
  } = useApp();

  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [form, setForm] = useState<EntryFormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [expandedSection, setExpandedSection] = useState<'mine' | 'team'>('mine');

  const isManagerOrAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  // My entries
  const myEntries = timeEntries
    .filter(e => e.userId === currentUser?.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Subordinates entries (pending, for validation)
  const subordinateIds =
    currentUser?.role === 'admin'
      ? users.map(u => u.id).filter(id => id !== currentUser.id)
      : users.filter(u => u.managerId === currentUser?.id).map(u => u.id);

  const teamEntries = timeEntries
    .filter(e => subordinateIds.includes(e.userId))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const pendingTeamEntries = teamEntries.filter(e => e.status === 'pending');

  const openAdd = () => {
    setForm(emptyForm);
    setEditingEntry(null);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (entry: TimeEntry) => {
    setForm({
      date: entry.date,
      hours: String(entry.hours),
      activityTypeId: entry.activityTypeId,
      description: entry.description ?? '',
    });
    setEditingEntry(entry);
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const hours = parseFloat(form.hours);
    if (!form.date) { setFormError('La date est obligatoire.'); return; }
    if (isNaN(hours) || hours <= 0 || hours > 24) { setFormError('Les heures doivent être entre 0.1 et 24.'); return; }
    if (!form.activityTypeId) { setFormError("Le type d'activité est obligatoire."); return; }

    if (editingEntry) {
      updateTimeEntry(editingEntry.id, {
        date: form.date,
        hours,
        activityTypeId: form.activityTypeId,
        description: form.description || undefined,
        status: 'pending',
        validatedBy: undefined,
        validatedAt: undefined,
      });
    } else {
      addTimeEntry({
        userId: currentUser!.id,
        date: form.date,
        hours,
        activityTypeId: form.activityTypeId,
        description: form.description || undefined,
      });
    }
    setShowForm(false);
  };

  const getUser = (userId: string) => users.find(u => u.id === userId);
  const getActivityType = (atId: string) => activityTypes.find(a => a.id === atId);

  const totalHoursThisMonth = myEntries
    .filter(e => {
      const d = new Date(e.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, e) => sum + e.hours, 0);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion du temps</h1>
          <p className="text-gray-500 mt-1">Saisissez et suivez vos heures de travail.</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          Nouvelle saisie
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-3xl font-bold text-tennis-green">{totalHoursThisMonth}h</p>
          <p className="text-sm text-gray-500 mt-1">Ce mois-ci</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-yellow-500">
            {myEntries.filter(e => e.status === 'pending').length}
          </p>
          <p className="text-sm text-gray-500 mt-1">En attente</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-500">
            {myEntries.filter(e => e.status === 'approved').length}
          </p>
          <p className="text-sm text-gray-500 mt-1">Approuvées</p>
        </div>
      </div>

      {/* Manager: pending team entries alert */}
      {isManagerOrAdmin && pendingTeamEntries.length > 0 && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
          <Clock size={18} className="text-blue-500 flex-shrink-0" />
          <p className="text-sm text-blue-800">
            <span className="font-semibold">{pendingTeamEntries.length}</span> saisie(s) en attente de validation de votre équipe.
          </p>
        </div>
      )}

      {/* My entries */}
      <div className="card mb-4">
        <button
          onClick={() => setExpandedSection(expandedSection === 'mine' ? 'team' : 'mine')}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900">Mes saisies</h2>
            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{myEntries.length}</span>
          </div>
          {expandedSection === 'mine' ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>

        {expandedSection === 'mine' && (
          <div className="mt-4">
            {myEntries.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Clock size={32} className="mx-auto mb-2 opacity-40" />
                <p>Aucune saisie. Cliquez sur "Nouvelle saisie" pour commencer.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 text-gray-500 font-medium">Date</th>
                      <th className="text-left py-2 pr-4 text-gray-500 font-medium">Heures</th>
                      <th className="text-left py-2 pr-4 text-gray-500 font-medium">Type d'activité</th>
                      <th className="text-left py-2 pr-4 text-gray-500 font-medium">Description</th>
                      <th className="text-left py-2 pr-4 text-gray-500 font-medium">Statut</th>
                      <th className="text-right py-2 text-gray-500 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {myEntries.map(entry => {
                      const at = getActivityType(entry.activityTypeId);
                      return (
                        <tr key={entry.id} className="hover:bg-gray-50">
                          <td className="py-3 pr-4 text-gray-700">
                            {new Date(entry.date).toLocaleDateString('fr-FR')}
                          </td>
                          <td className="py-3 pr-4 font-semibold text-tennis-green">{entry.hours}h</td>
                          <td className="py-3 pr-4">
                            {at && (
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: at.color }} />
                                <span className="text-gray-700">{at.name}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-gray-500 max-w-xs truncate">
                            {entry.description ?? '—'}
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`badge-${entry.status}`}>
                              {statusLabels[entry.status]}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            {entry.status === 'pending' && (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => openEdit(entry)}
                                  className="p-1.5 text-gray-400 hover:text-tennis-green hover:bg-tennis-green/10 rounded-lg transition-colors"
                                >
                                  <Pencil size={14} />
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

      {/* Team entries (manager/admin only) */}
      {isManagerOrAdmin && (
        <div className="card">
          <button
            onClick={() => setExpandedSection(expandedSection === 'team' ? 'mine' : 'team')}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900">Saisies de l'équipe</h2>
              <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{teamEntries.length}</span>
              {pendingTeamEntries.length > 0 && (
                <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full">
                  {pendingTeamEntries.length} en attente
                </span>
              )}
            </div>
            {expandedSection === 'team' ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
          </button>

          {expandedSection === 'team' && (
            <div className="mt-4">
              {teamEntries.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p>Aucune saisie de l'équipe.</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Employé</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Date</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Heures</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Type</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Description</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Statut</th>
                        <th className="text-right py-2 text-gray-500 font-medium">Validation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {teamEntries.map(entry => {
                        const user = getUser(entry.userId);
                        const at = getActivityType(entry.activityTypeId);
                        return (
                          <tr key={entry.id} className={`hover:bg-gray-50 ${entry.status === 'pending' ? 'bg-yellow-50/40' : ''}`}>
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-tennis-green flex items-center justify-center text-white text-xs font-bold">
                                  {user?.firstName[0]}{user?.lastName[0]}
                                </div>
                                <span className="text-gray-700 font-medium">{user?.firstName} {user?.lastName}</span>
                              </div>
                            </td>
                            <td className="py-3 pr-4 text-gray-700">
                              {new Date(entry.date).toLocaleDateString('fr-FR')}
                            </td>
                            <td className="py-3 pr-4 font-semibold text-tennis-green">{entry.hours}h</td>
                            <td className="py-3 pr-4">
                              {at && (
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: at.color }} />
                                  <span className="text-gray-700">{at.name}</span>
                                </div>
                              )}
                            </td>
                            <td className="py-3 pr-4 text-gray-500 max-w-xs truncate">
                              {entry.description ?? '—'}
                            </td>
                            <td className="py-3 pr-4">
                              <span className={`badge-${entry.status}`}>
                                {statusLabels[entry.status]}
                              </span>
                            </td>
                            <td className="py-3 text-right">
                              {entry.status === 'pending' && (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => approveTimeEntry(entry.id)}
                                    className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                    title="Approuver"
                                  >
                                    <Check size={16} />
                                  </button>
                                  <button
                                    onClick={() => rejectTimeEntry(entry.id)}
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
          title={editingEntry ? 'Modifier la saisie' : 'Nouvelle saisie de temps'}
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
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="label">Nombre d'heures *</label>
              <input
                type="number"
                className="input"
                value={form.hours}
                onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                min="0.5"
                max="24"
                step="0.5"
                placeholder="Ex: 7.5"
                required
              />
            </div>

            <div>
              <label className="label">Type d'activité *</label>
              <select
                className="input"
                value={form.activityTypeId}
                onChange={e => setForm(f => ({ ...f, activityTypeId: e.target.value }))}
                required
              >
                <option value="">— Sélectionner —</option>
                {activityTypes.map(at => (
                  <option key={at.id} value={at.id}>{at.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Description (optionnel)</label>
              <textarea
                className="input resize-none"
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Détails sur l'activité..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Annuler
              </button>
              <button type="submit" className="btn-primary">
                {editingEntry ? 'Enregistrer' : 'Soumettre'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
