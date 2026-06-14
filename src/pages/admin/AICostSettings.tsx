import { useState, useEffect, useCallback } from 'react';
import { Bot, RefreshCw, TrendingUp, Hash, DollarSign, AlertCircle, CheckCircle } from 'lucide-react';
import { api } from '../../api/client';

interface AiModel {
  id: string;
  displayName: string;
  inputPerMTok: number | null;
  outputPerMTok: number | null;
  pricingKnown: boolean;
}

interface ModelsResponse {
  models: AiModel[];
  pricingUpdatedAt: string;
}

interface AiStats {
  totals: { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
  thisMonth: { costUsd: number; calls: number };
  monthly: { month: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number }[];
  byFunction: { functionType: string; calls: number; costUsd: number }[];
  byModel: { model: string; calls: number; costUsd: number }[];
}

const FUNCTION_LABELS: Record<string, string> = {
  recognize_expense: 'Notes de frais',
  recognize_document: 'Documents RH',
};

function fmtUsd(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' $';
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + ' k';
  return String(n);
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-');
  const date = new Date(Number(y), Number(m) - 1);
  return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

export default function AICostSettings() {
  const [stats, setStats]           = useState<AiStats | null>(null);
  const [models, setModels]         = useState<AiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [pricingDate, setPricingDate]     = useState<string>('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingStats, setLoadingStats]   = useState(false);
  const [saving, setSaving]               = useState(false);
  const [modelsError, setModelsError]     = useState<string | null>(null);
  const [savedOk, setSavedOk]             = useState(false);

  const loadModels = useCallback(async () => {
    setLoadingModels(true);
    setModelsError(null);
    try {
      const data = await api.get<ModelsResponse>('/ai-costs/models');
      setModels(data.models);
      setPricingDate(data.pricingUpdatedAt);
    } catch (err: unknown) {
      setModelsError(err instanceof Error ? err.message : 'Erreur lors de la vérification des tarifs');
    } finally {
      setLoadingModels(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const data = await api.get<AiStats>('/ai-costs/stats');
      setStats(data);
    } catch {
      // silently ignore — stats are non-critical
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const data = await api.get<{ model: string }>('/ai-costs/config');
      setSelectedModel(data.model);
    } catch {
      setSelectedModel('claude-opus-4-5');
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadStats();
    loadModels(); // vérification automatique des tarifs à l'ouverture
  }, [loadConfig, loadStats, loadModels]);

  const handleModelChange = async (model: string) => {
    setSelectedModel(model);
    setSaving(true);
    setSavedOk(false);
    try {
      await api.put('/ai-costs/config', { model });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } catch {
      // revert
      loadConfig();
    } finally {
      setSaving(false);
    }
  };

  const currentModel = models.find(m => m.id === selectedModel);

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-semibold text-gray-800">Coût IA</h2>
        <p className="text-sm text-gray-400">Reconnaissance automatique des documents et notes de frais.</p>
      </div>

      <div className="max-w-3xl space-y-6">

        {/* Modèle */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Bot size={18} />
              Modèle utilisé
            </h3>
            <button
              onClick={loadModels}
              disabled={loadingModels}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              <RefreshCw size={13} className={loadingModels ? 'animate-spin' : ''} />
              {loadingModels ? 'Vérification…' : 'Vérifier les tarifs Anthropic'}
            </button>
          </div>

          {modelsError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle size={15} />
              {modelsError}
            </div>
          )}

          {savedOk && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center gap-2">
              <CheckCircle size={15} />
              Modèle mis à jour.
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="label">Modèle de reconnaissance</label>
              <select
                className="input"
                value={selectedModel}
                onChange={e => handleModelChange(e.target.value)}
                disabled={saving || loadingModels || models.length === 0}
              >
                {models.length === 0 && (
                  <option value={selectedModel}>{selectedModel}</option>
                )}
                {models.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                    {m.pricingKnown
                      ? ` — entrée ${m.inputPerMTok} $/MTok · sortie ${m.outputPerMTok} $/MTok`
                      : ' — tarif inconnu'}
                  </option>
                ))}
              </select>
            </div>

            {currentModel && currentModel.pricingKnown && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <p className="text-gray-500 text-xs mb-0.5">Tokens d'entrée</p>
                  <p className="font-semibold text-gray-800">{currentModel.inputPerMTok} $ / million</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <p className="text-gray-500 text-xs mb-0.5">Tokens de sortie</p>
                  <p className="font-semibold text-gray-800">{currentModel.outputPerMTok} $ / million</p>
                </div>
              </div>
            )}

            {pricingDate && (
              <p className="text-xs text-gray-400">
                Tarifs vérifiés le {new Date(pricingDate).toLocaleDateString('fr-FR')} · Liste des modèles récupérée depuis l'API Anthropic.
              </p>
            )}
          </div>
        </div>

        {/* Cartes de synthèse */}
        {loadingStats ? (
          <div className="text-sm text-gray-400">Chargement des statistiques…</div>
        ) : stats && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign size={16} className="text-tennis-green" />
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Coût total</span>
                </div>
                <p className="text-2xl font-bold text-gray-800">{fmtUsd(stats.totals.costUsd)}</p>
                <p className="text-xs text-gray-400 mt-1">{stats.totals.calls} appel{stats.totals.calls !== 1 ? 's' : ''} au total</p>
              </div>

              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={16} className="text-blue-500" />
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Ce mois-ci</span>
                </div>
                <p className="text-2xl font-bold text-gray-800">{fmtUsd(stats.thisMonth.costUsd)}</p>
                <p className="text-xs text-gray-400 mt-1">{stats.thisMonth.calls} appel{stats.thisMonth.calls !== 1 ? 's' : ''}</p>
              </div>

              <div className="card">
                <div className="flex items-center gap-2 mb-1">
                  <Hash size={16} className="text-purple-500" />
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Tokens</span>
                </div>
                <p className="text-2xl font-bold text-gray-800">{fmtTokens(stats.totals.inputTokens + stats.totals.outputTokens)}</p>
                <p className="text-xs text-gray-400 mt-1">entrée {fmtTokens(stats.totals.inputTokens)} · sortie {fmtTokens(stats.totals.outputTokens)}</p>
              </div>
            </div>

            {/* Répartition par fonction */}
            {stats.byFunction.length > 0 && (
              <div className="card">
                <h3 className="font-semibold text-gray-800 mb-4">Répartition par usage</h3>
                <div className="space-y-2">
                  {stats.byFunction.map(f => (
                    <div key={f.functionType} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm text-gray-700">{FUNCTION_LABELS[f.functionType] ?? f.functionType}</span>
                      <div className="flex items-center gap-6 text-sm">
                        <span className="text-gray-500">{f.calls} appel{f.calls !== 1 ? 's' : ''}</span>
                        <span className="font-medium text-gray-800 w-28 text-right">{fmtUsd(f.costUsd)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Historique mensuel */}
            {stats.monthly.length > 0 && (
              <div className="card">
                <h3 className="font-semibold text-gray-800 mb-4">Historique mensuel</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                        <th className="text-left pb-2 font-medium">Mois</th>
                        <th className="text-right pb-2 font-medium">Appels</th>
                        <th className="text-right pb-2 font-medium">Tokens entrée</th>
                        <th className="text-right pb-2 font-medium">Tokens sortie</th>
                        <th className="text-right pb-2 font-medium">Coût (USD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.monthly.map(r => (
                        <tr key={r.month} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 text-gray-700 capitalize">{fmtMonth(r.month)}</td>
                          <td className="py-2 text-right text-gray-600">{r.calls}</td>
                          <td className="py-2 text-right text-gray-600">{fmtTokens(r.inputTokens)}</td>
                          <td className="py-2 text-right text-gray-600">{fmtTokens(r.outputTokens)}</td>
                          <td className="py-2 text-right font-medium text-gray-800">{fmtUsd(r.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {stats.monthly.length === 0 && stats.totals.calls === 0 && (
              <div className="card text-center py-10 text-gray-400 text-sm">
                Aucun appel IA enregistré pour le moment.<br />
                Les coûts apparaîtront ici dès la première reconnaissance de document.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
