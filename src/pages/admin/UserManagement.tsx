import { useState, ReactNode, FormEvent } from 'react';
import { Plus, Edit2, Trash2, X, User, ChevronDown, KeyRound, Ban, CheckCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { User as UserType, UserRole } from '../../types';
import { api } from '../../api/client';

const typeLabels: Record<string, string> = {
  admin: 'Administrateur',
  treasurer: 'Trésorier',
  user: 'Utilisateur',
  // legacy
  manager: 'Utilisateur',
};

const typeBadgeColors: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  treasurer: 'bg-amber-100 text-amber-700',
  user: 'bg-gray-100 text-gray-600',
  manager: 'bg-gray-100 text-gray-600',
};

const ALL_MODULES = [
  { key: 'time',       label: 'Saisie des temps' },
  { key: 'absences',   label: 'Absences' },
  { key: 'expenses',   label: 'Notes de frais' },
  { key: 'documents',  label: 'Documents' },
  { key: 'budget',     label: 'Budget' },
  { key: 'accounting', label: 'Comptabilité' },
  { key: 'seasons',    label: 'Calendrier saisonnier' },
  { key: 'payroll',    label: 'Paie' },
];

const DEFAULT_MODULES = ['time', 'absences', 'expenses', 'documents'];

interface UserFormData {
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  managerId: string;
  position: string;
  departmentId: string;
  moduleAccess: string[];
}

const emptyForm: UserFormData = {
  firstName: '',
  lastName: '',
  email: '',
  role: 'user',
  managerId: '',
  position: '',
  departmentId: '',
  moduleAccess: DEFAULT_MODULES,
};

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
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

