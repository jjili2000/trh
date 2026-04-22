import { useState, ReactNode, FormEvent } from 'react';
import { Plus, Edit2, Trash2, X, User, ChevronDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { User as UserType, UserRole } from '../../types';

const roleLabels: Record<UserRole, string> = {
  admin: 'Administrateur',
  manager: 'Manager',
  user: 'Utilisateur',
};

const roleBadgeColors: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  user: 'bg-gray-100 text-gray-600',
};

interface UserFormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: UserRole;
  managerId: string;
  position: string;
}

const emptyForm: UserFormData = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  role: 'user',
  managerId: '',
  position: '',
};

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

function Modal({ title, onClose, children }: ModalProps) {
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

export default function UserManagement() {
  const { users, positions, currentUser, addUser, updateUser, deleteUser } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const managers = users.filter(u => u.role === 'manager' || u.role === 'admin');

  const openAdd = () => {
    setForm(emptyForm);
    setEditingUser(null);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (user: UserType) => {
    setForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      password: user.password,
      role: user.role,
      managerId: user.managerId ?? '',
      position: user.position ?? '',
    });
    setEditingUser(user);
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.password.trim()) {
      setFormError('Tous les champs obligatoires doivent être remplis.');
      return;
    }

    const emailExists = users.some(
      u => u.email === form.email && u.id !== editingUser?.id
    );
    if (emailExists) {
      setFormError('Cet email est déjà utilisé.');
      return;
    }

    if (editingUser) {
      updateUser(editingUser.id, {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        role: form.role,
        managerId: form.managerId || undefined,
        position: form.position || undefined,
      });
    } else {
      addUser({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        role: form.role,
        managerId: form.managerId || undefined,
        position: form.position || undefined,
      });
    }

    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    if (id === currentUser?.id) return;
    deleteUser(id);
    setDeleteConfirm(null);
  };

  // Build hierarchy groups
  const topLevel = users.filter(u => !u.managerId);
  const getSubordinates = (managerId: string) =>
    users.filter(u => u.managerId === managerId);

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
                  <span>{user.firstName} {user.lastName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${roleBadgeColors[user.role]}`}>
                    {roleLabels[user.role]}
                  </span>
                </div>
                {subs.length > 0 && (
                  <div className="ml-5 mt-2 space-y-1 border-l-2 border-gray-100 pl-3">
                    {subs.map(sub => (
                      <div key={sub.id} className="flex items-center gap-2 text-sm text-gray-600">
                        <ChevronDown size={12} className="text-gray-400" />
                        {sub.firstName} {sub.lastName}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${roleBadgeColors[sub.role]}`}>
                          {roleLabels[sub.role]}
                        </span>
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
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Rôle</th>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Manager</th>
                {currentUser?.role === 'admin' && (
                  <th className="text-right px-6 py-3 font-semibold text-gray-600">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(user => {
                const manager = users.find(u => u.id === user.managerId);
                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-tennis-green flex items-center justify-center text-white text-xs font-bold">
                          {user.firstName[0]}{user.lastName[0]}
                        </div>
                        <span className="font-medium text-gray-900">
                          {user.firstName} {user.lastName}
                          {user.id === currentUser?.id && (
                            <span className="ml-2 text-xs text-gray-400">(moi)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{user.email}</td>
                    <td className="px-6 py-4 text-gray-600">{user.position ?? '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${roleBadgeColors[user.role]}`}>
                        {roleLabels[user.role]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {manager ? `${manager.firstName} ${manager.lastName}` : '—'}
                    </td>
                    {currentUser?.role === 'admin' && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(user)}
                            className="p-1.5 text-gray-400 hover:text-tennis-green hover:bg-tennis-green/10 rounded-lg transition-colors"
                          >
                            <Edit2 size={15} />
                          </button>
                          {user.id !== currentUser?.id && (
                            <button
                              onClick={() => setDeleteConfirm(user.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
                required
              />
            </div>

            <div>
              <label className="label">Mot de passe *</label>
              <input
                type="password"
                className="input"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
              />
            </div>

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

            <div>
              <label className="label">Rôle *</label>
              <select
                className="input"
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
              >
                <option value="user">Utilisateur</option>
                <option value="manager">Manager</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>

            {form.role === 'user' && (
              <div>
                <label className="label">Manager</label>
                <select
                  className="input"
                  value={form.managerId}
                  onChange={e => setForm(f => ({ ...f, managerId: e.target.value }))}
                >
                  <option value="">— Aucun —</option>
                  {managers.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.firstName} {m.lastName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                Annuler
              </button>
              <button type="submit" className="btn-primary">
                {editingUser ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </form>
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
