import { useState, useEffect, useMemo, useRef, ReactNode, FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Plus, Check, X, Clock, ChevronDown, ChevronUp, Pencil, Calendar,
  Filter, ChevronsUpDown, ChevronUp as SortAsc, ChevronDown as SortDesc, Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TimeEntry } from '../../types';
import { api } from '../../api/client';

const statusLabels: Record<string, string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  paid: 'Payée',
};

interface EntryFormData {
  date: string;
  startTime: string;
  endTime: string;
  hours: string;
  activityTypeId: string;
  description: string;
}

const timeToMins = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};
const minsToTime = (m: number): string => {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

const emptyForm: EntryFormData = {
  date: new Date().toISOString().slice(0, 10),
  startTime: '09:00',
  endTime: '10:00',
  hours: '1',
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
    bulkAddTimeEntries,
    updateTimeEntry,
    deleteTimeEntry,
    bulkDeleteTimeEntries,
    approveTimeEntry,
    rejectTimeEntry,
  } = useApp();

  // ── My entries form ──────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [form, setForm] = useState<EntryFormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [expandedSection, setExpandedSection] = useState<'mine' | 'team'>('mine');
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showCalendarEntry, setShowCalendarEntry] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);

  // ── My entries selection & delete ────────────────────────────────────────────
  const [mySelectedIds, setMySelectedIds] = useState<Set<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const toggleMySelect = (id: string) =>
    setMySelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleDeleteOne = async (entry: TimeEntry) => {
    setDeleteError(null);
    if (!confirm(`Supprimer la saisie du ${new Date(entry.date + 'T12:00:00').toLocaleDateString('fr-FR')} ?`)) return;
    try {
      await deleteTimeEntry(entry.id);
      setMySelectedIds(prev => { const n = new Set(prev); n.delete(entry.id); return n; });
    } catch (e: unknown) {
      setDeleteError((e as { message?: string }).message ?? 'Erreur lors de la suppression.');
    }
  };

  const handleDeleteSelected = async () => {
    setDeleteError(null);
    if (mySelectedIds.size === 0) return;
    if (!confirm(`Supprimer ${mySelectedIds.size} saisie(s) ?`)) return;
    const { deleted, locked } = await bulkDeleteTimeEntries(Array.from(mySelectedIds));
    setMySelectedIds(new Set());
    if (locked > 0) {
      setDeleteError(`${deleted} saisie(s) supprimée(s). ${locked} saisie(s) non supprimée(s) car prises en compte dans une paie validée.`);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setShowNewMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
    const st = entry.startTime ?? '09:00';
    const et = entry.endTime ?? minsToTime(timeToMins('09:00') + entry.hours * 60);
    setForm({
      date: entry.date,
      startTime: st,
      endTime: et,
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

    // ── Détection de chevauchement ───────────────────────────────────────────
    if (form.startTime && form.endTime) {
      const newStart = timeToMins(form.startTime);
      const newEnd   = timeToMins(form.endTime);
      if (newEnd <= newStart) { setFormError("L'heure de fin doit être postérieure à l'heure de début."); return; }

      const conflicts = myEntries.filter(e => {
        if (e.id === editingEntry?.id) return false;   // on exclut l'entrée en cours de modif
        if (e.date !== form.date) return false;
        if (!e.startTime || !e.endTime) return false;  // pas de créneau → pas de contrôle
        const eStart = timeToMins(e.startTime);
        const eEnd   = timeToMins(e.endTime);
        return newStart < eEnd && eStart < newEnd;     // chevauchement partiel ou total
      });

      if (conflicts.length > 0) {
        const at = activityTypes.find(a => a.id === conflicts[0].activityTypeId);
        setFormError(
          `Conflit de créneau : cette saisie chevauche "${at?.name ?? 'une autre activité'}" ` +
          `de ${conflicts[0].startTime} à ${conflicts[0].endTime} le ${new Date(form.date + 'T12:00:00').toLocaleDateString('fr-FR')}.`
        );
        return;
      }
    }

    const payload = {
      userId: currentUser!.id,
      date: form.date,
      hours,
      activityTypeId: form.activityTypeId,
      description: form.description || undefined,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
    };

    if (editingEntry) {
      updateTimeEntry(editingEntry.id, { ...payload, status: 'pending', validatedBy: undefined, validatedAt: undefined });
    } else {
      addTimeEntry(payload);
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
        <div className="relative" ref={newMenuRef}>
          <button onClick={() => setShowNewMenu(v => !v)} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            Nouvelle saisie
            <ChevronDown size={14} />
          </button>
          {showNewMenu && (
            <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-100 z-20 overflow-hidden">
              <button
                onClick={() => { setShowNewMenu(false); openAdd(); }}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Pencil size={15} className="text-gray-400" />
                Saisie manuelle
              </button>
              <button
                onClick={() => { setShowNewMenu(false); setShowCalendarEntry(true); }}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Calendar size={15} className="text-gray-400" />
                Saisie calendrier
              </button>
            </div>
          )}
        </div>
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
            {/* Barre d'erreur delete */}
            {deleteError && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm flex items-start gap-2">
                <span className="flex-1">{deleteError}</span>
                <button onClick={() => setDeleteError(null)} className="text-amber-500 hover:text-amber-700"><X size={14} /></button>
              </div>
            )}
            {/* Barre de sélection bulk */}
            {mySelectedIds.size > 0 && (
              <div className="mb-3 flex items-center gap-3 px-1">
                <span className="text-sm text-gray-500">{mySelectedIds.size} saisie(s) sélectionnée(s)</span>
                <button
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-lg px-2.5 py-1 transition-colors"
                  onClick={handleDeleteSelected}
                >
                  <Trash2 size={13} /> Supprimer la sélection
                </button>
                <button
                  className="text-xs text-gray-400 hover:text-gray-600"
                  onClick={() => setMySelectedIds(new Set())}
                >
                  Tout désélectionner
                </button>
              </div>
            )}
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
                      <th className="py-2 pr-3 w-8">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-tennis-green"
                          checked={myEntries.filter(e => e.status !== 'paid').length > 0 && mySelectedIds.size === myEntries.filter(e => e.status !== 'paid').length}
                          ref={el => { if (el) { const deletable = myEntries.filter(e => e.status !== 'paid'); el.indeterminate = mySelectedIds.size > 0 && mySelectedIds.size < deletable.length; } }}
                          onChange={() => { const deletable = myEntries.filter(e => e.status !== 'paid').map(e => e.id); setMySelectedIds(mySelectedIds.size === deletable.length ? new Set() : new Set(deletable)); }}
                        />
                      </th>
                      <th className="text-left py-2 pr-4 text-gray-500 font-medium">Date</th>
                      <th className="text-left py-2 pr-4 text-gray-500 font-medium">Horaires</th>
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
                      const isSelected = mySelectedIds.has(entry.id);
                      return (
                        <tr key={entry.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-red-50/40' : entry.status === 'paid' ? 'bg-blue-50/30' : ''}`}>
                          <td className="py-3 pr-3">
                            {entry.status !== 'paid' && (
                              <input
                                type="checkbox"
                                className="rounded border-gray-300 text-tennis-green"
                                checked={isSelected}
                                onChange={() => toggleMySelect(entry.id)}
                              />
                            )}
                          </td>
                          <td className="py-3 pr-4 text-gray-700 whitespace-nowrap">
                            {new Date(entry.date + 'T12:00:00').toLocaleDateString('fr-FR')}
                          </td>
                          <td className="py-3 pr-4 text-gray-500 whitespace-nowrap text-xs">
                            {entry.startTime && entry.endTime
                              ? <span className="font-mono">{entry.startTime}–{entry.endTime}</span>
                              : <span className="text-gray-300">—</span>}
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
                          <td className="py-3 pr-4 text-gray-500 max-w-xs truncate">{entry.description ?? '—'}</td>
                          <td className="py-3 pr-4">
                            <span className={`badge-${entry.status}`}>{statusLabels[entry.status]}</span>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {entry.status === 'pending' && (
                                <button onClick={() => openEdit(entry)} className="p-1.5 text-gray-400 hover:text-tennis-green hover:bg-tennis-green/10 rounded-lg transition-colors" title="Modifier">
                                  <Pencil size={14} />
                                </button>
                              )}
                              {entry.status !== 'paid' && (
                                <button
                                  onClick={() => handleDeleteOne(entry)}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Supprimer"
                                >
                                  <Trash2 size={14} />
                                </button>
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
            {/* Heure début / fin / durée — cascade automatique */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">Heure de début</label>
                <input
                  type="time"
                  className="input"
                  value={form.startTime}
                  onChange={e => {
                    const st = e.target.value;
                    if (!st) { setForm(f => ({ ...f, startTime: st })); return; }
                    const hrs = parseFloat(form.hours) || 1;
                    const et = minsToTime(timeToMins(st) + Math.round(hrs * 60));
                    setForm(f => ({ ...f, startTime: st, endTime: et }));
                  }}
                />
              </div>
              <div>
                <label className="label">Heure de fin</label>
                <input
                  type="time"
                  className="input"
                  value={form.endTime}
                  onChange={e => {
                    const et = e.target.value;
                    if (!et || !form.startTime) { setForm(f => ({ ...f, endTime: et })); return; }
                    const diff = timeToMins(et) - timeToMins(form.startTime);
                    const hrs = diff > 0 ? String(Math.round(diff / 60 * 10) / 10) : form.hours;
                    setForm(f => ({ ...f, endTime: et, hours: hrs }));
                  }}
                />
              </div>
              <div>
                <label className="label">Durée (h) *</label>
                <input
                  type="number"
                  className="input"
                  value={form.hours}
                  min="0.5"
                  max="24"
                  step="0.5"
                  placeholder="Ex: 1.5"
                  required
                  onChange={e => {
                    const hrs = e.target.value;
                    const hrsNum = parseFloat(hrs);
                    if (form.startTime && !isNaN(hrsNum) && hrsNum > 0) {
                      const et = minsToTime(timeToMins(form.startTime) + Math.round(hrsNum * 60));
                      setForm(f => ({ ...f, hours: hrs, endTime: et }));
                    } else {
                      setForm(f => ({ ...f, hours: hrs }));
                    }
                  }}
                />
              </div>
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

      {/* Calendar Entry Modal */}
      {showCalendarEntry && (
        <CalendarEntryModal
          activityTypes={activityTypes}
          currentUserId={currentUser!.id}
          onClose={() => setShowCalendarEntry(false)}
          onSubmit={async (entries) => {
            await bulkAddTimeEntries(entries);
            setShowCalendarEntry(false);
          }}
        />
      )}
    </div>
  );
}

// ── CalendarEntryModal ────────────────────────────────────────────────────────

interface CalendarSuggestion {
  date: string;
  dayLabel: string;
  courses: { label: string; startTime: string; endTime: string; courseType?: string | null }[];
  totalHours: number;
  courseType?: string | null;
}

interface CalendarRow {
  date: string;
  dayLabel: string;
  courses: { label: string; startTime: string; endTime: string; courseType?: string | null }[];
  hours: string;
  activityTypeId: string;
  included: boolean;
}

// HH:MM:SS (MySQL) → HH:MM
const fmtTime = (t: string) => t ? t.slice(0, 5) : t;

function CalendarEntryModal({
  activityTypes,
  currentUserId,
  onClose,
  onSubmit,
}: {
  activityTypes: { id: string; name: string }[];
  currentUserId: string;
  onClose: () => void;
  onSubmit: (entries: Omit<import('../../types').TimeEntry, 'id' | 'createdAt' | 'status'>[]) => Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<CalendarRow[]>([]);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Ref pour capturer la valeur courante d'activityTypes au moment où la Promise se résout
  const activityTypesRef = useRef(activityTypes);
  useEffect(() => { activityTypesRef.current = activityTypes; });

  useEffect(() => {
    const load = async () => {
      try {
        const suggestions = await api.get<CalendarSuggestion[]>('/time-entries/calendar-suggestions');
        const ats = activityTypesRef.current;
        setRows(suggestions.map(s => {
          // Correspondance insensible à la casse entre courseType (nom) et activityTypes
          const matched = s.courseType
            ? ats.find(at => at.name.trim().toLowerCase() === s.courseType!.trim().toLowerCase())
            : null;
          return {
            date: s.date,
            dayLabel: s.dayLabel,
            courses: s.courses,
            hours: String(s.totalHours),
            activityTypeId: matched?.id ?? '',
            included: true,
          };
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur lors du chargement des suggestions');
      } finally {
        setLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Exécuté une seule fois ; activityTypes est lu via ref

  const includedRows = rows.filter(r => r.included);
  const totalIncludedHours = includedRows.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0);

  const handleSubmit = async () => {
    setSubmitError('');
    const missing = includedRows.find(r => !r.activityTypeId);
    if (missing) {
      setSubmitError(`Veuillez sélectionner un type d'activité pour ${missing.dayLabel}.`);
      return;
    }
    if (includedRows.length === 0) {
      setSubmitError('Aucune saisie sélectionnée.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(
        includedRows.map(r => ({
          userId: currentUserId,
          date: r.date,
          hours: parseFloat(r.hours),
          activityTypeId: r.activityTypeId,
          description: undefined,
        }))
      );
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erreur lors de la soumission');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-tennis-green" />
            <h2 className="font-semibold text-gray-900">Saisie calendrier</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-tennis-green border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Calendar size={36} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium text-gray-500">Aucune journée à saisir</p>
              <p className="text-sm mt-1">Toutes vos journées planifiées ont déjà été saisies, ou aucun cours n'est planifié dans cette période.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="py-2 pr-3 w-8" />
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Jour</th>
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Cours</th>
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium w-24">Heures</th>
                    <th className="text-left py-2 text-gray-500 font-medium">Type d'activité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row, i) => (
                    <tr key={row.date} className={`${!row.included ? 'opacity-40' : ''} hover:bg-gray-50`}>
                      <td className="py-3 pr-3">
                        <input
                          type="checkbox"
                          checked={row.included}
                          onChange={() => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, included: !r.included } : r))}
                          className="rounded border-gray-300 text-tennis-green"
                        />
                      </td>
                      <td className="py-3 pr-4 font-semibold text-gray-800 whitespace-nowrap">{row.dayLabel}</td>
                      <td className="py-3 pr-4">
                        <div className="space-y-0.5">
                          {row.courses.map((c, ci) => (
                            <p key={ci} className="text-xs text-gray-500">{c.label} {fmtTime(c.startTime)}–{fmtTime(c.endTime)}</p>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          max="24"
                          value={row.hours}
                          onChange={e => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, hours: e.target.value } : r))}
                          className="input text-sm py-1 w-20"
                          disabled={!row.included}
                        />
                      </td>
                      <td className="py-3">
                        <select
                          value={row.activityTypeId}
                          onChange={e => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, activityTypeId: e.target.value } : r))}
                          className="input text-sm py-1"
                          disabled={!row.included}
                          required={row.included}
                        >
                          <option value="">— Sélectionner —</option>
                          {activityTypes.map(at => (
                            <option key={at.id} value={at.id}>{at.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && !error && rows.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
            {submitError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{submitError}</div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Total : <span className="font-semibold text-gray-800">{totalIncludedHours.toFixed(1)}h</span> sur {includedRows.length} saisie(s)
              </p>
              <div className="flex items-center gap-3">
                <button onClick={onClose} className="btn-secondary text-sm">Annuler</button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || includedRows.length === 0}
                  className="btn-primary text-sm flex items-center gap-2 disabled:opacity-60"
                >
                  {submitting && <div className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />}
                  Valider {includedRows.length} saisie(s)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
