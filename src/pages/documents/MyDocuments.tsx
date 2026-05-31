import { useState } from 'react';
import { FileText, Download, Search, ChevronDown, Calendar, Tag } from 'lucide-react';
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

// Couleurs par type de document
const DOCUMENT_TYPE_COLORS: Record<string, string> = {
  'fiche de paie':    'bg-emerald-50 text-emerald-700 border-emerald-200',
  'contrat de travail': 'bg-blue-50 text-blue-700 border-blue-200',
  avenant:            'bg-violet-50 text-violet-700 border-violet-200',
  attestation:        'bg-amber-50 text-amber-700 border-amber-200',
  certificat:         'bg-sky-50 text-sky-700 border-sky-200',
  autre:              'bg-gray-100 text-gray-600 border-gray-200',
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

  // Années distinctes
  const years = Array.from(
    new Set(
      documents
        .filter(d => d.userId === currentUser?.id && d.status === 'validated')
        .map(d => new Date(d.periodStart || d.createdAt).getFullYear().toString())
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
    const opts: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
    const start = new Date(periodStart + 'T00:00:00').toLocaleDateString('fr-FR', opts);
    if (!periodEnd) return start;
    const end = new Date(periodEnd + 'T00:00:00').toLocaleDateString('fr-FR', opts);
    return start === end ? start : `${start} – ${end}`;
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
              : "Vos documents apparaîtront ici une fois validés par l'administration."}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Document</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Période</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">Mis à disposition</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {myDocs.map((doc, i) => {
                const period = formatPeriod(doc.periodStart, doc.periodEnd);
                const addedDate = new Date(doc.validatedAt || doc.createdAt).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'long', year: 'numeric',
                });
                const typeColor = DOCUMENT_TYPE_COLORS[doc.documentType] || DOCUMENT_TYPE_COLORS['autre'];

                return (
                  <tr
                    key={doc.id}
                    className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${
                      i % 2 === 0 ? '' : 'bg-gray-50/40'
                    }`}
                  >
                    {/* Nom du fichier */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-tennis-green/10 flex-shrink-0">
                          <FileText size={16} className="text-tennis-green" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate max-w-[200px] sm:max-w-[280px]" title={doc.fileName}>
                            {doc.fileName}
                          </p>
                          {/* Type + période sur mobile (colonnes masquées) */}
                          <div className="flex flex-wrap items-center gap-2 mt-0.5 sm:hidden">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${typeColor}`}>
                              <Tag size={10} />
                              {DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}
                            </span>
                            {period && (
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <Calendar size={11} />
                                {period}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3 hidden sm:table-cell whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${typeColor}`}>
                        {DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}
                      </span>
                    </td>

                    {/* Période */}
                    <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap text-gray-600">
                      {period ? (
                        <span className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-gray-400 flex-shrink-0" />
                          {period}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Date de mise à disposition */}
                    <td className="px-4 py-3 hidden lg:table-cell whitespace-nowrap text-gray-500">
                      {addedDate}
                    </td>

                    {/* Téléchargement */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDownload(doc.id, doc.fileName)}
                        disabled={downloading === doc.id}
                        className="btn-primary inline-flex items-center gap-1.5 text-xs py-1.5 px-3 whitespace-nowrap"
                        title={`Télécharger ${doc.fileName}`}
                      >
                        <Download size={13} />
                        {downloading === doc.id ? 'En cours…' : 'Télécharger'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
            {myDocs.length} document{myDocs.length > 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
