import { useState, ReactNode, FormEvent } from 'react';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ActivityType } from '../../types';

interface FormData {
  name: string;
  color: string;
}

const emptyForm: FormData = { name: '', color: '#2d6a4f' };

const presetColors = [
  '#2d6a4f', '#52b788', '#8db570', '#d4e157',
  '#6b7280', '#f59e0b', '#3b82f6', '#8b5cf6',
  '#ef4444', '#ec4899', '#14b8a6', '#f97316',
];

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
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

export default function ActivityTypes() {
  const { activityTypes, currentUser, addActivityType, updateActivityType, deleteActivityType } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ActivityType | null>(null);
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

  const openEdit = (at: ActivityType) => {
    setForm({ name: at.name, color: at.color });
    setEditing(at);
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Le nom est obligatoire.');
      return;
    }
    const nameExists = activityTypes.some(
      a => a.name.toLowerCase() === form.name.toLowerCase() && a.id !== editing?.id
    );
    if (nameExists) {
      setFormError('Ce type d\'activité existe déjà.');
      return;
    }

    if (editing) {
      updateActivityType(editing.id, form);
    } else {
      addActivityType(form);
    }
    setShowModal(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-semibold text-gray-800">Types d'activités</h2>
          <p className="text-sm text-gray-400">{activityTypes.length} type(s) configuré(s)</p>
        </div>
        {isAdmin && (
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            Ajouter
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {activityTypes.map(at => (
          <div key={at.id} className="card flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-xl flex-shrink-0 shadow-sm"
              style={{ backgroundColor: at.color }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{at.name}</p>
              <p className="text-xs text-gray-400 font-mono">{at.color}</p>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => openEdit(at)}
                  className="p-1.5 text-gray-400 hover:text-tennis-green hover:bg-tennis-green/10 rounded-lg transition-colors"
                >
                  <Edit2 size={15} />
                </button>
                <button
                  onClick={() => setDeleteConfirm(at.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>
        ))}

        {activityTypes.length === 0 && (
          <div className="col-span-3 text-center py-12 text-gray-400">
            Aucun type d'activité configuré.
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal
          title={editing ? "Modifier le type d'activité" : "Nouveau type d'activité"}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
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
                placeholder="Ex: Cours particuliers"
                required
              />
            </div>

            <div>
              <label className="label">Couleur</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {presetColors.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={`w-8 h-8 rounded-lg transition-transform hover:scale-110 ${
                      form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  className="h-10 w-16 rounded cursor-pointer border border-gray-200"
                />
                <input
                  type="text"
                  className="input"
                  value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  placeholder="#000000"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: form.color }} />
              <span className="text-sm text-gray-600">{form.name || 'Aperçu'}</span>
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
          <p className="text-gray-600 mb-6">
            Êtes-vous sûr de vouloir supprimer ce type d'activité ?
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">Annuler</button>
            <button
              onClick={() => {
                deleteActivityType(deleteConfirm);
                setDeleteConfirm(null);
              }}
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
