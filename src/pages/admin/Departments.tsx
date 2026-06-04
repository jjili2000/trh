import { useState, FormEvent } from 'react';
import { Plus, Edit2, Trash2, X, ChevronRight, UserPlus, User as UserIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Department, User } from '../../types';
import { api } from '../../api/client';

interface FormData {
  name: string;
  parentId: string;
  directorId: string;
}

interface NewUserForm {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

const emptyForm: FormData = { name: '', parentId: '', directorId: '' };
const emptyUserForm: NewUserForm = { firstName: '', lastName: '', email: '', password: '' };

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}

function Modal({ title, onClose, children, wide }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto ${wide ? 'max-w-lg' : 'max-w-md'}`}>
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

export default function Departments() {
  const { departments, users, currentUser, addDepartment, updateDepartment, deleteDepartment, addUser } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  // New-user sub-modal
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState<NewUserForm>(emptyUserForm);
  const [newUserError, setNewUserError] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  const openAdd = () => {
    setForm(emptyForm);
    setEditing(null);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (d: Department) => {
    setForm({ name: d.name, parentId: d.parentId ?? '', directorId: d.directorId ?? '' });
    setEditing(d);
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) { setFormError('Le nom est obligatoire.'); return; }

    const nameExists = departments.some(
      d => d.name.toLowerCase() === form.name.trim().toLowerCase() && d.id !== editing?.id
    );
    if (nameExists) { setFormError('Ce nom de direction existe déjà.'); return; }

    const payload = {
      name: form.name.trim(),
      parentId: form.parentId || null,
      directorId: form.directorId || null,
    };

    if (editing) {
      await updateDepartment(editing.id, payload);
    } else {
      await addDepartment(payload);
    }
    setShowModal(false);
  };

  const handleDelete = async (id: string) => {
    await deleteDepartment(id);
    setDeleteConfirm(null);
  };

  // Create user on the fly and auto-select as director
  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setNewUserError('');
    if (!newUserForm.firstName.trim() || !newUserForm.lastName.trim() || !newUserForm.email.trim()) {
      setNewUserError('Prénom, nom et email sont obligatoires.');
      return;
    }
    if (newUserForm.password.length < 6) {
      setNewUserError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    const emailNorm = newUserForm.email.trim().toLowerCase();
    const emailExists = users.some(u => u.email.toLowerCase() === emailNorm);
    if (emailExists) {
      setNewUserError('Cet email est déjà utilisé.');
      return;
    }
    setCreatingUser(true);
    try {
      // addUser creates the user AND refreshes the users state in context
      await addUser({
        firstName: newUserForm.firstName.trim(),
        lastName: newUserForm.lastName.trim(),
        email: newUserForm.email.trim(),
        password: newUserForm.password,
        role: 'user',
        moduleAccess: ['time', 'absences', 'expenses', 'documents'],
      });
      // Fetch fresh list to get the new user's id (addUser doesn't return it)
      const freshUsers = await api.get<User[]>('/users');
      const newUser = freshUsers.find(u => u.email.toLowerCase() === emailNorm);
      if (newUser) {
        setForm(f => ({ ...f, directorId: newUser.id }));
      }
      setShowNewUser(false);
      setNewUserForm(emptyUserForm);
    } catch (err: unknown) {
      setNewUserError(err instanceof Error ? err.message : "Erreur lors de la création de l'utilisateur.");
    } finally {
      setCreatingUser(false);
    }
  };

  // For parent selector: exclude current and its descendants
  const getDescendants = (id: string): string[] => {
    const kids = departments.filter(d => d.parentId === id);
    return [id, ...kids.flatMap(k => getDescendants(k.id))];
  };
  const excludedIds = editing ? getDescendants(editing.id) : [];
  const parentOptions = departments.filter(d => !excludedIds.includes(d.id));

  // Build tree view
  const topLevel = departments.filter(d => !d.parentId);
  const children = (parentId: string) => departments.filter(d => d.parentId === parentId);

  const userName = (id: string | null) => {
    if (!id) return null;
    const u = users.find(u => u.id === id);
    return u ? `${u.firstName} ${u.lastName}` : null;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-semibold text-gray-800">Directions</h2>
          <p className="text-sm text-gray-400">{departments.length} direction(s) configurée(s)</p>
        </div>
        {isAdmin && (
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            Ajouter
          </button>
        )}
      </div>

      {departments.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          Aucune direction configurée.
        </div>
      ) : (
        <div className="card space-y-2">
          {topLevel.map(dept => {
            const kids = children(dept.id);
            const dirName = userName(dept.directorId);
            return (
              <div key={dept.id}>
                <div className="flex items-center gap-3 py-2 px-1 rounded-lg hover:bg-gray-50 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800">{dept.name}</span>
                      {kids.length > 0 && (
                        <span className="text-xs text-gray-400">({kids.length} sous-direction{kids.length > 1 ? 's' : ''})</span>
                      )}
                    </div>
                    {dirName && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <UserIcon size={11} className="text-tennis-green" />
                        <span className="text-xs text-tennis-green">{dirName}</span>
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(dept)}
                        className="p-1.5 text-gray-400 hover:text-tennis-green hover:bg-tennis-green/10 rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(dept.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {kids.length > 0 && (
                  <div className="ml-4 border-l-2 border-gray-100 pl-3 space-y-1">
                    {kids.map(kid => {
                      const kidDirName = userName(kid.directorId);
                      return (
                        <div key={kid.id} className="flex items-center gap-3 py-1.5 px-1 rounded-lg hover:bg-gray-50 group">
                          <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-gray-700">{kid.name}</span>
                            {kidDirName && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <UserIcon size={10} className="text-tennis-green" />
                                <span className="text-xs text-tennis-green">{kidDirName}</span>
                              </div>
                            )}
                          </div>
                          {isAdmin && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => openEdit(kid)}
                                className="p-1.5 text-gray-400 hover:text-tennis-green hover:bg-tennis-green/10 rounded-lg transition-colors"
                                title="Modifier"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(kid.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Supprimer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal
          title={editing ? 'Modifier la direction' : 'Nouvelle direction'}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {formError}
              </div>
            )}
            <div>
              <label className="label">Nom *</label>
              <input
                className="input"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Tennis adultes"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="label">Direction parente</label>
              <select
                className="input"
                value={form.parentId}
                onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))}
              >
                <option value="">— Aucune (direction principale) —</option>
                {parentOptions.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {/* Director */}
            <div>
              <label className="label">Directeur</label>
              <div className="flex gap-2">
                <select
                  className="input flex-1"
                  value={form.directorId}
                  onChange={e => setForm(f => ({ ...f, directorId: e.target.value }))}
                >
                  <option value="">— Aucun —</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => { setNewUserForm(emptyUserForm); setNewUserError(''); setShowNewUser(true); }}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-tennis-green border border-tennis-green/30 rounded-lg hover:bg-tennis-green/5 transition-colors whitespace-nowrap"
                  title="Créer un nouvel utilisateur"
                >
                  <UserPlus size={15} />
                  Nouvel utilisateur
                </button>
              </div>
              {form.directorId && (() => {
                const u = users.find(u => u.id === form.directorId);
                return u ? (
                  <p className="text-xs text-tennis-green mt-1.5 flex items-center gap-1">
                    <UserIcon size={11} /> {u.firstName} {u.lastName} — {u.email}
                  </p>
                ) : null;
              })()}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                Annuler
              </button>
              <button type="submit" className="btn-primary">
                {editing ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* New User sub-modal */}
      {showNewUser && (
        <Modal
          title="Créer un utilisateur"
          onClose={() => setShowNewUser(false)}
          wide
        >
          <form onSubmit={handleCreateUser} className="space-y-4">
            <p className="text-sm text-gray-500">
              Le nouvel utilisateur sera automatiquement sélectionné comme directeur.
            </p>
            {newUserError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {newUserError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Prénom *</label>
                <input
                  className="input"
                  value={newUserForm.firstName}
                  onChange={e => setNewUserForm(f => ({ ...f, firstName: e.target.value }))}
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="label">Nom *</label>
                <input
                  className="input"
                  value={newUserForm.lastName}
                  onChange={e => setNewUserForm(f => ({ ...f, lastName: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div>
              <label className="label">Email *</label>
              <input
                type="email"
                className="input"
                value={newUserForm.email}
                onChange={e => setNewUserForm(f => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">Mot de passe *</label>
              <input
                type="password"
                className="input"
                value={newUserForm.password}
                onChange={e => setNewUserForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Au moins 6 caractères"
                required
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowNewUser(false)} className="btn-secondary">
                Annuler
              </button>
              <button type="submit" disabled={creatingUser} className="btn-primary flex items-center gap-2">
                <UserPlus size={15} />
                {creatingUser ? 'Création…' : 'Créer et sélectionner'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <Modal title="Confirmer la suppression" onClose={() => setDeleteConfirm(null)}>
          <p className="text-gray-600 mb-2">
            Êtes-vous sûr de vouloir supprimer cette direction ?
          </p>
          <p className="text-sm text-gray-400 mb-6">
            Les sous-directions seront rattachées au niveau supérieur. Les utilisateurs et saisons liés seront dissociés.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">Annuler</button>
            <button
              onClick={() => handleDelete(deleteConfirm!)}
              className="btn-danger"
            >
              Supprimer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
