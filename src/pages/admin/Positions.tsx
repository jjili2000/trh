import { useState, ReactNode, FormEvent } from 'react';
import { Plus, Edit2, Trash2, X, Briefcase } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Position } from '../../types';

interface FormData {
  name: string;
}

const emptyForm: FormData = { name: '' };

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

export default function Positions() {
  const { positions, currentUser, addPosition, updatePosition, deletePosition } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
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

  const openEdit = (p: Position) => {
    setForm({ name: p.name });
    setEditing(p);
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
    const nameExists = positions.some(
      p => p.name.toLowerCase() === form.name.toLowerCase() && p.id !== editing?.id
    );
    if (nameExists) {
      setFormError('Ce type de poste existe déjà.');
      return;
    }
    if (editing) {
      updatePosition(editing.id, { name: form.name.trim() });
    } else {
      addPosition({ name: form.name.trim() });
    }
    setShowModal(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-semibold text-gray-800">Types de postes</h2>
          <p className="text-sm text-gray-400">{positions.length} poste(s) configuré(s)</p>
        </div>
        {isAdmin && (
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            Ajouter
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {positions.map(p => (
          <div key={p.id} className="card flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-tennis-green/10 flex items-center justify-center flex-shrink-0">
              <Briefcase size={18} className="text-tennis-green" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{p.name}</p>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => openEdit(p)}
                  className="p-1.5 text-gray-400 hover:text-tennis-green hover:bg-tennis-green/10 rounded-lg transition-colors"
                >
                  <Edit2 size={15} />
                </button>
                <button
                  onClick={() => setDeleteConfirm(p.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>
        ))}

        {positions.length === 0 && (
          <div className="col-span-3 text-center py-12 text-gray-400">
            Aucun type de poste configuré.
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal
          title={editing ? 'Modifier le poste' : 'Nouveau type de poste'}
          onClose={() => setShowModal(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {formError}
              </div>
            )}
            <div>
              <label className="label">Intitulé du poste *</label>
              <input
                className="input"
                value={form.name}
                onChange={e => setForm({ name: e.target.value })}
                placeholder="Ex: Moniteur, Responsable pédagogique..."
                autoFocus
                required
              />
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
            Êtes-vous sûr de vouloir supprimer ce type de poste ?
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">Annuler</button>
            <button
              onClick={() => { deletePosition(deleteConfirm); setDeleteConfirm(null); }}
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
