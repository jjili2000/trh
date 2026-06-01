import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

interface RejectReasonModalProps {
  title?: string;
  description?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

/**
 * Modale demandant un motif de refus avant de confirmer.
 * Le motif est optionnel mais encouragé.
 */
export default function RejectReasonModal({
  title = 'Motif du refus',
  description,
  onConfirm,
  onCancel,
}: RejectReasonModalProps) {
  const [reason, setReason] = useState('');

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-500" />
            <h2 className="font-semibold text-gray-900">{title}</h2>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Corps */}
        <div className="px-6 py-5 space-y-4">
          {description && (
            <p className="text-sm text-gray-500">{description}</p>
          )}
          <div>
            <label className="label">
              Motif du refus
              <span className="text-gray-400 font-normal ml-1">(optionnel)</span>
            </label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Indiquez la raison du refus pour informer l'employé…"
              value={reason}
              onChange={e => setReason(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button onClick={onCancel} className="btn-secondary">
            Annuler
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            Confirmer le refus
          </button>
        </div>
      </div>
    </div>
  );
}
