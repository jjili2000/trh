import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Download, Search, ChevronDown, Calendar, Tag,
  Eye, X, ExternalLink, Loader2, CheckSquare, Square, Package,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getToken } from '../../api/client';
import { HRDocument } from '../../types';

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

const DOCUMENT_TYPE_COLORS: Record<string, string> = {
  'fiche de paie':      'bg-emerald-50 text-emerald-700 border-emerald-200',
  'contrat de travail': 'bg-blue-50 text-blue-700 border-blue-200',
  avenant:              'bg-violet-50 text-violet-700 border-violet-200',
  attestation:          'bg-amber-50 text-amber-700 border-amber-200',
  certificat:           'bg-sky-50 text-sky-700 border-sky-200',
  autre:                'bg-gray-100 text-gray-600 border-gray-200',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchDocBlob(docId: string): Promise<{ url: string; contentType: string }> {
  const token = getToken();
  const res = await fetch(`/api/documents/${docId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Fichier introuvable');
  const contentType = res.headers.get('content-type') || '';
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), contentType };
}

async function downloadSingle(docId: string, fileName: string) {
  const { url } = await fetchDocBlob(docId);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadZip(ids: string[]) {
  const token = getToken();
  const res = await fetch('/api/documents/download-zip', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error('Erreur lors du téléchargement');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'documents.zip';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Modale de prévisualisation ────────────────────────────────────────────────

interface PreviewModalProps {
  doc: HRDocument;
  onClose: () => void;
  onDownload: (doc: HRDocument) => void;
  downloading: boolean;
  formatPeriod: (start?: string, end?: string) => string | null;
}

function PreviewModal({ doc, onClose, onDownload, downloading, formatPeriod }: PreviewModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let url: string | null = null;
    fetchDocBlob(doc.id)
      .then(res => { url = res.url; setPreviewUrl(url); setContentType(res.contentType); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [doc.id]);

  const isPdf = contentType.includes('pdf');
  const typeColor = DOCUMENT_TYPE_COLORS[doc.documentType] || DOCUMENT_TYPE_COLORS['autre'];
  const period = formatPeriod(doc.periodStart, doc.periodEnd);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden"
        style={{ maxHeight: '92vh' }}>

        {/* En-tête */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-tennis-green/10 flex-shrink-0 mt-0.5">
              <FileText size={18} className="text-tennis-green" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate max-w-sm" title={doc.fileName}>
                {doc.fileName}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${typeColor}`}>
                  <Tag size={10} />
                  {DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}
                </span>
                {period && (
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Calendar size={11} className="text-gray-400" />
                    {period}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            {previewUrl && (
              <button
                onClick={() => window.open(previewUrl, '_blank')}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-tennis-green transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-100"
                title="Ouvrir dans un nouvel onglet"
              >
                <ExternalLink size={14} />
                <span className="hidden sm:inline">Ouvrir</span>
              </button>
            )}
            <button
              onClick={() => onDownload(doc)}
              disabled={downloading}
              className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3"
            >
              <Download size={13} />
              {downloading ? 'En cours…' : 'Télécharger'}
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-hidden bg-gray-50 relative min-h-[400px]">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={36} className="animate-spin text-gray-300" />
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2">
              <FileText size={40} />
              <p className="text-sm">{error}</p>
            </div>
          ) : isPdf ? (
            <embed src={previewUrl!} type="application/pdf" className="w-full h-full" style={{ minHeight: 500 }} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-6 overflow-auto">
              <img
                src={previewUrl!}
                alt={doc.fileName}
                className="max-w-full max-h-full object-contain rounded-lg shadow-md cursor-zoom-in"
                onClick={() => window.open(previewUrl!, '_blank')}
                title="Cliquer pour agrandir"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function MyDocuments() {
  const { documents, currentUser } = useApp();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterYear, setFilterYear] = useState('');

  // Téléchargement individuel
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState('');

  // Prévisualisation
  const [previewDoc, setPreviewDoc] = useState<HRDocument | null>(null);

  // Sélection multiple
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);

  const myDocs = documents.filter(d => {
    if (d.userId !== currentUser?.id) return false;
    if (d.status !== 'validated') return false;

    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      d.fileName.toLowerCase().includes(q) ||
      (d.documentType || '').toLowerCase().includes(q) ||
      (DOCUMENT_TYPE_LABELS[d.documentType] || '').toLowerCase().includes(q);

    const matchType = !filterType || d.documentType === filterType;

    let matchYear = true;
    if (filterYear) {
      const dateStr = d.periodStart || d.createdAt;
      matchYear = new Date(dateStr).getFullYear().toString() === filterYear;
    }

    return matchSearch && matchType && matchYear;
  });

  const years = Array.from(
    new Set(
      documents
        .filter(d => d.userId === currentUser?.id && d.status === 'validated')
        .map(d => new Date(d.periodStart || d.createdAt).getFullYear().toString())
    )
  ).sort((a, b) => parseInt(b) - parseInt(a));

  const formatPeriod = useCallback((periodStart?: string, periodEnd?: string): string | null => {
    if (!periodStart) return null;
    const opts: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
    const start = new Date(periodStart + 'T00:00:00').toLocaleDateString('fr-FR', opts);
    if (!periodEnd) return start;
    const end = new Date(periodEnd + 'T00:00:00').toLocaleDateString('fr-FR', opts);
    return start === end ? start : `${start} – ${end}`;
  }, []);

  const handleDownload = async (doc: HRDocument) => {
    setDownloading(doc.id);
    setDownloadError('');
    try {
      await downloadSingle(doc.id, doc.fileName);
    } catch (err: unknown) {
      setDownloadError(err instanceof Error ? err.message : 'Erreur lors du téléchargement');
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadZip = async () => {
    if (selected.size === 0) return;
    setZipping(true);
    setDownloadError('');
    try {
      await downloadZip(Array.from(selected));
      setSelected(new Set());
    } catch (err: unknown) {
      setDownloadError(err instanceof Error ? err.message : 'Erreur lors du téléchargement');
    } finally {
      setZipping(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allSelected = myDocs.length > 0 && myDocs.every(d => selected.has(d.id));
  const someSelected = myDocs.some(d => selected.has(d.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(myDocs.map(d => d.id)));
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mes documents</h1>
        <p className="text-gray-500 mt-1">
          Consultez et téléchargez vos documents RH mis à disposition par l'administration.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher un document…"
            className="input pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="relative">
          <select className="input appearance-none pr-8" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">Tous les types</option>
            {DOCUMENT_TYPES.map(t => (
              <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        {years.length > 0 && (
          <div className="relative">
            <select className="input appearance-none pr-8" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
              <option value="">Toutes les années</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        )}
      </div>

      {downloadError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {downloadError}
        </div>
      )}

      {/* Barre d'actions sélection */}
      {someSelected && (
        <div className="mb-3 flex items-center gap-3 px-4 py-2.5 bg-tennis-green/10 border border-tennis-green/20 rounded-xl">
          <span className="text-sm font-medium text-tennis-green flex-1">
            {selected.size} document{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Tout désélectionner
          </button>
          <button
            onClick={handleDownloadZip}
            disabled={zipping}
            className="btn-primary flex items-center gap-2 text-sm py-1.5 px-4"
          >
            <Package size={15} />
            {zipping ? 'Préparation…' : `Télécharger en ZIP (${selected.size})`}
          </button>
        </div>
      )}

      {/* Empty state */}
      {myDocs.length === 0 ? (
        <div className="card py-16 text-center">
          <FileText size={48} className="mx-auto text-gray-200 mb-4" />
          <h3 className="text-gray-500 font-medium">Aucun document disponible</h3>
          <p className="text-gray-400 text-sm mt-1">
            {search || filterType || filterYear
              ? 'Aucun document ne correspond à votre recherche.'
              : "Vos documents apparaîtront ici une fois validés par l'administration."}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {/* Checkbox tout sélectionner */}
                <th className="w-10 px-3 py-3 text-center">
                  <button onClick={toggleSelectAll} className="text-gray-400 hover:text-tennis-green transition-colors">
                    {allSelected
                      ? <CheckSquare size={17} className="text-tennis-green" />
                      : someSelected
                        ? <CheckSquare size={17} className="text-tennis-green/50" />
                        : <Square size={17} />
                    }
                  </button>
                </th>
                <th className="text-left px-3 py-3 font-medium text-gray-500">Document</th>
                <th className="text-left px-3 py-3 font-medium text-gray-500 hidden sm:table-cell">Type</th>
                <th className="text-left px-3 py-3 font-medium text-gray-500 hidden md:table-cell">Période</th>
                <th className="text-left px-3 py-3 font-medium text-gray-500 hidden lg:table-cell">Mis à disposition</th>
                <th className="text-right px-3 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {myDocs.map((doc, i) => {
                const period = formatPeriod(doc.periodStart, doc.periodEnd);
                const addedDate = new Date(doc.validatedAt || doc.createdAt).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'long', year: 'numeric',
                });
                const typeColor = DOCUMENT_TYPE_COLORS[doc.documentType] || DOCUMENT_TYPE_COLORS['autre'];
                const isSelected = selected.has(doc.id);

                return (
                  <tr
                    key={doc.id}
                    className={`border-b border-gray-50 last:border-0 transition-colors ${
                      isSelected
                        ? 'bg-tennis-green/5'
                        : i % 2 === 0 ? 'hover:bg-gray-50' : 'bg-gray-50/40 hover:bg-gray-100/60'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="w-10 px-3 py-3 text-center">
                      <button
                        onClick={() => toggleSelect(doc.id)}
                        className="text-gray-300 hover:text-tennis-green transition-colors"
                      >
                        {isSelected
                          ? <CheckSquare size={17} className="text-tennis-green" />
                          : <Square size={17} />
                        }
                      </button>
                    </td>

                    {/* Nom du fichier */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-tennis-green/10 flex-shrink-0">
                          <FileText size={15} className="text-tennis-green" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate max-w-[180px] sm:max-w-[260px]" title={doc.fileName}>
                            {doc.fileName}
                          </p>
                          {/* Résumé sur mobile */}
                          <div className="flex flex-wrap items-center gap-2 mt-0.5 sm:hidden">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${typeColor}`}>
                              {DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}
                            </span>
                            {period && (
                              <span className="text-xs text-gray-400">{period}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-3 py-3 hidden sm:table-cell whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${typeColor}`}>
                        {DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}
                      </span>
                    </td>

                    {/* Période */}
                    <td className="px-3 py-3 hidden md:table-cell whitespace-nowrap text-gray-600">
                      {period ? (
                        <span className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-gray-400 flex-shrink-0" />
                          {period}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Date de mise à disposition */}
                    <td className="px-3 py-3 hidden lg:table-cell whitespace-nowrap text-gray-500">
                      {addedDate}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setPreviewDoc(doc)}
                          className="p-1.5 text-gray-400 hover:text-tennis-green transition-colors rounded-lg hover:bg-gray-100"
                          title="Prévisualiser"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleDownload(doc)}
                          disabled={downloading === doc.id}
                          className="p-1.5 text-gray-400 hover:text-tennis-green transition-colors rounded-lg hover:bg-gray-100 disabled:opacity-50"
                          title="Télécharger"
                        >
                          {downloading === doc.id
                            ? <Loader2 size={16} className="animate-spin" />
                            : <Download size={16} />
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
            {myDocs.length} document{myDocs.length > 1 ? 's' : ''}
            {selected.size > 0 && ` · ${selected.size} sélectionné${selected.size > 1 ? 's' : ''}`}
          </div>
        </div>
      )}

      {/* Modale de prévisualisation */}
      {previewDoc && (
        <PreviewModal
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
          onDownload={doc => handleDownload(doc)}
          downloading={downloading === previewDoc.id}
          formatPeriod={formatPeriod}
        />
      )}
    </div>
  );
}
