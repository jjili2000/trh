import { useState } from 'react';
import { FileText, Download, Search, ChevronDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
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

export default function MyDocuments() {
  const { documents, currentUser } = useApp();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState('');

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

  // Get distinct years from documents
  const years = Array.from(
    new Set(
      documents
        .filter(d => d.userId === currentUser?.id && d.status === 'validated')
        .map(d => {
          const dateStr = d.periodStart || d.createdAt;
          return new Date(dateStr).getFullYear().toString();
        })
    )
  ).sort((a, b) => parseInt(b) - parseInt(a));

  const handleDownload = async (docId: string, fileName: string) => {
    setDownloading(docId);
    setDownloadError('');
    try {
      await downloadDocument(docId, fileName);
    } catch (err: unknown) {
      setDownloadError(err instanceof Error ? err.message : 'Erreur lors du téléchargement');
    } finally {
      setDownloading(null);
    }
  };

  const formatPeriod = (periodStart?: string, periodEnd?: string) => {
    if (!periodStart) return null;
    const start = new Date(periodStart + 'T00:00:00').toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    });
    if (!periodEnd) return start;
    const end = new Date(periodEnd + 'T00:00:00').toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    });
    if (start === end) return start;
    return `${start} – ${end}`;
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
      <div className="flex flex-wrap gap-3 mb-6">
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
        {years.length > 0 && (
          <div className="relative">
            <select
              className="input appearance-none pr-8"
              value={filterYear}
              onChange={e => setFilterYear(e.target.value)}
            >
              <option value="">Toutes les années</option>
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
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

      {/* Empty state */}
      {myDocs.length === 0 ? (
        <div className="card py-16 text-center">
          <FileText size={48} className="mx-auto text-gray-200 mb-4" />
          <h3 className="text-gray-500 font-medium">Aucun document disponible</h3>
          <p className="text-gray-400 text-sm mt-1">
            {search || filterType || filterYear
              ? 'Aucun document ne correspond à votre recherche.'
              : 'Vos documents apparaîtront ici une fois validés par l'administration.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {myDocs.map(doc => {
            const period = formatPeriod(doc.periodStart, doc.periodEnd);
            const addedDate = new Date(doc.createdAt).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            });

            return (
              <div
                key={doc.id}
                className="card hover:shadow-md transition-shadow group"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-tennis-green/10 flex-shrink-0 group-hover:bg-tennis-green/20 transition-colors">
                    <FileText size={22} className="text-tennis-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate" title={doc.fileName}>
                      {doc.fileName}
                    </p>
                    <p className="text-xs text-tennis-green font-medium mt-0.5">
                      {DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  {period && (
                    <p className="text-xs text-gray-500">
                      <span className="font-medium text-gray-600">Période :</span> {period}
                    </p>
                  )}
                  {doc.notes && (
                    <p className="text-xs text-gray-500 line-clamp-2" title={doc.notes}>
                      {doc.notes}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">Ajouté le {addedDate}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => handleDownload(doc.id, doc.fileName)}
                    disabled={downloading === doc.id}
                    className="w-full btn-primary flex items-center justify-center gap-2 text-sm py-2"
                  >
                    <Download size={15} />
                    {downloading === doc.id ? 'Téléchargement…' : 'Télécharger'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