export default function UserManagement() {
  const { users, positions, departments, currentUser, addUser, updateUser, deleteUser } = useApp();

  // Edit/Add modal
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [formError, setFormError] = useState('');

  // Password modal (new user creation or reset)
  const [passwordModal, setPasswordModal] = useState<{ userId: string; userName: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Add modal — separate password field only for new user
  const [createPassword, setCreatePassword] = useState('');

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // A "manager" is any user who has subordinates
  const isUserManager = (userId: string) => users.some(u => u.managerId === userId);

  const openAdd = () => {
    setForm(emptyForm);
    setCreatePassword('');
    setEditingUser(null);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (user: UserType) => {
    setForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: (['admin', 'treasurer'].includes(user.role) ? user.role : 'user') as UserRole,
      managerId: user.managerId ?? '',
      position: user.position ?? '',
      departmentId: user.departmentId ?? '',
      moduleAccess: user.moduleAccess ?? DEFAULT_MODULES,
    });
    setEditingUser(user);
    setFormError('');
    setShowModal(true);
  };

  const toggleModule = (mod: string) => {
    setForm(f => ({
      ...f,
      moduleAccess: f.moduleAccess.includes(mod)
        ? f.moduleAccess.filter(m => m !== mod)
        : [...f.moduleAccess, mod],
    }));
  };

  const [formSaving, setFormSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setFormError('Tous les champs obligatoires doivent être remplis.');
      return;
    }

    if (!editingUser && !createPassword.trim()) {
      setFormError('Le mot de passe est obligatoire pour un nouvel utilisateur.');
      return;
    }

    const emailNorm = form.email.trim().toLowerCase();
    const emailExists = users.some(u => u.email.toLowerCase() === emailNorm && u.id !== editingUser?.id);
    if (emailExists) {
      setFormError('Cet email est déjà utilisé.');
      return;
    }

    setFormSaving(true);
    try {
      if (editingUser) {
        const payload: Partial<UserType> = {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email.trim(),
          role: form.role,
          managerId: form.managerId || undefined,
          position: form.position || undefined,
          departmentId: form.departmentId || null,
          moduleAccess: form.role === 'admin' ? undefined : form.moduleAccess,
        };
        await updateUser(editingUser.id, payload);
      } else {
        const payload: Omit<UserType, 'id' | 'createdAt'> = {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email.trim(),
          password: createPassword,
          role: form.role,
          managerId: form.managerId || undefined,
          position: form.position || undefined,
          departmentId: form.departmentId || null,
          moduleAccess: form.role === 'admin' ? undefined : form.moduleAccess,
        };
        await addUser(payload);
      }
      setShowModal(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.');
    } finally {
      setFormSaving(false);
    }
  };

  const openResetPassword = (user: UserType) => {
    setPasswordModal({ userId: user.id, userName: `${user.firstName} ${user.lastName}` });
    setNewPassword('');
    setPasswordError('');
    setPasswordSuccess(false);
  };

  const handleResetPassword = async () => {
    if (!passwordModal) return;
    if (newPassword.length < 6) {
      setPasswordError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    setSavingPassword(true);
    setPasswordError('');
    try {
      await api.put(`/users/${passwordModal.userId}/reset-password`, { password: newPassword });
      setPasswordSuccess(true);
      setTimeout(() => setPasswordModal(null), 1500);
    } catch {
      setPasswordError('Erreur lors de la réinitialisation.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleToggleBlocked = async (user: UserType) => {
    const newBlocked = !user.blocked;
    const label = newBlocked ? 'bloquer' : 'débloquer';
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} ${user.firstName} ${user.lastName} ?`)) return;
    try {
      await api.put(`/users/${user.id}/blocked`, { blocked: newBlocked });
      updateUser(user.id, { blocked: newBlocked });
    } catch {
      // silent
    }
  };

  const handleDelete = (id: string) => {
    if (id === currentUser?.id) return;
    deleteUser(id);
    setDeleteConfirm(null);
  };

  // Build hierarchy groups
  const topLevel = users.filter(u => !u.managerId);
  const getSubordinates = (managerId: string) => users.filter(u => u.managerId === managerId);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-semibold text-gray-800">Tous les utilisateurs</h2>
          <p className="text-sm text-gray-400">{users.length} membre(s)</p>
        </div>
        {currentUser?.role === 'admin' && (
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            Ajouter un utilisateur
          </button>
        )}
      </div>

      {/* Hierarchy view */}
      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wider">Hiérarchie</h3>
        <div className="space-y-3">
          {topLevel.map(user => {
            const subs = getSubordinates(user.id);
            return (
              <div key={user.id}>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <User size={14} className="text-tennis-green" />
                  <span className={user.blocked ? 'line-through text-gray-400' : ''}>{user.firstName} {user.lastName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${typeBadgeColors[user.role]}`}>
                    {typeLabels[user.role]}
                  </span>
                  {user.blocked && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">Bloqué</span>
                  )}
                  {user.position && (
                    <span className="text-xs text-gray-400">— {user.position}</span>
                  )}
                </div>
                {subs.length > 0 && (
                  <div className="ml-5 mt-2 space-y-1 border-l-2 border-gray-100 pl-3">
                    {subs.map(sub => (
                      <div key={sub.id} className="flex items-center gap-2 text-sm text-gray-600">
                        <ChevronDown size={12} className="text-gray-400" />
                        <span className={sub.blocked ? 'line-through text-gray-400' : ''}>{sub.firstName} {sub.lastName}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${typeBadgeColors[sub.role]}`}>
                          {typeLabels[sub.role]}
                        </span>
                        {sub.blocked && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">Bloqué</span>
                        )}
                        {sub.position && (
                          <span className="text-xs text-gray-400">— {sub.position}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Users table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Nom</th>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Email</th>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Poste</th>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Type d'utilisateur</th>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Responsable</th>
                {currentUser?.role === 'admin' && (
                  <th className="text-left px-6 py-3 font-semibold text-gray-600">Dernière connexion</th>
                )}
                {currentUser?.role === 'admin' && (
                  <th className="text-right px-6 py-3 font-semibold text-gray-600">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(user => {
                const manager = users.find(u => u.id === user.managerId);
                return (
                  <tr key={user.id} className={`hover:bg-gray-50 ${user.blocked ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${user.blocked ? 'bg-gray-400' : 'bg-tennis-green'}`}>
                          {user.firstName[0]}{user.lastName[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${user.blocked ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                              {user.firstName} {user.lastName}
                              {user.id === currentUser?.id && (
                                <span className="ml-2 text-xs text-gray-400 no-underline" style={{ textDecoration: 'none' }}>(moi)</span>
                              )}
                            </span>
                            {user.blocked && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-normal" style={{ textDecoration: 'none' }}>
                                Bloqué
                              </span>
                            )}
                          </div>
                          {isUserManager(user.id) && (
                            <p className="text-xs text-tennis-green">Responsable d'équipe</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{user.email}</td>
                    <td className="px-6 py-4 text-gray-600">{user.position ?? '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${typeBadgeColors[user.role]}`}>
                        {typeLabels[user.role]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {manager ? `${manager.firstName} ${manager.lastName}` : '—'}
                    </td>
                    {currentUser?.role === 'admin' && (
                      <td className="px-6 py-4 text-gray-500 whitespace-nowrap text-sm">
                        {user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleString('fr-FR', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })
                          : <span className="text-gray-300 text-xs">Jamais connecté</span>
                        }
                      </td>
                    )}
                    {currentUser?.role === 'admin' && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Edit */}
                          <button
                            onClick={() => openEdit(user)}
                            className="p-1.5 text-gray-400 hover:text-tennis-green hover:bg-tennis-green/10 rounded-lg transition-colors"
                            title="Modifier"
                          >
                            <Edit2 size={15} />
                          </button>
                          {/* Reset password */}
                          <button
                            onClick={() => openResetPassword(user)}
                            className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Réinitialiser le mot de passe"
                          >
                            <KeyRound size={15} />
                          </button>
                          {/* Block / Unblock */}
                          {user.id !== currentUser?.id && (
                            <button
                              onClick={() => handleToggleBlocked(user)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                user.blocked
                                  ? 'text-green-500 hover:text-green-700 hover:bg-green-50'
                                  : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'
                              }`}
                              title={user.blocked ? 'Débloquer' : 'Bloquer'}
                            >
                              {user.blocked ? <CheckCircle size={15} /> : <Ban size={15} />}
                            </button>
                          )}
                          {/* Delete — interdit sur les comptes admin */}
                          {user.id !== currentUser?.id && user.role !== 'admin' && (
                            <button
                              onClick={() => setDeleteConfirm(user.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal
          title={editingUser ? 'Modifier un utilisateur' : 'Ajouter un utilisateur'}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Prénom *</label>
                <input
                  className="input"
                  value={form.firstName}
                  onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label">Nom *</label>
                <input
                  className="input"
                  value={form.lastName}
                  onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">Email *</label>
              <input
                type="email"
                className="input"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                autoComplete="off"
                required
              />
            </div>

            {/* Mot de passe uniquement pour la création */}
            {!editingUser && (
              <div>
                <label className="label">Mot de passe *</label>
                <input
                  type="password"
                  className="input"
                  value={createPassword}
                  onChange={e => setCreatePassword(e.target.value)}
                  placeholder="Au moins 6 caractères"
                  autoComplete="new-password"
                  required
                />
              </div>
            )}

            <div>
              <label className="label">Poste</label>
              <select
                className="input"
                value={form.position}
                onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
              >
                <option value="">— Aucun —</option>
                {positions.map(p => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>

            {departments.length > 0 && (
              <div>
                <label className="label">Direction</label>
                <select
                  className="input"
                  value={form.departmentId}
                  onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}
                >
                  <option value="">— Aucune —</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="label">Type d'utilisateur *</label>
              <select
                className="input"
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
              >
                <option value="user">Utilisateur</option>
                <option value="treasurer">Trésorier</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>

            <div>
              <label className="label">Responsable</label>
              <select
                className="input"
                value={form.managerId}
                onChange={e => setForm(f => ({ ...f, managerId: e.target.value }))}
              >
                <option value="">— Aucun —</option>
                {users.filter(u => u.id !== editingUser?.id).map(m => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName}
                  </option>
                ))}
              </select>
            </div>

            {/* Module access — hidden for admin */}
            {form.role !== 'admin' && (
              <div>
                <label className="label">Accès aux modules</label>
                <div className="mt-2 space-y-2">
                  {ALL_MODULES.map(mod => (
                    <label key={mod.key} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-tennis-green rounded border-gray-300"
                        checked={form.moduleAccess.includes(mod.key)}
                        onChange={() => toggleModule(mod.key)}
                      />
                      <span className="text-sm text-gray-700">{mod.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" disabled={formSaving}>
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={formSaving}>
                {formSaving ? 'Enregistrement…' : editingUser ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Reset Password Modal */}
      {passwordModal && (
        <Modal title="Réinitialiser le mot de passe" onClose={() => setPasswordModal(null)}>
          <p className="text-sm text-gray-600 mb-4">
            Définir un nouveau mot de passe pour <strong>{passwordModal.userName}</strong>.
          </p>
          {passwordSuccess ? (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm text-center">
              ✓ Mot de passe réinitialisé avec succès
            </div>
          ) : (
            <>
              {passwordError && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {passwordError}
                </div>
              )}
              <div className="mb-4">
                <label className="label">Nouveau mot de passe *</label>
                <input
                  type="password"
                  className="input"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Au moins 6 caractères"
                  autoComplete="new-password"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setPasswordModal(null)} className="btn-secondary">
                  Annuler
                </button>
                <button
                  onClick={handleResetPassword}
                  className="btn-primary flex items-center gap-2"
                  disabled={savingPassword}
                >
                  <KeyRound size={15} />
                  {savingPassword ? 'Enregistrement…' : 'Réinitialiser'}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <Modal title="Confirmer la suppression" onClose={() => setDeleteConfirm(null)}>
          <p className="text-gray-600 mb-6">
            Êtes-vous sûr de vouloir supprimer cet utilisateur ? Cette action est irréversible.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">Annuler</button>
            <button onClick={() => handleDelete(deleteConfirm)} className="btn-danger">Supprimer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
