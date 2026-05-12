import { useState, useEffect, useMemo, ReactNode, FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Plus, Check, X, Clock, ChevronDown, ChevronUp, Pencil,
  Filter, ChevronsUpDown, ChevronUp as SortAsc, ChevronDown as SortDesc,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TimeEntry } from '../../types';

const statusLabels: Record<string, string> = {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
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

type SortField = 'date' | 'user' | 'hours' | 'status' | 'activity';
type SortDir = 'asc' | 'desc';

export default function TimeTracking() {
  const location = useLocation();
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

  // ── My entries form ──────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [form, setForm] = useState<EntryFormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [expandedSection, setExpandedSection] = useState<'mine' | 'team'>('mine');

  // ── Team filters & sort ──────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterActivityId, setFilterActivityId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // ── Selection ────────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // ── Location state ───────────────────────────────────────────────────────────
  useEffect(() => {
    const state = location.state as { openForm?: boolean; showTeam?: boolean } | null;
    if (state?.openForm) {
      setShowForm(true);
      window.history.replaceState({}, '');
    }
    if (state?.showTeam) {
      setExpandedSection('team');
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  const isAdmin = currentUser?.role === 'admin';
  const subordinateIds = isAdmin
    ? users.map(u => u.id).filter(id => id !== currentUser?.id)
    : users.filter(u => u.managerId === currentUser?.id).map(u => u.id);
  const isManagerOrAdmin = isAdmin || subordinateIds.length > 0;

  // ── My entries ───────────────────────────────────────────────────────────────
  const myEntries = timeEntries
    .filter(e => e.userId === currentUser?.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const teamEntries = timeEntries.filter(e => subordinateIds.includes(e.userId));
  const pendingTeamEntries = teamEntries.filter(e => e.status === 'pending');

  // ── Filtered + sorted team entries ──────────────────────────────────────────
  const filteredTeamEntries = useMemo(() => {
    let list = [...teamEntries];

    if (filterStatus)       list = list.filter(e => e.status === filterStatus);
    if (filterUserId)       list = list.filter(e => e.userId === filterUserId);
    if (filterActivityId)   list = list.filter(e => e.activityTypeId === filterActivityId);
    if (filterDateFrom)     list = list.filter(e => e.date >= filterDateFrom);
    if (filterDateTo)       list = list.filter(e => e.date <= filterDateTo);

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') {
        cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortField === 'user') {
        const ua = users.find(u => u.id === a.userId);
        const ub = users.find(u => u.id === b.userId);
        cmp = `${ua?.lastName}${ua?.firstName}`.localeCompare(`${ub?.lastName}${ub?.firstName}`);
      } else if (sortField === 'hours') {
        cmp = a.hours - b.hours;
      } else if (sortField === 'status') {
        cmp = a.status.localeCompare(b.status);
      } else if (sortField === 'activity') {
        const aa = activityTypes.find(t => t.id === a.activityTypeId)?.name ?? '';
        const ab = activityTypes.find(t => t.id === b.activityTypeId)?.name ?? '';
        cmp = aa.localeCompare(ab);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [teamEntries, filterStatus, filterUserId, filterActivityId, filterDateFrom, filterDateTo, sortField, sortDir, users, activityTypes]);

  // Pending entries visible in the current filtered view (for select-all)
  const visiblePendingIds = useMemo(
    () => filteredTeamEntries.filter(e => e.status === 'pending').map(e => e.id),
    [filteredTeamEntries]
  );

  const allPendingSelected =
    visiblePendingIds.length > 0 && visiblePendingIds.every(id => selectedIds.has(id));
  const somePendingSelected = visiblePendingIds.some(id => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visiblePendingIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => new Set([...prev, ...visiblePendingIds]));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkApprove = async () => {
    setBulkLoading(true);
    for (const id of selectedIds) await approveTimeEntry(id);
    setSelectedIds(new Set());
    setBulkLoading(false);
  };

  const handleBulkReject = async () => {
    setBulkLoading(true);
    for (const id of selectedIds) await rejectTimeEntry(id);
    setSelectedIds(new Set());
    setBulkLoading(false);
  };

  // ── Sort helper ──────────────────────────────────────────────────────────────
  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown size={13} className="text-gray-400 inline ml-1" />;
    return sortDir === 'asc'
      ? <SortAsc size={13} className="text-tennis-green inline ml-1" />
      : <SortDesc size={13} className="text-tennis-green inline ml-1" />;
  };

  // ── Form handlers ─────────────────────────────────────────────────────────────
  const openAdd = () => { setForm(emptyForm); setEditingEntry(null); setFormError(''); setShowForm(true); };

  const openEdit = (entry: TimeEntry) => {
    setForm({ date: entry.date, hours: String(entry.hours), activityTypeId: entry.activityTypeId, description: entry.description ?? '' });
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
      updateTimeEntry(editingEntry.id, { date: form.date, hours, activityTypeId: form.activityTypeId, description: form.description || undefined, status: 'pending', validatedBy: undefined, validatedAt: undefined });
    } else {
      addTimeEntry({ userId: currentUser!.id, date: form.date, hours, activityTypeId: form.activityTypeId, description: form.description || undefined });
    }
    setShowForm(false);
  };

  const getUser = (userId: string) => users.find(u => u.id === userId);
  const getActivityType = (atId: string) => activityTypes.find(a => a.id === atId);

  const totalHoursThisMonth = myEntries
    .filter(e => { const d = new Date(e.date); const now = new Date(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
    .reduce((sum, e) => sum + e.hours, 0);

  // Subordinates list for the employee filter
  const subordinates = users.filter(u => subordinateIds.includes(u.id))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));

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
          <p className="text-3xl font-bold text-yellow-500">{myEntries.filter(e => e.status === 'pending').length}</p>
          <p className="text-sm text-gray-500 mt-1">En attente</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-500">{myEntries.filter(e => e.status === 'approved').length}</p>
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
                          <td className="py-3 pr-4 text-gray-700">{new Date(entry.date).toLocaleDateString('fr-FR')}</td>
                          <td className="py-3 pr-4 font-semibold text-tennis-green">{entry.hours}h</td>
                          <td className="py-3 pr-4">
                            {at && (
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: at.color }} />
                                <span className="text-gray-700">{at.name}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-gray-500 max-w-xs truncate">{entry.description ?? '—'}</td>
                          <td className="py-3 pr-4">
                            <span className={`badge-${entry.status}`}>{statusLabels[entry.status]}</span>
                          </td>
                          <td className="py-3 text-right">
                            {entry.status === 'pending' && (
                              <button onClick={() => openEdit(entry)} className="p-1.5 text-gray-400 hover:text-tennis-green hover:bg-tennis-green/10 rounded-lg transition-colors">
                                <Pencil size={14} />
                              </button>
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
          {/* Section header */}
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

              {/* Filter bar toggle */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setShowFilters(v => !v)}
                  className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${showFilters ? 'bg-tennis-green/10 border-tennis-green/30 text-tennis-green' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                >
                  <Filter size={14} />
                  Filtres
                  {(filterStatus !== 'pending' || filterUserId || filterActivityId || filterDateFrom || filterDateTo) && (
                    <span className="w-2 h-2 rounded-full bg-tennis-green" />
                  )}
                </button>
                <span className="text-xs text-gray-400">{filteredTeamEntries.length} résultat(s)</span>
              </div>

              {/* Filters panel */}
              {showFilters && (
                <div className="mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Statut</label>
                    <select className="input text-sm py-1.5" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setSelectedIds(new Set()); }}>
                      <option value="">Tous</option>
                      <option value="pending">En attente</option>
                      <option value="approved">Approuvé</option>
                      <option value="rejected">Rejeté</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Employé</label>
                    <select className="input text-sm py-1.5" value={filterUserId} onChange={e => setFilterUserId(e.target.value)}>
                      <option value="">Tous</option>
                      {subordinates.map(u => (
                        <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Type d'activité</label>
                    <select className="input text-sm py-1.5" value={filterActivityId} onChange={e => setFilterActivityId(e.target.value)}>
                      <option value="">Tous</option>
                      {activityTypes.map(at => (
                        <option key={at.id} value={at.id}>{at.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Du</label>
                    <input type="date" className="input text-sm py-1.5" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Au</label>
                    <input type="date" className="input text-sm py-1.5" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
                  </div>
                  <div className="col-span-full flex justify-end">
                    <button
                      onClick={() => { setFilterStatus('pending'); setFilterUserId(''); setFilterActivityId(''); setFilterDateFrom(''); setFilterDateTo(''); setSelectedIds(new Set()); }}
                      className="text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      Réinitialiser les filtres
                    </button>
                  </div>
                </div>
              )}

              {/* Bulk action bar */}
              {selectedIds.size > 0 && (
                <div className="mb-3 flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <span className="text-sm text-blue-800 font-medium flex-1">
                    {selectedIds.size} saisie(s) sélectionnée(s)
                  </span>
                  <button
                    onClick={handleBulkApprove}
                    disabled={bulkLoading}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-60 transition-colors"
                  >
                    <Check size={14} />
                    Approuver
                  </button>
                  <button
                    onClick={handleBulkReject}
                    disabled={bulkLoading}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 disabled:opacity-60 transition-colors"
                  >
                    <X size={14} />
                    Rejeter
                  </button>
                  <button onClick={() => setSelectedIds(new Set())} className="text-xs text-blue-500 hover:underline">
                    Désélectionner
                  </button>
                </div>
              )}

              {filteredTeamEntries.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p>Aucune saisie ne correspond aux filtres.</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {/* Select-all checkbox — only for pending entries */}
                        <th className="py-2 pr-3 w-8">
                          {visiblePendingIds.length > 0 && (
                            <input
                              type="checkbox"
                              checked={allPendingSelected}
                              ref={el => { if (el) el.indeterminate = somePendingSelected && !allPendingSelected; }}
                              onChange={toggleSelectAll}
                              className="rounded border-gray-300 text-tennis-green"
                            />
                          )}
                        </th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium cursor-pointer select-none" onClick={() => handleSort('user')}>
                          Employé <SortIcon field="user" />
                        </th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium cursor-pointer select-none" onClick={() => handleSort('date')}>
                          Date <SortIcon field="date" />
                        </th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium cursor-pointer select-none" onClick={() => handleSort('hours')}>
                          Heures <SortIcon field="hours" />
                        </th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium cursor-pointer select-none" onClick={() => handleSort('activity')}>
                          Type <SortIcon field="activity" />
                        </th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Description</th>
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium cursor-pointer select-none" onClick={() => handleSort('status')}>
                          Statut <SortIcon field="status" />
                        </th>
                        <th className="text-right py-2 text-gray-500 font-medium">Validation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredTeamEntries.map(entry => {
                        const user = getUser(entry.userId);
                        const at = getActivityType(entry.activityTypeId);
                        const isPending = entry.status === 'pending';
                        const isSelected = selectedIds.has(entry.id);
                        return (
                          <tr
                            key={entry.id}
                            className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50/60' : isPending ? 'bg-yellow-50/40' : ''}`}
                          >
                            <td className="py-3 pr-3">
                              {isPending && (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelect(entry.id)}
                                  className="rounded border-gray-300 text-tennis-green"
                                />
                              )}
                            </td>
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-tennis-green flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                  {user?.firstName[0]}{user?.lastName[0]}
                                </div>
                                <span className="text-gray-700 font-medium">{user?.firstName} {user?.lastName}</span>
                              </div>
                            </td>
                            <td className="py-3 pr-4 text-gray-700 whitespace-nowrap">
                              {new Date(entry.date).toLocaleDateString('fr-FR')}
                            </td>
                            <td className="py-3 pr-4 font-semibold text-tennis-green">{entry.hours}h</td>
                            <td className="py-3 pr-4">
                              {at && (
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: at.color }} />
                                  <span className="text-gray-700">{at.name}</span>
                                </div>
                              )}
                            </td>
                            <td className="py-3 pr-4 text-gray-500 max-w-[180px] truncate">
                              {entry.description ?? '—'}
                            </td>
                            <td className="py-3 pr-4">
                              <span className={`badge-${entry.status}`}>{statusLabels[entry.status]}</span>
                            </td>
                            <td className="py-3 text-right">
                              {isPending && (
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
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{formError}</div>
            )}
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" value={form.date} max={new Date().toISOString().slice(0, 10)} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Nombre d'heures *</label>
              <input type="number" className="input" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} min="0.5" max="24" step="0.5" placeholder="Ex: 7.5" required />
            </div>
            <div>
              <label className="label">Type d'activité *</label>
              <select className="input" value={form.activityTypeId} onChange={e => setForm(f => ({ ...f, activityTypeId: e.target.value }))} required>
                <option value="">— Sélectionner —</option>
                {activityTypes.map(at => (
                  <option key={at.id} value={at.id}>{at.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Description (optionnel)</label>
              <textarea className="input resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Détails sur l'activité..." />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Annuler</button>
              <button type="submit" className="btn-primary">{editingEntry ? 'Enregistrer' : 'Soumettre'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
