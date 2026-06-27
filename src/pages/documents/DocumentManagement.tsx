import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Upload,
  FileText,
  Search,
  Trash2,
  Edit2,
  Download,
  CheckCircle,
  Clock,
  X,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  User,
  Loader2,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Package,
} from 'lucide-react';
import JSZip from 'jszip';
import { useApp } from '../../context/AppContext';
import { HRDocument } from '../../types';
import { getToken } from '../../api/client';

const DOCUMENT_TYPES = [
  'fiche de paie',
  'contrat de travail',
  'avenant',
  'attestation',
  'certificat',
  'autre',
];

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  'fiche de paie': 'Fiche de paie',
  'contrat de travail': 'Contrat de travail',
  avenant: 'Avenant',
  attestation: 'Attestation',
  certificat: 'Certificat',
  autre: 'Autre',
};

async function downloadDocument(docId: string, fileName: string) {
  const token = getToken();
  const response = await fetch(`/api/documents/${docId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Erreur lors du téléchargement');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

interface ValidationFormData {
  documentType: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
}

interface ValidationModalProps {
  doc: HRDocument;
  users: { id: string; firstName: string; lastName: string }[];
  documents: HRDocument[];
  queueIndex?: number;
  queueTotal?: number;
  onClose: () => void;
  onValidate: (id: string, data: Partial<HRDocument> & { status: 'validated' }) => Promise<void>;
  onSave: (id: string, data: Partial<HRDocument>) => Promise<void>;
}

/** Cherche un utilisateur dont le nom correspond au nom détecté par l'IA. */
function matchUserByName(
  users: { id: string; firstName: string; lastName: string }[],
  detectedName: string | null | undefined,
): string {
  if (!detectedName) return '';
  const norm = (s: string) =>
    (s ?? '').toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const detected = norm(detectedName);
  return users.find(u => {
    const first = norm(u.firstName);
    const last  = norm(u.lastName);
    if (!first || !last) return false;
    const full    = `${first} ${last}`;
    const reverse = `${last} ${first}`;
    return full === detected || reverse === detected ||
      (detected.includes(first) && detected.includes(last));
  })?.id ?? '';
}

function ValidationModal({ doc, users, documents, queueIndex, queueTotal, onClose, onValidate, onSave }: ValidationModalProps) {
  const [form, setForm] = useState<ValidationFormData>({
    documentType: doc.documentType || 'autre',
    userId: doc.userId || matchUserByName(users, doc.detectedEmployeeName),
    periodStart: doc.periodStart || '',
    periodEnd: doc.periodEnd || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);

  // Détection de doublon sur les critères reconnus (type + employé + période)
  const duplicateDoc = useMemo(() => {
    if (!form.documentType || !form.userId || !form.periodStart) return null;
    return documents.find(d =>
      d.id !== doc.id &&
      d.status === 'validated' &&
      d.documentType === form.documentType &&
      d.userId === form.userId &&
      (d.periodStart || '') === form.periodStart &&
      (d.periodEnd || '') === (form.periodEnd || '')
    ) ?? null;
  }, [documents, form, doc.id]);

  // ── Prévisualisation (desktop) ──────────────────────────────────────────────
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState('');
  const [previewLoading, setPreviewLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | null = null;
    const token = getToken();
    fetch(`/api/documents/${doc.id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async res => {
        if (!res.ok) return;
        const ct = res.headers.get('content-type') || '';
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setPreviewType(ct);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {})
      .finally(() => setPreviewLoading(false));

    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [doc.id]);

  const handleChange = (field: keyof ValidationFormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setDuplicateConfirmed(false); // reset si le formulaire change
  };

  const handleSave = async (validate: boolean) => {
    // Si doublon détecté et non confirmé, demander confirmation
    if (validate && duplicateDoc && !duplicateConfirmed) {
      setDuplicateConfirmed(true);
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (validate) {
        await onValidate(doc.id, { ...form, status: 'validated' });
      } else {
        await onSave(doc.id, form);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const isPdf = previewType.includes('pdf');

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modale : étroite sur mobile, large sur desktop si prévisualisation disponible */}
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg lg:max-w-5xl flex flex-col lg:flex-row overflow-hidden"
        style={{ maxHeight: '90vh' }}>

        {/* ── Panneau formulaire (gauche) ──────────────────────────────────── */}
        <div className="flex flex-col w-full lg:w-[400px] flex-shrink-0 overflow-y-auto">
          {/* En-tête */}
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Valider le document{queueTotal && queueTotal > 1 ? ` (${queueIndex! + 1}/${queueTotal})` : ''}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5 truncate max-w-[260px]" title={doc.fileName}>{doc.fileName}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 ml-2">
              <X size={20} />
            </button>
          </div>

          {doc.detectedEmployeeName && (
            <div className="mx-6 mt-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <span className="font-medium">Employé détecté :</span> {doc.detectedEmployeeName}
            </div>
          )}

          <div className="p-6 space-y-4 flex-1">
            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
            {duplicateDoc && (
              <div className="px-4 py-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800 flex items-start gap-2">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />
                <div>
                  <p className="font-medium">Doublon détecté</p>
                  <p className="mt-0.5 text-amber-700">
                    Un document "{DOCUMENT_TYPE_LABELS[duplicateDoc.documentType] || duplicateDoc.documentType}" de même type,
                    même employé et même période est déjà validé ({duplicateDoc.fileName}).
                    {duplicateConfirmed && ' Cliquez à nouveau sur "Valider" pour confirmer.'}
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="label">Type de document</label>
              <div className="relative">
                <select
                  className="input appearance-none pr-10"
                  value={form.documentType}
                  onChange={e => handleChange('documentType', e.target.value)}
                >
                  {DOCUMENT_TYPES.map(t => (
                    <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="label">Assigner à un employé</label>
              <div className="relative">
                <select
                  className="input appearance-none pr-10"
                  value={form.userId}
                  onChange={e => handleChange('userId', e.target.value)}
                >
                  <option value="">— Sélectionner un employé —</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Début de période</label>
                <input type="date" className="input" value={form.periodStart}
                  onChange={e => handleChange('periodStart', e.target.value)} />
              </div>
              <div>
                <label className="label">Fin de période</label>
                <input type="date" className="input" value={form.periodEnd}
                  onChange={e => handleChange('periodEnd', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 px-6 pb-6 border-t border-gray-100 pt-4">
            <button onClick={onClose} className="btn-secondary" disabled={saving}>Annuler</button>
            <button onClick={() => handleSave(false)} className="btn-secondary" disabled={saving}>Enregistrer</button>
            <button
              onClick={() => handleSave(true)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors disabled:opacity-60 ${
                duplicateDoc && duplicateConfirmed
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'btn-primary'
              }`}
              disabled={saving}
            >
              <CheckCircle size={16} />
              {saving ? 'Validation…' : duplicateDoc && duplicateConfirmed ? 'Valider quand même' : 'Valider'}
            </button>
          </div>
        </div>

        {/* ── Panneau prévisualisation (droite, desktop uniquement) ─────────── */}
        <div className="hidden lg:flex flex-col flex-1 border-l border-gray-100 bg-gray-50 min-w-0">
          {/* Barre de titre */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0">
            <span className="text-sm font-medium text-gray-600 flex items-center gap-1.5">
              <FileText size={14} className="text-gray-400" />
              Aperçu
            </span>
            {previewUrl && (
              <button
                onClick={() => window.open(previewUrl, '_blank')}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-tennis-green transition-colors"
                title="Ouvrir dans un nouvel onglet"
              >
                <ExternalLink size={14} />
                Ouvrir
              </button>
            )}
          </div>

          {/* Contenu */}
          <div className="flex-1 overflow-hidden relative">
            {previewLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-gray-300" />
              </div>
            ) : previewUrl ? (
              isPdf ? (
                <embed
                  src={previewUrl}
                  type="application/pdf"
                  className="w-full h-full"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center p-4 overflow-auto">
                  <img
                    src={previewUrl}
                    alt="Aperçu du document"
                    className="max-w-full max-h-full object-contain rounded-lg shadow cursor-zoom-in"
                    onClick={() => window.open(previewUrl, '_blank')}
                    title="Cliquer pour agrandir"
                  />
                </div>
              )
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300 gap-2">
                <FileText size={36} />
                <p className="text-sm">Aperçu non disponible</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modale d'analyse ──────────────────────────────────────────────────────────

interface AnalysisModalProps {
  fileName: string;
  current?: number;
  total?: number;
  error?: string;
  onCancel: () => void;
}

function AnalysisModal({ fileName, current, total, error, onCancel }: AnalysisModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Analyse du document</h2>
          <button
            onClick={onCancel}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-8">
          {error ? (
            /* État erreur */
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto">
                <AlertCircle size={28} className="text-red-400" />
              </div>
              <div>
                <p className="font-medium text-gray-800">Analyse impossible</p>
                <p className="text-sm text-gray-500 mt-1">{error}</p>
              </div>
              <button onClick={onCancel} className="btn-secondary w-full">Fermer</button>
            </div>
          ) : (
            /* État chargement */
            <div className="text-center space-y-4">
              <div className="relative w-14 h-14 mx-auto">
                <Loader2 size={56} className="animate-spin text-tennis-green" />
                <Sparkles size={20} className="absolute -top-1 -right-1 text-yellow-400" />
              </div>
              <div>
                <p className="font-medium text-gray-800">
                  Analyse en cours{total && total > 1 ? ` (${current}/${total})` : ''}…
                </p>
                <p className="text-sm text-gray-500 mt-1 truncate max-w-[220px] mx-auto" title={fileName}>
                  {fileName}
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Identification du type, de l'employé et de la période
                </p>
              </div>
              <button onClick={onCancel} className="btn-secondary w-full">Annuler</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  uploading: boolean;
}

function UploadZone({ onFilesSelected, uploading }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files).filter(f =>
        f.type === 'application/pdf' || f.type.startsWith('image/')
      );
      if (files.length) onFilesSelected(files);
    },
    [onFilesSelected]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onFilesSelected(files);
    e.target.value = '';
  };

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
        dragging
          ? 'border-tennis-green bg-tennis-green/5'
          : 'border-gray-200 hover:border-tennis-green hover:bg-gray-50'
      } ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,image/*"
        multiple
        className="hidden"
        onChange={handleChange}
      />
      <Upload size={36} className="mx-auto text-gray-300 mb-3" />
      {uploading ? (
        <p className="text-sm font-medium text-tennis-green">Analyse en cours…</p>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-700">
            Glissez des fichiers ici ou <span className="text-tennis-green">cliquez pour parcourir</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">PDF ou image (JPG, PNG, etc.) · Plusieurs fichiers acceptés</p>
        </>
      )}
    </div>
  );
}

export default function DocumentManagement() {
  const { documents, users, addDocument, updateDocument, deleteDocument } = useApp();

  const [validationQueue, setValidationQueue] = useState<HRDocument[]>([]);
  const validationQueueSizeRef = useRef(0);
  const [editingDoc, setEditingDoc] = useState<HRDocument | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'fileName' | 'documentType' | 'user' | 'periodStart' | 'createdAt'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  // ── Sélection multiple ───────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // État de la modale d'analyse
  const [analysis, setAnalysis] = useState<{
    fileName: string;
    current: number;
    total: number;
    abort: AbortController;
    error?: string;
  } | null>(null);

  const handleFilesSelected = async (files: File[]) => {
    if (!files.length) return;
    const abort = new AbortController();
    const analyzed: HRDocument[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setAnalysis({ fileName: file.name, current: i + 1, total: files.length, abort });
      try {
        const created = await addDocument(file, abort.signal);
        analyzed.push(created);
      } catch (err: unknown) {
        // Annulation volontaire → arrêter la boucle et ouvrir la validation pour les fichiers déjà analysés
        if (abort.signal.aborted) {
          setAnalysis(null);
          if (analyzed.length) {
            validationQueueSizeRef.current = analyzed.length;
            setValidationQueue(analyzed);
          }
          return;
        }
        const msg = err instanceof Error ? err.message : 'Erreur lors de l\'analyse';
        setAnalysis(prev => prev ? { ...prev, error: msg } : null);
        // Attendre que l'utilisateur ferme la modale d'erreur (abort signal)
        await new Promise<void>(resolve => {
          const id = setInterval(() => {
            if (abort.signal.aborted) { clearInterval(id); resolve(); }
          }, 100);
        });
        setAnalysis(null);
        if (analyzed.length) {
          validationQueueSizeRef.current = analyzed.length;
          setValidationQueue(analyzed);
        }
        return;
      }
    }

    setAnalysis(null);
    if (analyzed.length) {
      validationQueueSizeRef.current = analyzed.length;
      setValidationQueue(analyzed);
    }
  };

  const cancelAnalysis = () => {
    analysis?.abort.abort();
    setAnalysis(null);
  };

  const handleValidate = async (id: string, data: Partial<HRDocument> & { status: 'validated' }) => {
    await updateDocument(id, data);
  };

  const handleSave = async (id: string, data: Partial<HRDocument>) => {
    await updateDocument(id, data);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce document ?')) return;
    await deleteDocument(id);
    setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const handleBulkDownload = async () => {
    if (selected.size === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      const usedNames = new Map<string, number>();
      const allDocs = [...pending, ...validated];
      const docsToZip = allDocs.filter(d => selected.has(d.id));

      await Promise.all(docsToZip.map(async doc => {
        try {
          const token = getToken();
          const res = await fetch(`/api/documents/${doc.id}/download`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!res.ok) return;
          const blob = await res.blob();
          let name = doc.fileName;
          if (usedNames.has(name)) {
            const count = (usedNames.get(name) ?? 0) + 1;
            usedNames.set(name, count);
            const dot = name.lastIndexOf('.');
            const ext = dot !== -1 ? name.slice(dot) : '';
            name = `${name.slice(0, dot !== -1 ? dot : name.length)} (${count})${ext}`;
          } else {
            usedNames.set(name, 1);
          }
          zip.file(name, blob);
        } catch { /* fichier ignoré */ }
      }));

      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'documents.zip';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await Promise.all(Array.from(selected).map(id => deleteDocument(id)));
      setSelected(new Set());
    } finally {
      setBulkDeleting(false);
      setConfirmDeleteOpen(false);
    }
  };

  const handleDownload = async (doc: HRDocument) => {
    setDownloading(doc.id);
    try {
      await downloadDocument(doc.id, doc.fileName);
    } catch (err) {
      alert('Erreur lors du téléchargement');
    } finally {
      setDownloading(null);
    }
  };

  const getUserName = (userId?: string) => {
    if (!userId) return '—';
    const u = users.find(u => u.id === userId);
    return u ? `${u.firstName} ${u.lastName}` : '—';
  };

  const pending = documents.filter(d => d.status === 'pending_validation');
  const validated = useMemo(() => {
    const filtered = documents.filter(d => {
      if (d.status !== 'validated') return false;
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        d.fileName.toLowerCase().includes(q) ||
        d.documentType?.toLowerCase().includes(q) ||
        getUserName(d.userId).toLowerCase().includes(q);
      const matchType = !filterType || d.documentType === filterType;
      const matchUser = !filterUser || d.userId === filterUser;
      return matchSearch && matchType && matchUser;
    });
    return [...filtered].sort((a, b) => {
      let av = '', bv = '';
      if (sortBy === 'fileName')      { av = a.fileName || ''; bv = b.fileName || ''; }
      if (sortBy === 'documentType')  { av = a.documentType || ''; bv = b.documentType || ''; }
      if (sortBy === 'user')          { av = getUserName(a.userId); bv = getUserName(b.userId); }
      if (sortBy === 'periodStart')   { av = a.periodStart || ''; bv = b.periodStart || ''; }
      if (sortBy === 'createdAt')     { av = a.createdAt || ''; bv = b.createdAt || ''; }
      const cmp = av.localeCompare(bv, 'fr');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, search, filterType, filterUser, sortBy, sortDir]);

  const modalDoc = validationQueue[0] ?? editingDoc ?? null;


  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestion des documents</h1>
        <p className="text-gray-500 mt-1">Téléversez, analysez et validez les documents RH des employés.</p>
      </div>

      {/* Upload zone */}
      <div className="card mb-6">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Upload size={18} className="text-tennis-green" />
          Téléverser un document
        </h2>
        <UploadZone onFilesSelected={handleFilesSelected} uploading={false} />
      </div>

      {/* Barre d'actions groupées */}
      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <span className="text-sm text-blue-800 font-medium flex-1">
            {selected.size} document{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={handleBulkDownload}
            disabled={zipping}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-tennis-green text-white text-sm rounded-lg hover:bg-tennis-green/90 disabled:opacity-60 transition-colors"
          >
            {zipping ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
            {zipping ? 'Préparation…' : 'Télécharger en ZIP'}
          </button>
          <button
            onClick={() => setConfirmDeleteOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors"
          >
            <Trash2 size={14} />
            Supprimer
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Pending validation */}
      {pending.length > 0 && (
        <div className="card mb-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock size={18} className="text-amber-500" />
            En attente de validation
            <span className="ml-auto bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              {pending.length}
            </span>
          </h2>
          <div className="space-y-3">
            {pending.map(doc => (
              <div
                key={doc.id}
                className={`flex items-center gap-4 p-4 border rounded-xl transition-colors ${
                  selected.has(doc.id) ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-100'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(doc.id)}
                  onChange={() => toggleSelect(doc.id)}
                  className="rounded border-gray-300 text-tennis-green flex-shrink-0"
                />
                <FileText size={20} className="text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.fileName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}
                    {doc.detectedEmployeeName && ` · Détecté : ${doc.detectedEmployeeName}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleDownload(doc)}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Télécharger"
                    disabled={downloading === doc.id}
                  >
                    <Download size={16} />
                  </button>
                  <button
                    onClick={() => {
                      setValidationQueue(q => {
                        if (q.some(d => d.id === doc.id)) return q;
                        const next = [...q, doc];
                        validationQueueSizeRef.current = next.length;
                        return next;
                      });
                    }}
                    className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                  >
                    <CheckCircle size={14} />
                    Valider
                  </button>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="p-2 text-red-400 hover:text-red-600 transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Validated documents */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <CheckCircle size={18} className="text-tennis-green" />
            Documents validés
          </h2>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-48">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher…"
              className="input pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="relative">
            <select
              className="input appearance-none pr-8"
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
            >
              <option value="">Tous les types</option>
              {DOCUMENT_TYPES.map(t => (
                <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              className="input appearance-none pr-8"
              value={filterUser}
              onChange={e => setFilterUser(e.target.value)}
            >
              <option value="">Tous les employés</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              className="input appearance-none pr-8"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="">Tous les statuts</option>
              <option value="pending_validation">En attente</option>
              <option value="validated">Validés</option>
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Table */}
        {validated.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <FileText size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Aucun document validé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 pr-3 w-8">
                    <input
                      type="checkbox"
                      checked={validated.length > 0 && validated.every(d => selected.has(d.id))}
                      ref={el => { if (el) el.indeterminate = validated.some(d => selected.has(d.id)) && !validated.every(d => selected.has(d.id)); }}
                      onChange={() => {
                        const allVal = validated.every(d => selected.has(d.id));
                        setSelected(prev => {
                          const s = new Set(prev);
                          validated.forEach(d => allVal ? s.delete(d.id) : s.add(d.id));
                          return s;
                        });
                      }}
                      className="rounded border-gray-300 text-tennis-green"
                    />
                  </th>
                  {([
                    { key: 'fileName',     label: 'Fichier' },
                    { key: 'documentType', label: 'Type' },
                    { key: 'user',         label: 'Employé' },
                    { key: 'periodStart',  label: 'Période' },
                    { key: 'createdAt',    label: 'Date' },
                  ] as { key: typeof sortBy; label: string }[]).map(col => (
                    <th
                      key={col.key}
                      className="text-left py-2 pr-4 font-medium text-gray-500 cursor-pointer select-none hover:text-gray-800 transition-colors"
                      onClick={() => toggleSort(col.key)}
                    >
                      <span className="flex items-center gap-1">
                        {col.label}
                        {sortBy === col.key
                          ? sortDir === 'asc'
                            ? <ChevronUp size={13} className="text-tennis-green" />
                            : <ChevronDown size={13} className="text-tennis-green" />
                          : <ChevronsUpDown size={13} className="text-gray-300" />
                        }
                      </span>
                    </th>
                  ))}
                  <th className="text-right py-2 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {validated.map(doc => (
                  <tr key={doc.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 ${selected.has(doc.id) ? 'bg-blue-50/50' : ''}`}>
                    <td className="py-3 pr-3">
                      <input
                        type="checkbox"
                        checked={selected.has(doc.id)}
                        onChange={() => toggleSelect(doc.id)}
                        className="rounded border-gray-300 text-tennis-green"
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-gray-400 flex-shrink-0" />
                        <span className="truncate max-w-[180px]" title={doc.fileName}>
                          {doc.fileName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {doc.userId ? (
                        <div className="flex items-center gap-1.5">
                          <User size={14} className="text-gray-400" />
                          {getUserName(doc.userId)}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-gray-500">
                      {doc.periodStart
                        ? `${new Date(doc.periodStart + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}${
                            doc.periodEnd
                              ? ' – ' + new Date(doc.periodEnd + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
                              : ''
                          }`
                        : '—'}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-gray-500">
                      {new Date(doc.createdAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleDownload(doc)}
                          className="p-1.5 text-gray-400 hover:text-tennis-green transition-colors"
                          title="Télécharger"
                          disabled={downloading === doc.id}
                        >
                          <Download size={16} />
                        </button>
                        <button
                          onClick={() => setEditingDoc(doc)}
                          className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"
                          title="Modifier"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modale de confirmation suppression groupée */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={20} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Supprimer {selected.size} document{selected.size > 1 ? 's' : ''} ?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Cette action est irréversible. Les fichiers seront définitivement supprimés et ne seront plus accessibles aux employés concernés.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={bulkDeleting}
                className="btn-secondary"
              >
                Annuler
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-xl hover:bg-red-600 disabled:opacity-60 transition-colors"
              >
                {bulkDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {bulkDeleting ? 'Suppression…' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale d'analyse en cours */}
      {analysis && (
        <AnalysisModal
          fileName={analysis.fileName}
          current={analysis.current}
          total={analysis.total}
          error={analysis.error}
          onCancel={cancelAnalysis}
        />
      )}

      {/* Validation / Edit Modal */}
      {modalDoc && (
        <ValidationModal
          key={modalDoc.id}
          doc={modalDoc}
          users={users}
          documents={documents}
          queueIndex={
            validationQueue.length > 0 && validationQueueSizeRef.current > 1
              ? validationQueueSizeRef.current - validationQueue.length
              : undefined
          }
          queueTotal={
            validationQueue.length > 0 && validationQueueSizeRef.current > 1
              ? validationQueueSizeRef.current
              : undefined
          }
          onClose={() => {
            if (validationQueue.length > 0) {
              setValidationQueue(prev => prev.slice(1));
            } else {
              setEditingDoc(null);
            }
          }}
          onValidate={handleValidate}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
