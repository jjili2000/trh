import { useState, FormEvent } from 'react';
import { Plus, Edit2, Trash2, X, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Department } from '../../types';

interface FormData {
  name: string;
  parentId: string;
}

const emptyForm: FormData = { name: '', parentId: '' };

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
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
  const { departments, currentUser, addDepartment, updateDepartment, deleteDepartment } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  const openAdd = () => {
    setForm(emptyForm);
    setEditing(null);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (d: Department) => {
    setForm({ name: d.name, parentId: d.parentId ?? '' });
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

    if (editing) {
      await updateDepartment(editing.id, { name: form.name.trim(), parentId: form.parentId || null });
    } else {
      await addDepartment({ name: form.name.trim(), parentId: form.parentId || null });
    }
    setShowModal(false);
  };

  const handleDelete = async (id: string) => {
    await deleteDepartment(id);
    setDeleteConfirm(null);
  };

  // Build tree view
  const topLevel = departments.filter(d => !d.parentId);
  const children = (parentId: string) => departments.filter(d => d.parentId === parentId);

  // For parent selector: exclude current and its descendants
  const getDescendants = (id: string): string[] => {
    const kids = children(id);
    return [id, ...kids.flatMap(k => getDescendants(k.id))];
  };
  const excludedIds = editing ? getDescendants(editing.id) : [];
  const parentOptions = departments.filter(d => !excludedIds.includes(d.id));

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
            return (
              <div key={dept.id}>
                <div className="flex items-center gap-3 py-2 px-1 rounded-lg hover:bg-gray-50 group">
                  <div className="flex-1 flex items-center gap-2">
                    <span className="font-medium text-gray-800">{dept.name}</span>
                    {kids.length > 0 && (
                      <span className="text-xs text-gray-400">({kids.length} sous-direction{kids.length > 1 ? 's' : ''})</span>
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
                    {kids.map(kid => (
                      <div key={kid.id} className="flex items-center gap-3 py-1.5 px-1 rounded-lg hover:bg-gray-50 group">
                        <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                        <div className="flex-1">
                          <span className="text-sm text-gray-700">{kid.name}</span>
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
                    ))}
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

      {/* Delete Confirm */}
      {deleteConfirm && (
        <Modal title="Confirmer la suppression" onClose={() => setDeleteConfirm(null)}>
          <p className="text-gray-600 mb-2">
            Êtes-vous sûr de vouloir supprimer cette direction ?
          </p>
          <p className="text-sm text-gray-400 mb-6">
            Les sous-directions seront rattachées au niveau supérieur. Les utilisateurs et saisons liés à cette direction seront dissociés.
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
