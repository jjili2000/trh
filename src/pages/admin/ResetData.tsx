import { useState, useEffect } from 'react';
import {
  AlertTriangle, Trash2, Users, FileText, Download,
  CheckCircle, ChevronRight, RotateCcw, Loader2,
} from 'lucide-react';
import { api, getToken } from '../../api/client';

interface Preview {
  timeEntries: number;
  absenceRequests: number;
  expenses: number;
  expenseReceipts: number;
  payrollPeriods: number;
  budgetRequests: number;
  realBudgets: number;
  bankOperations: number;
  bankImports: number;
  notifications: number;
  seasons: number;
  documents: number;
  nonAdminUsers: number;
}

interface DeletedCounts {
  timeEntries?: number;
  absenceRequests?: number;
  expenses?: number;
  payrollPeriods?: number;
  budgetRequests?: number;
  realBudgets?: number;
  bankOperations?: number;
  bankImports?: number;
  notifications?: number;
  seasons?: number;
  documents?: number;
  users?: number;
}

type Step = 'options' | 'confirm' | 'done';

export default function ResetData() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);

  const [deleteUsers, setDeleteUsers] = useState(false);
  const [deleteDocuments, setDeleteDocuments] = useState(false);
  const [zipDownloaded, setZipDownloaded] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const [step, setStep] = useState<Step>('options');
  const [confirmText, setConfirmText] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DeletedCounts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Preview>('/admin/reset/preview')
      .then(setPreview)
      .catch(() => setPreview(null))
      .finally(() => setLoadingPreview(false));
  }, []);

  // Reset zip-downloaded flag quand on (dé)coche documents
  const handleToggleDocuments = (v: boolean) => {
    setDeleteDocuments(v);
    setZipDownloaded(false);
  };

  const handleDownloadZip = async () => {
    setDownloadingZip(true);
    try {
      const token = getToken();
      const res = await fetch('/api/admin/reset/documents-zip', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors du téléchargement');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      a.download = match ? match[1] : 'documents_backup.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setZipDownloaded(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur lors du téléchargement');
    } finally {
      setDownloadingZip(false);
    }
  };

  const hasFilesToBackup = (preview?.documents ?? 0) > 0 || (preview?.expenseReceipts ?? 0) > 0;
  const canProceedToConfirm =
    !deleteDocuments || zipDownloaded || !hasFilesToBackup;

  const handleReset = async () => {
    if (confirmText !== 'SUPPRIMER') return;
    setRunning(true);
    setError(null);
    try {
      const res = await api.post<{ success: boolean; deleted: DeletedCounts }>(
        '/admin/reset',
        { deleteUsers, deleteDocuments, confirm: 'SUPPRIMER' }
      );
      setResult(res.deleted);
      setStep('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la remise à zéro');
    } finally {
      setRunning(false);
    }
  };

  const fmtCount = (n: number | undefined) =>
    (n ?? 0).toLocaleString('fr-FR');

  // ── DONE ────────────────────────────────────────────────────────────────────
  if (step === 'done' && result) {
    const total = Object.values(result).reduce((s, v) => s + (v ?? 0), 0);
    return (
      <div className="max-w-xl">
        <div className="card border-green-200 bg-green-50">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="text-green-600" size={24} />
            <h3 className="font-semibold text-green-800 text-lg">
              Remise à zéro effectuée
            </h3>
          </div>
          <p className="text-sm text-green-700 mb-4">
            <strong>{fmtCount(total)} enregistrement(s)</strong> supprimé(s) au total.
          </p>
          <div className="space-y-1 text-sm text-green-700">
            {result.timeEntries    ? <p>• {fmtCount(result.timeEntries)} saisie(s) de temps</p> : null}
            {result.absenceRequests? <p>• {fmtCount(result.absenceRequests)} demande(s) d'absence</p> : null}
            {result.expenses       ? <p>• {fmtCount(result.expenses)} note(s) de frais</p> : null}
            {result.payrollPeriods ? <p>• {fmtCount(result.payrollPeriods)} période(s) de paie</p> : null}
            {result.budgetRequests ? <p>• {fmtCount(result.budgetRequests)} demande(s) de budget</p> : null}
            {result.realBudgets    ? <p>• {fmtCount(result.realBudgets)} budget(s) réel(s)</p> : null}
            {result.bankImports    ? <p>• {fmtCount(result.bankImports)} import(s) bancaire(s)</p> : null}
            {result.bankOperations ? <p>• {fmtCount(result.bankOperations)} opération(s) bancaire(s)</p> : null}
            {result.seasons        ? <p>• {fmtCount(result.seasons)} saison(s)</p> : null}
            {result.notifications  ? <p>• {fmtCount(result.notifications)} notification(s)</p> : null}
            {result.documents      ? <p>• {fmtCount(result.documents)} document(s)</p> : null}
            {result.users          ? <p>• {fmtCount(result.users)} utilisateur(s)</p> : null}
          </div>
          <div className="mt-5 pt-4 border-t border-green-200">
            <p className="text-xs text-green-600">
              Les paramètres, types d'activités, postes, règles de validation et règles de
              comptabilité ont été conservés.
            </p>
          </div>
          <button
            className="mt-4 btn-secondary text-sm flex items-center gap-2"
            onClick={() => {
              setStep('options');
              setResult(null);
              setConfirmText('');
              setZipDownloaded(false);
              // Rafraîchir le preview
              setLoadingPreview(true);
              api.get<Preview>('/admin/reset/preview')
                .then(setPreview)
                .catch(() => setPreview(null))
                .finally(() => setLoadingPreview(false));
            }}
          >
            <RotateCcw size={14} />
            Retour
          </button>
        </div>
      </div>
    );
  }

  // ── CONFIRM ──────────────────────────────────────────────────────────────────
  if (step === 'confirm') {
    return (
      <div className="max-w-xl">
        <div className="card border-red-200">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="text-red-500" size={22} />
            <h3 className="font-semibold text-red-700 text-lg">Confirmation requise</h3>
          </div>

          <div className="bg-red-50 rounded-lg p-4 mb-5 text-sm text-red-700 space-y-1">
            <p className="font-medium mb-2">Les données suivantes seront <u>définitivement supprimées</u> :</p>
            <p>• Toutes les saisies de temps, absences, notes de frais</p>
            <p>• Toutes les périodes de paie</p>
            <p>• Toutes les demandes de budget et budgets réels</p>
            <p>• Tous les imports et opérations bancaires</p>
            <p>• Toutes les saisons et leurs plannings</p>
            <p>• Toutes les notifications</p>
            {deleteDocuments && <p>• Tous les documents RH</p>}
            {deleteUsers     && <p>• Tous les utilisateurs (hors administrateurs)</p>}
          </div>

          <div className="mb-5">
            <label className="label">
              Tapez <strong className="text-red-600">SUPPRIMER</strong> pour confirmer
            </label>
            <input
              className="input font-mono"
              placeholder="SUPPRIMER"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              autoFocus
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              className="btn-secondary"
              onClick={() => { setStep('options'); setConfirmText(''); setError(null); }}
              disabled={running}
            >
              Retour
            </button>
            <button
              className="btn-danger flex items-center gap-2"
              disabled={confirmText !== 'SUPPRIMER' || running}
              onClick={handleReset}
            >
              {running
                ? <><Loader2 size={16} className="animate-spin" /> Suppression…</>
                : <><Trash2 size={16} /> Supprimer définitivement</>
              }
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── OPTIONS (step 1) ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h2 className="font-semibold text-gray-800">Remise à zéro des données</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Supprime les données de production en conservant tout le paramétrage.
        </p>
      </div>

      {/* Ce qui sera supprimé */}
      <div className="card">
        <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
          <Trash2 size={16} className="text-red-500" />
          Données supprimées (toujours)
        </h3>
        {loadingPreview ? (
          <p className="text-sm text-gray-400">Chargement…</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
            <span>Saisies de temps</span>
            <span className="font-medium text-gray-800">{fmtCount(preview?.timeEntries)}</span>
            <span>Demandes d'absence</span>
            <span className="font-medium text-gray-800">{fmtCount(preview?.absenceRequests)}</span>
            <span>Notes de frais</span>
            <span className="font-medium text-gray-800">{fmtCount(preview?.expenses)}</span>
            <span>Périodes de paie</span>
            <span className="font-medium text-gray-800">{fmtCount(preview?.payrollPeriods)}</span>
            <span>Demandes budget</span>
            <span className="font-medium text-gray-800">{fmtCount(preview?.budgetRequests)}</span>
            <span>Budgets réels</span>
            <span className="font-medium text-gray-800">{fmtCount(preview?.realBudgets)}</span>
            <span>Opérations bancaires</span>
            <span className="font-medium text-gray-800">{fmtCount(preview?.bankOperations)}</span>
            <span>Saisons</span>
            <span className="font-medium text-gray-800">{fmtCount(preview?.seasons)}</span>
            <span>Notifications</span>
            <span className="font-medium text-gray-800">{fmtCount(preview?.notifications)}</span>
          </div>
        )}
      </div>

      {/* Ce qui est conservé */}
      <div className="card bg-green-50 border-green-100">
        <h3 className="font-medium text-green-700 mb-2 flex items-center gap-2">
          <CheckCircle size={15} className="text-green-600" />
          Données conservées
        </h3>
        <div className="text-sm text-green-700 space-y-0.5">
          <p>• Paramètres de l'application</p>
          <p>• Types d'activités et postes</p>
          <p>• Règles de validation</p>
          <p>• Règles et catégories comptables</p>
          <p>• Accès modules des utilisateurs</p>
        </div>
      </div>

      {/* Option : supprimer les utilisateurs */}
      <div className="card">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 w-4 h-4 text-red-600 rounded"
            checked={deleteUsers}
            onChange={e => setDeleteUsers(e.target.checked)}
          />
          <div>
            <div className="flex items-center gap-2 font-medium text-gray-700">
              <Users size={15} />
              Supprimer les utilisateurs (hors administrateurs)
            </div>
            {!loadingPreview && (
              <p className="text-sm text-gray-500 mt-0.5">
                {fmtCount(preview?.nonAdminUsers)} utilisateur(s) concerné(s)
              </p>
            )}
          </div>
        </label>
      </div>

      {/* Option : supprimer les documents */}
      <div className="card">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 w-4 h-4 text-red-600 rounded"
            checked={deleteDocuments}
            onChange={e => handleToggleDocuments(e.target.checked)}
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 font-medium text-gray-700">
              <FileText size={15} />
              Supprimer les documents RH
            </div>
            {!loadingPreview && (
              <p className="text-sm text-gray-500 mt-0.5">
                {fmtCount(preview?.documents)} document(s) RH
                {(preview?.expenseReceipts ?? 0) > 0 &&
                  ` · ${fmtCount(preview?.expenseReceipts)} justificatif(s) de frais`}
              </p>
            )}
          </div>
        </label>

        {/* Bloc de téléchargement ZIP */}
        {deleteDocuments && ((preview?.documents ?? 0) > 0 || (preview?.expenseReceipts ?? 0) > 0) && (
          <div className={`mt-3 ml-7 p-3 rounded-lg border text-sm ${
            zipDownloaded
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            {zipDownloaded ? (
              <div className="flex items-center gap-2">
                <CheckCircle size={15} className="text-green-600 flex-shrink-0" />
                Sauvegarde téléchargée — vous pouvez continuer.
              </div>
            ) : (
              <>
                <p className="mb-2 font-medium">
                  Téléchargez d'abord la sauvegarde avant de supprimer les documents.
                  Le ZIP contient les documents RH (<code>documents/</code>) et les
                  justificatifs de frais (<code>justificatifs/</code>).
                </p>
                <button
                  className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 transition-colors disabled:opacity-60"
                  onClick={handleDownloadZip}
                  disabled={downloadingZip}
                >
                  {downloadingZip
                    ? <><Loader2 size={14} className="animate-spin" /> Génération…</>
                    : <><Download size={14} /> Télécharger le ZIP de sauvegarde</>
                  }
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button
          className="btn-danger flex items-center gap-2"
          disabled={!canProceedToConfirm}
          onClick={() => setStep('confirm')}
        >
          Continuer
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
