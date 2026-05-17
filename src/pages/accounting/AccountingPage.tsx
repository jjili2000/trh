import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Pencil,
  Trash2,
  Plus,
  X,
  Check,
  Upload,
  RefreshCw,
  ChevronDown,
  Wand2,
  Calendar,
} from 'lucide-react';
import { api } from '../../api/client';
import {
  AccountingPeriod,
  BankImport,
  BankOperation,
  AccountingRule,
  RuleCondition,
  RuleField,
  RuleOperator,
  PaymentMethod,
} from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<RuleField, string> = {
  rawLabel: 'Libellé brut',
  thirdParty: 'Tiers',
  blockMDT: 'Bloc MDT',
  blockLIB: 'Bloc LIB',
  blockMOTIF: 'Bloc MOTIF',
  blockRNF: 'Bloc RNF',
  paymentMethod: 'Mode de paiement',
  direction: 'Sens',
};

const OPERATOR_LABELS: Record<RuleOperator, string> = {
  contains: 'contient',
  equals: 'est égal à',
  startsWith: 'commence par',
  endsWith: 'se termine par',
  notContains: 'ne contient pas',
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: 'Carte',
  transfer: 'Virement',
  direct_debit: 'Prélèvement',
  check: 'Chèque',
  cash: 'Espèces',
  other: 'Autre',
};

const ALL_FIELDS: RuleField[] = ['rawLabel', 'thirdParty', 'blockMDT', 'blockLIB', 'blockMOTIF', 'blockRNF', 'paymentMethod', 'direction'];
const ALL_OPERATORS: RuleOperator[] = ['contains', 'equals', 'startsWith', 'endsWith', 'notContains'];

function fmtCurrency(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Category Popover ─────────────────────────────────────────────────────────

interface CategoryPopoverProps {
  current: string | null;
  categories: string[];
  onSave: (cat: string | null) => void;
  onClose: () => void;
}

function CategoryPopover({ current, categories, onSave, onClose }: CategoryPopoverProps) {
  const [input, setInput] = useState(current || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = categories.filter(c =>
    c.toLowerCase().includes(input.toLowerCase())
  );

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { onSave(input.trim() || null); }
    if (e.key === 'Escape') { onClose(); }
  };

  return (
    <div className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-64 top-full left-0 mt-1">
      <input
        ref={inputRef}
        className="input text-sm mb-2"
        placeholder="Catégorie…"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
      />
      {filtered.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2 max-h-28 overflow-y-auto">
          {filtered.map(c => (
            <button
              key={c}
              className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-tennis-green hover:text-white rounded-full transition-colors"
              onClick={() => { setInput(c); onSave(c); }}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2 justify-between">
        <button
          className="text-xs text-gray-400 hover:text-red-500"
          onClick={() => onSave(null)}
        >
          Effacer
        </button>
        <div className="flex gap-1">
          <button className="btn-secondary text-xs py-0.5 px-2" onClick={onClose}>
            <X size={12} />
          </button>
          <button className="btn-primary text-xs py-0.5 px-2" onClick={() => onSave(input.trim() || null)}>
            <Check size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Rule Tooltip ─────────────────────────────────────────────────────────────

function RuleTooltip({ ruleName, children }: { ruleName: string; children: React.ReactNode }) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const [visible, setVisible] = useState(false);

  const show = () => { timerRef.current = setTimeout(() => setVisible(true), 500); };
  const hide = () => { clearTimeout(timerRef.current); setVisible(false); };

  return (
    <div className="relative inline-block" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 text-xs bg-gray-800 text-white rounded whitespace-nowrap shadow-lg pointer-events-none">
          Règle : {ruleName}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-800" />
        </div>
      )}
    </div>
  );
}

// ─── Create Rule From Operation Modal ────────────────────────────────────────

function initConditionsFromOp(op: BankOperation): RuleCondition[] {
  const conds: RuleCondition[] = [];
  if (op.thirdParty)   conds.push({ field: 'thirdParty',  operator: 'contains', value: op.thirdParty });
  if (op.blockLIB)     conds.push({ field: 'blockLIB',    operator: 'contains', value: op.blockLIB });
  if (op.blockMOTIF)   conds.push({ field: 'blockMOTIF',  operator: 'contains', value: op.blockMOTIF });
  if (op.blockMDT)     conds.push({ field: 'blockMDT',    operator: 'contains', value: op.blockMDT });
  if (op.blockRNF)     conds.push({ field: 'blockRNF',    operator: 'contains', value: op.blockRNF });
  if (op.paymentMethod && op.paymentMethod !== 'other') {
    conds.push({ field: 'paymentMethod', operator: 'equals', value: op.paymentMethod });
  }
  // Fallback : libellé brut si aucune info structurée
  if (conds.length === 0 && op.rawLabel) {
    conds.push({ field: 'rawLabel', operator: 'contains', value: op.rawLabel.slice(0, 60).trim() });
  }
  return conds.length > 0 ? conds : [emptyCondition()];
}

interface CreateRuleFromOpModalProps {
  op: BankOperation;
  categories: string[];
  onClose: () => void;
  onCreated: () => void;
}

function CreateRuleFromOpModal({ op, categories, onClose, onCreated }: CreateRuleFromOpModalProps) {
  const defaultLabel = op.thirdParty || op.blockLIB || op.blockMOTIF || '';
  const [label, setLabel]                       = useState(defaultLabel);
  const [category, setCategory]                 = useState(op.category || '');
  const [condOperator, setCondOperator]         = useState<'AND' | 'OR'>('AND');
  const [conditions, setConditions]             = useState<RuleCondition[]>(() => initConditionsFromOp(op));
  const [saving, setSaving]                     = useState(false);
  const [applyResult, setApplyResult]           = useState<string | null>(null);
  const [showCatSuggestions, setShowCatSuggestions] = useState(false);

  const catSuggestions = category.trim()
    ? categories.filter(c => c.toLowerCase().includes(category.toLowerCase()))
    : categories;

  const updateCond  = (idx: number, patch: Partial<RuleCondition>) =>
    setConditions(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  const removeCond  = (idx: number) =>
    setConditions(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    const validConds = conditions.filter(c => c.value.trim());
    if (!label.trim() || !category.trim() || validConds.length === 0) return;
    setSaving(true);
    try {
      const newRule = await api.post<{ id: string }>('/accounting/rules', {
        label: label.trim(),
        conditionOperator: condOperator,
        category: category.trim(),
        priority: 0,
        conditions: validConds,
      });
      const result = await api.post<{ updated: number; updatedByRule: number }>('/accounting/rules/apply-all', { ruleId: newRule.id });
      setApplyResult(`Règle créée — ${result.updatedByRule} opération(s) catégorisée(s)`);
      onCreated();
      setTimeout(onClose, 1800);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">

        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Wand2 size={17} className="text-tennis-green" />
            <h2 className="font-semibold text-gray-800">Nouvelle règle depuis cette opération</h2>
          </div>
          <button className="text-gray-400 hover:text-gray-600" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Résumé de l'opération */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5 text-sm min-w-0">
              <div className="flex gap-2">
                <span className="text-gray-400 text-xs w-16 flex-shrink-0 pt-px">Date</span>
                <span className="text-gray-600">{fmtDate(op.operationDate)}</span>
              </div>
              {op.thirdParty && (
                <div className="flex gap-2">
                  <span className="text-gray-400 text-xs w-16 flex-shrink-0 pt-px">Tiers</span>
                  <span className="text-gray-800 font-medium truncate">{op.thirdParty}</span>
                </div>
              )}
              {op.rawLabel && (
                <div className="flex gap-2">
                  <span className="text-gray-400 text-xs w-16 flex-shrink-0 pt-px">Libellé</span>
                  <span className="text-gray-500 text-xs truncate max-w-xs" title={op.rawLabel}>{op.rawLabel}</span>
                </div>
              )}
            </div>
            <span className={`text-sm font-bold whitespace-nowrap px-2.5 py-1 rounded-full flex-shrink-0 ${
              op.direction === 'credit' ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
            }`}>
              {op.direction === 'credit' ? '+' : '−'}{fmtCurrency(op.amount)}
            </span>
          </div>
        </div>

        {/* Formulaire */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {applyResult && (
            <div className="p-2.5 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm text-center font-medium">
              ✓ {applyResult}
            </div>
          )}

          <div>
            <label className="label">Libellé de la règle *</label>
            <input
              className="input text-sm"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Nom de la règle"
              autoFocus
            />
          </div>

          <div>
            <label className="label">Catégorie à assigner *</label>
            <div className="relative">
              <input
                className="input text-sm"
                value={category}
                onChange={e => { setCategory(e.target.value); setShowCatSuggestions(true); }}
                onFocus={() => setShowCatSuggestions(true)}
                onBlur={() => setTimeout(() => setShowCatSuggestions(false), 150)}
                placeholder="Catégorie…"
              />
              {showCatSuggestions && catSuggestions.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-36 overflow-y-auto">
                  {catSuggestions.map(c => (
                    <button
                      key={c}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                      onMouseDown={() => { setCategory(c); setShowCatSuggestions(false); }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Conditions</label>
              <div className="flex gap-3">
                {(['AND', 'OR'] as const).map(op => (
                  <label key={op} className="flex items-center gap-1 cursor-pointer text-xs text-gray-600">
                    <input
                      type="radio"
                      name="condOpModal"
                      checked={condOperator === op}
                      onChange={() => setCondOperator(op)}
                    />
                    {op === 'AND' ? 'Toutes (ET)' : 'Au moins une (OU)'}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {conditions.map((cond, idx) => (
                <div key={idx} className="flex gap-1.5 items-center">
                  <select
                    className="input text-xs py-1.5 flex-1 min-w-0"
                    value={cond.field}
                    onChange={e => updateCond(idx, { field: e.target.value as RuleField })}
                  >
                    {ALL_FIELDS.map(f => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                  </select>
                  <select
                    className="input text-xs py-1.5 w-32 flex-shrink-0"
                    value={cond.operator}
                    onChange={e => updateCond(idx, { operator: e.target.value as RuleOperator })}
                  >
                    {ALL_OPERATORS.map(o => <option key={o} value={o}>{OPERATOR_LABELS[o]}</option>)}
                  </select>
                  <input
                    className="input text-xs py-1.5 flex-1 min-w-0"
                    value={cond.value}
                    onChange={e => updateCond(idx, { value: e.target.value })}
                    placeholder="Valeur"
                  />
                  {conditions.length > 1 && (
                    <button
                      className="text-gray-300 hover:text-red-500 flex-shrink-0 transition-colors"
                      onClick={() => removeCond(idx)}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              className="mt-2 text-xs text-tennis-green hover:underline flex items-center gap-1"
              onClick={() => setConditions(prev => [...prev, emptyCondition()])}
            >
              <Plus size={12} /> Ajouter une condition
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <button className="btn-secondary flex-1" onClick={onClose}>Annuler</button>
          <button
            className="btn-primary flex-1 flex items-center justify-center gap-2"
            onClick={handleSave}
            disabled={saving || !label.trim() || !category.trim() || conditions.filter(c => c.value.trim()).length === 0}
          >
            <Wand2 size={15} />
            {saving ? 'Création…' : 'Créer et appliquer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Operations Tab ───────────────────────────────────────────────────────────

interface OperationsTabProps {
  imports: BankImport[];
  periods: AccountingPeriod[];
  categories: string[];
  onCategoriesChange: () => void;
  onDeleteAll: () => void;
}

function OperationsTab({ imports, periods, categories, onCategoriesChange, onDeleteAll }: OperationsTabProps) {
  const [operations, setOperations] = useState<BankOperation[]>([]);
  const [loading, setLoading] = useState(false);
  const [applyingRules, setApplyingRules] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [ruleModalOp, setRuleModalOp] = useState<BankOperation | null>(null);

  // Filters
  const [filterPeriod, setFilterPeriod] = useState('');
  const [filterImport, setFilterImport] = useState('');
  const [filterDirection, setFilterDirection] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterUncategorized, setFilterUncategorized] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterPeriod)    params.set('periodId', filterPeriod);
      if (filterImport)    params.set('importId', filterImport);
      if (filterDirection) params.set('direction', filterDirection);
      if (filterMethod)    params.set('paymentMethod', filterMethod);
      if (filterCategory)  params.set('category', filterCategory);
      if (filterSearch)    params.set('search', filterSearch);
      const data = await api.get<BankOperation[]>(`/accounting/operations?${params.toString()}`);
      setOperations(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filterPeriod, filterImport, filterDirection, filterMethod, filterCategory, filterSearch]);

  useEffect(() => { load(); }, [load]);

  const handleApplyRules = async () => {
    setApplyingRules(true);
    setApplyMsg(null);
    try {
      const result = await api.post<{ updated: number }>('/accounting/rules/apply-all', {});
      setApplyMsg(`${result.updated} opération(s) mise(s) à jour`);
      await load();
      onCategoriesChange();
    } catch {
      setApplyMsg('Erreur lors de l\'application des règles');
    } finally {
      setApplyingRules(false);
      setTimeout(() => setApplyMsg(null), 4000);
    }
  };

  const handleSaveCategory = async (opId: string, category: string | null) => {
    try {
      const updated = await api.put<BankOperation>(`/accounting/operations/${opId}`, {
        category,
        categorySource: 'manual',
      });
      setOperations(prev => prev.map(op => op.id === opId ? updated : op));
      setEditingCategoryId(null);
      onCategoriesChange();
    } catch {
      // silent
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Supprimer toutes les opérations et tous les imports ? Cette action est irréversible.')) return;
    try {
      await api.delete('/accounting/operations');
      setOperations([]);
      onDeleteAll();
    } catch {
      // silent
    }
  };

  const categoryColor = (source: string) => {
    if (source === 'manual') return 'bg-blue-100 text-blue-700';
    if (source === 'rule') return 'bg-purple-100 text-purple-700';
    return 'bg-gray-100 text-gray-500';
  };

  const displayedOps = filterUncategorized ? operations.filter(op => !op.category) : operations;

  // Lookup map importId → label pour affichage dans la table
  const importLabelMap = new Map(imports.map(imp => [imp.id, imp.label]));

  // Total absolu toutes opérations confondues (hors filtres)
  const totalOps = imports.reduce((s, imp) => s + imp.operationCount, 0);

  return (
    <div>
      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <select
            className="input text-sm py-1.5 w-auto"
            value={filterImport}
            onChange={e => setFilterImport(e.target.value)}
          >
            <option value="">Tous les imports</option>
            {imports.map(imp => (
              <option key={imp.id} value={imp.id}>{imp.label} ({imp.operationCount} ops)</option>
            ))}
          </select>

          <select
            className="input text-sm py-1.5 w-auto"
            value={filterPeriod}
            onChange={e => { setFilterPeriod(e.target.value); setFilterImport(''); }}
          >
            <option value="">Toutes les périodes</option>
            {periods.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>

          <select
            className="input text-sm py-1.5 w-auto"
            value={filterDirection}
            onChange={e => setFilterDirection(e.target.value)}
          >
            <option value="">Tous sens</option>
            <option value="credit">Crédit</option>
            <option value="debit">Débit</option>
          </select>

          <select
            className="input text-sm py-1.5 w-auto"
            value={filterMethod}
            onChange={e => setFilterMethod(e.target.value)}
          >
            <option value="">Tous modes</option>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <select
            className="input text-sm py-1.5 w-auto"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
          >
            <option value="">Toutes catégories</option>
            <option value="__none__">Sans catégorie</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <input
            className="input text-sm py-1.5 flex-1 min-w-[140px]"
            placeholder="Rechercher…"
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
          />

          {/* Switch: sans catégorie uniquement */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <button
              type="button"
              role="switch"
              aria-checked={filterUncategorized}
              onClick={() => setFilterUncategorized(v => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors focus:outline-none ${
                filterUncategorized ? 'bg-tennis-green' : 'bg-gray-200'
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                filterUncategorized ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
            Sans catégorie
          </label>

          <button
            className="btn-secondary flex items-center gap-1.5 text-sm"
            onClick={handleApplyRules}
            disabled={applyingRules}
          >
            <RefreshCw size={14} className={applyingRules ? 'animate-spin' : ''} />
            Appliquer les règles
          </button>

          <button
            className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-lg px-3 py-1.5 transition-colors"
            onClick={handleDeleteAll}
            title="Supprimer toutes les opérations"
          >
            <Trash2 size={14} />
            Tout supprimer
          </button>
        </div>
        {applyMsg && (
          <p className="mt-2 text-sm text-tennis-green font-medium">{applyMsg}</p>
        )}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Chargement…</div>
        ) : displayedOps.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Aucune opération</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Compte</th>
                  <th className="px-4 py-2.5">Sens</th>
                  <th className="px-4 py-2.5">Mode</th>
                  <th className="px-4 py-2.5 text-right">Montant</th>
                  <th className="px-4 py-2.5">Tiers / Libellé</th>
                  <th className="px-4 py-2.5">Catégorie</th>
                  <th className="px-2 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {displayedOps.map(op => (
                  <tr key={op.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-2 whitespace-nowrap">
                      <p className="text-sm text-gray-700">{fmtDate(op.operationDate)}</p>
                      {op.periodLabel && (
                        <p className="text-xs text-indigo-600 mt-0.5 flex items-center gap-0.5">
                          <Calendar size={10} />{op.periodLabel}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap">
                        {importLabelMap.get(op.importId) ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {op.direction === 'credit' ? (
                        <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Crédit</span>
                      ) : (
                        <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Débit</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {PAYMENT_METHOD_LABELS[op.paymentMethod] || op.paymentMethod}
                    </td>
                    <td className={`px-4 py-2 text-sm font-semibold text-right whitespace-nowrap ${
                      op.direction === 'credit' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {op.direction === 'debit' ? '-' : '+'}{fmtCurrency(op.amount)}
                    </td>
                    <td className="px-4 py-2 max-w-xs">
                      {op.thirdParty && (
                        <p className="text-sm font-medium text-gray-800 truncate">{op.thirdParty}</p>
                      )}
                      {op.rawLabel && (
                        <p className="text-xs text-gray-400 truncate" title={op.rawLabel}>
                          {op.rawLabel.length > 60 ? op.rawLabel.slice(0, 60) + '…' : op.rawLabel}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {op.blockMDT && (
                          <span className="text-xs bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded">
                            MDT: {op.blockMDT.length > 40 ? op.blockMDT.slice(0, 40) + '…' : op.blockMDT}
                          </span>
                        )}
                        {op.blockLIB && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                            LIB: {op.blockLIB.length > 40 ? op.blockLIB.slice(0, 40) + '…' : op.blockLIB}
                          </span>
                        )}
                        {op.blockMOTIF && (
                          <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
                            MOTIF: {op.blockMOTIF.length > 40 ? op.blockMOTIF.slice(0, 40) + '…' : op.blockMOTIF}
                          </span>
                        )}
                        {op.blockRNF && (
                          <span className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                            RNF: {op.blockRNF.length > 40 ? op.blockRNF.slice(0, 40) + '…' : op.blockRNF}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="relative">
                        <div className="flex items-center gap-1">
                          {op.category ? (
                            op.categorySource === 'rule' && op.ruleName ? (
                              <RuleTooltip ruleName={op.ruleName}>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-default ${categoryColor(op.categorySource)}`}>
                                  {op.category}
                                </span>
                              </RuleTooltip>
                            ) : (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor(op.categorySource)}`}>
                                {op.category}
                              </span>
                            )
                          ) : (
                            <span className="text-xs text-gray-300 italic">—</span>
                          )}
                          <button
                            className="text-gray-300 hover:text-gray-600 transition-colors"
                            onClick={() => setEditingCategoryId(editingCategoryId === op.id ? null : op.id)}
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                        {editingCategoryId === op.id && (
                          <CategoryPopover
                            current={op.category}
                            categories={categories}
                            onSave={(cat) => handleSaveCategory(op.id, cat)}
                            onClose={() => setEditingCategoryId(null)}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        className="text-gray-300 hover:text-tennis-green transition-colors"
                        title="Créer une règle depuis cette opération"
                        onClick={() => setRuleModalOp(op)}
                      >
                        <Wand2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-2 text-right">
        {displayedOps.length !== totalOps
          ? `${displayedOps.length} / ${totalOps} opération(s)`
          : `${totalOps} opération(s)`}
      </p>

      {ruleModalOp && (
        <CreateRuleFromOpModal
          op={ruleModalOp}
          categories={categories}
          onClose={() => setRuleModalOp(null)}
          onCreated={() => { load(); onCategoriesChange(); }}
        />
      )}
    </div>
  );
}

// ─── Rules Tab ────────────────────────────────────────────────────────────────

interface RulesTabProps {
  categories: string[];
  onCategoriesChange: () => void;
}

const emptyCondition = (): RuleCondition => ({ field: 'rawLabel', operator: 'contains', value: '' });

interface RuleFormState {
  label: string;
  conditionOperator: 'AND' | 'OR';
  category: string;
  priority: string;
  conditions: RuleCondition[];
}

const emptyRuleForm = (): RuleFormState => ({
  label: '',
  conditionOperator: 'AND',
  category: '',
  priority: '0',
  conditions: [emptyCondition()],
});

function RulesTab({ categories, onCategoriesChange }: RulesTabProps) {
  const [rules, setRules] = useState<AccountingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<AccountingRule | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState<RuleFormState>(emptyRuleForm());
  const [saving, setSaving] = useState(false);
  const [catInput, setCatInput] = useState('');
  const [catSuggestions, setCatSuggestions] = useState<string[]>([]);

  // Multi-select for bulk delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const allSelected = rules.length > 0 && selectedIds.size === rules.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleRule = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rules.map(r => r.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Supprimer ${selectedIds.size} règle(s) ?`)) return;
    try {
      await api.delete('/accounting/rules/bulk', { ids: Array.from(selectedIds) });
      setRules(prev => prev.filter(r => !selectedIds.has(r.id)));
      setSelectedIds(new Set());
    } catch {
      // silent
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<AccountingRule[]>('/accounting/rules');
      setRules(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (catInput.trim()) {
      const q = catInput.toLowerCase();
      setCatSuggestions(categories.filter(c => c.toLowerCase().includes(q)));
    } else {
      setCatSuggestions(categories);
    }
  }, [catInput, categories]);

  const openNew = () => {
    setEditingRule(null);
    const f = emptyRuleForm();
    setForm(f);
    setCatInput('');
    setShowEditor(true);
  };

  const openEdit = (rule: AccountingRule) => {
    setEditingRule(rule);
    setForm({
      label: rule.label,
      conditionOperator: rule.conditionOperator,
      category: rule.category,
      priority: String(rule.priority),
      conditions: rule.conditions.length > 0 ? rule.conditions : [emptyCondition()],
    });
    setCatInput(rule.category);
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditingRule(null);
    setForm(emptyRuleForm());
    setCatInput('');
  };

  const handleSave = async () => {
    if (!form.label.trim() || !form.category.trim()) return;
    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        conditionOperator: form.conditionOperator,
        category: form.category.trim(),
        priority: parseInt(form.priority) || 0,
        conditions: form.conditions.filter(c => c.value.trim()),
      };
      if (editingRule) {
        await api.put(`/accounting/rules/${editingRule.id}`, payload);
      } else {
        await api.post('/accounting/rules', payload);
      }
      await load();
      onCategoriesChange();
      closeEditor();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette règle ?')) return;
    try {
      await api.delete(`/accounting/rules/${id}`);
      setRules(prev => prev.filter(r => r.id !== id));
    } catch {
      // silent
    }
  };

  const updateCondition = (idx: number, patch: Partial<RuleCondition>) => {
    setForm(prev => ({
      ...prev,
      conditions: prev.conditions.map((c, i) => i === idx ? { ...c, ...patch } : c),
    }));
  };

  const removeCondition = (idx: number) => {
    setForm(prev => ({ ...prev, conditions: prev.conditions.filter((_, i) => i !== idx) }));
  };

  const addCondition = () => {
    setForm(prev => ({ ...prev, conditions: [...prev.conditions, emptyCondition()] }));
  };

  return (
    <div className="flex gap-4 flex-col lg:flex-row">
      {/* List */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-700">Règles de catégorisation</h2>
            {selectedIds.size > 0 && (
              <button
                className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-lg px-2.5 py-1 transition-colors"
                onClick={handleDeleteSelected}
              >
                <Trash2 size={13} />
                Supprimer la sélection ({selectedIds.size})
              </button>
            )}
          </div>
          <button className="btn-primary flex items-center gap-1.5 text-sm" onClick={openNew}>
            <Plus size={14} /> Nouvelle règle
          </button>
        </div>
        {loading ? (
          <div className="card p-6 text-center text-gray-400 text-sm">Chargement…</div>
        ) : rules.length === 0 ? (
          <div className="card p-6 text-center text-gray-400 text-sm">
            Aucune règle. Créez votre première règle pour catégoriser automatiquement vos opérations.
          </div>
        ) : (
          <div className="space-y-2">
            {/* Select-all header row */}
            <div className="flex items-center gap-2 px-1 pb-1 border-b border-gray-100">
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleAll}
                className="w-4 h-4 rounded border-gray-300 text-tennis-green cursor-pointer"
                title="Tout sélectionner / désélectionner"
              />
              <span className="text-xs text-gray-400">
                {selectedIds.size === 0 ? 'Tout sélectionner' : `${selectedIds.size} sélectionnée(s)`}
              </span>
            </div>

            {rules.map(rule => (
              <div
                key={rule.id}
                className={`card flex items-start gap-3 transition-colors ${
                  selectedIds.has(rule.id) ? 'bg-blue-50 border-blue-200' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(rule.id)}
                  onChange={() => toggleRule(rule.id)}
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 text-tennis-green cursor-pointer flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-800">{rule.label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-tennis-green/10 text-tennis-green font-medium">
                      {rule.category}
                    </span>
                    <span className="text-xs text-gray-400">priorité: {rule.priority}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {rule.conditionOperator === 'AND' ? 'Toutes les conditions' : 'Au moins une condition'} :
                    {' '}
                    {rule.conditions.map(c =>
                      `${FIELD_LABELS[c.field]} ${OPERATOR_LABELS[c.operator]} "${c.value}"`
                    ).join(rule.conditionOperator === 'AND' ? ' ET ' : ' OU ')}
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button className="text-gray-400 hover:text-blue-500" onClick={() => openEdit(rule)}>
                    <Pencil size={14} />
                  </button>
                  <button className="text-gray-400 hover:text-red-500" onClick={() => handleDelete(rule.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor */}
      {showEditor && (
        <div className="w-full lg:w-96 flex-shrink-0">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">
                {editingRule ? 'Modifier la règle' : 'Nouvelle règle'}
              </h3>
              <button className="text-gray-400 hover:text-gray-600" onClick={closeEditor}>
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label">Libellé *</label>
                <input
                  className="input text-sm"
                  placeholder="Nom de la règle"
                  value={form.label}
                  onChange={e => setForm(prev => ({ ...prev, label: e.target.value }))}
                />
              </div>

              <div>
                <label className="label">Opérateur</label>
                <div className="flex gap-3">
                  {(['AND', 'OR'] as const).map(op => (
                    <label key={op} className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input
                        type="radio"
                        name="condOp"
                        value={op}
                        checked={form.conditionOperator === op}
                        onChange={() => setForm(prev => ({ ...prev, conditionOperator: op }))}
                      />
                      {op === 'AND' ? 'ET (toutes)' : 'OU (au moins une)'}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Conditions</label>
                <div className="space-y-2">
                  {form.conditions.map((cond, idx) => (
                    <div key={idx} className="flex gap-1 items-center">
                      <select
                        className="input text-xs py-1 flex-1"
                        value={cond.field}
                        onChange={e => updateCondition(idx, { field: e.target.value as RuleField })}
                      >
                        {ALL_FIELDS.map(f => (
                          <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                        ))}
                      </select>
                      <select
                        className="input text-xs py-1 flex-1"
                        value={cond.operator}
                        onChange={e => updateCondition(idx, { operator: e.target.value as RuleOperator })}
                      >
                        {ALL_OPERATORS.map(o => (
                          <option key={o} value={o}>{OPERATOR_LABELS[o]}</option>
                        ))}
                      </select>
                      <input
                        className="input text-xs py-1 flex-1"
                        placeholder="Valeur"
                        value={cond.value}
                        onChange={e => updateCondition(idx, { value: e.target.value })}
                      />
                      {form.conditions.length > 1 && (
                        <button className="text-gray-400 hover:text-red-500" onClick={() => removeCondition(idx)}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  className="mt-2 text-xs text-tennis-green hover:underline flex items-center gap-1"
                  onClick={addCondition}
                >
                  <Plus size={12} /> Ajouter une condition
                </button>
              </div>

              <div>
                <label className="label">Catégorie *</label>
                <div className="relative">
                  <input
                    className="input text-sm"
                    placeholder="Catégorie à assigner"
                    value={catInput}
                    onChange={e => {
                      setCatInput(e.target.value);
                      setForm(prev => ({ ...prev, category: e.target.value }));
                    }}
                  />
                  {catSuggestions.length > 0 && catInput && (
                    <div className="absolute z-10 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                      {catSuggestions.map(c => (
                        <button
                          key={c}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                          onClick={() => {
                            setCatInput(c);
                            setForm(prev => ({ ...prev, category: c }));
                          }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="label">Priorité</label>
                <input
                  type="number"
                  className="input text-sm"
                  value={form.priority}
                  onChange={e => setForm(prev => ({ ...prev, priority: e.target.value }))}
                  placeholder="0"
                />
                <p className="text-xs text-gray-400 mt-0.5">Valeur plus élevée = appliquée en premier</p>
              </div>

              <button
                className="btn-primary w-full mt-2"
                onClick={handleSave}
                disabled={saving || !form.label.trim() || !form.category.trim()}
              >
                {saving ? 'Enregistrement…' : editingRule ? 'Mettre à jour' : 'Créer la règle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Import Tab ───────────────────────────────────────────────────────────────

interface ImportTabProps {
  periods: AccountingPeriod[];
  onImportDone: () => void;
  onGoToOperations: () => void;
}

interface ColumnMapping {
  date: string;
  label: string;
  debit?: string;
  credit?: string;
  amount?: string;
  direction?: string;
}

interface PreviewData {
  headers: string[];
  rows: Record<string, string>[];
  detectedMapping: Partial<ColumnMapping>;
  totalRows: number;
}

interface ImportSummary {
  total: number;
  parsed: number;
  imported: number;
  skipped: number;
  invalid: number;
}

function ImportTab({ periods, onImportDone, onGoToOperations }: ImportTabProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [importLabel, setImportLabel] = useState('');
  // Period selection
  const [periodMode, setPeriodMode] = useState<'existing' | 'new'>('existing');
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [newPeriodLabel, setNewPeriodLabel] = useState('');
  const [newPeriodStart, setNewPeriodStart] = useState('');
  const [newPeriodEnd, setNewPeriodEnd] = useState('');
  const [resolvedPeriodId, setResolvedPeriodId] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({ date: '', label: '' });
  const [fileData, setFileData] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingConfirm, setLoadingConfirm] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = ev.target?.result as string;
      setFileData(data);
      try {
        const { rawRows } = await api.post<{ rawRows: string[][] }>(
          '/accounting/import/parse-file',
          { fileData: data, fileName: file.name }
        );
        setParsedRows(rawRows);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Impossible de lire le fichier');
        setParsedRows([]);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePreview = async () => {
    if (parsedRows.length === 0) { setError('Veuillez sélectionner un fichier'); return; }
    if (!importLabel.trim()) { setError('Veuillez entrer un libellé pour cet import'); return; }
    if (periodMode === 'existing' && !selectedPeriodId) { setError('Veuillez sélectionner une période comptable'); return; }
    if (periodMode === 'new' && (!newPeriodLabel.trim() || !newPeriodStart || !newPeriodEnd)) {
      setError('Veuillez renseigner le libellé, la date de début et la date de fin de la nouvelle période'); return;
    }
    setError(null);
    setLoadingPreview(true);
    try {
      // Créer la période si nécessaire
      let pid = selectedPeriodId;
      if (periodMode === 'new') {
        const created = await api.post<AccountingPeriod>('/accounting/periods', {
          label: newPeriodLabel.trim(), startDate: newPeriodStart, endDate: newPeriodEnd,
        });
        pid = created.id;
      }
      setResolvedPeriodId(pid);

      const data = await api.post<PreviewData>('/accounting/import/preview', {
        rawRows: parsedRows,
        filename: fileName,
      });
      setPreview(data);
      // Apply detected mapping
      setMapping({
        date: data.detectedMapping.date || '',
        label: data.detectedMapping.label || '',
        debit: data.detectedMapping.debit || '',
        credit: data.detectedMapping.credit || '',
        amount: data.detectedMapping.amount || '',
      });
      setStep(2);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Erreur lors de l\'analyse');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirm = async () => {
    if (!mapping.date || !mapping.label) {
      setError('La colonne date et la colonne libellé sont requises');
      return;
    }
    if (!mapping.debit && !mapping.credit && !mapping.amount) {
      setError('Au moins une colonne de montant est requise (débit, crédit ou montant)');
      return;
    }
    setError(null);
    setLoadingConfirm(true);
    try {
      const cleanMapping: ColumnMapping = { date: mapping.date, label: mapping.label };
      if (mapping.debit) cleanMapping.debit = mapping.debit;
      if (mapping.credit) cleanMapping.credit = mapping.credit;
      if (mapping.amount) cleanMapping.amount = mapping.amount;

      const result = await api.post<{ importId: string | null; total: number; parsed: number; imported: number; skipped: number; invalid: number }>('/accounting/import/confirm', {
        rawRows: parsedRows,
        fileData,
        filename: fileName,
        label: importLabel,
        mapping: cleanMapping,
        periodId: resolvedPeriodId,
      });
      setSummary({ total: result.total, parsed: result.parsed, imported: result.imported, skipped: result.skipped, invalid: result.invalid });
      setStep(3);
      if (result.imported > 0) onImportDone();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Erreur lors de l\'import');
    } finally {
      setLoadingConfirm(false);
    }
  };

  const reset = () => {
    setStep(1);
    setImportLabel('');
    setParsedRows([]);
    setFileName('');
    setFileData('');
    setPreview(null);
    setMapping({ date: '', label: '' });
    setSummary(null);
    setError(null);
    setPeriodMode('existing');
    setSelectedPeriodId('');
    setNewPeriodLabel('');
    setNewPeriodStart('');
    setNewPeriodEnd('');
    setResolvedPeriodId(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const headerOptions = (preview?.headers || []).map(h => (
    <option key={h} value={h}>{h}</option>
  ));

  return (
    <div className="max-w-3xl">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              step === s ? 'bg-tennis-green text-white' :
              step > s ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {step > s ? <Check size={14} /> : s}
            </div>
            {s < 3 && <div className={`w-8 h-0.5 ${step > s ? 'bg-green-500' : 'bg-gray-200'}`} />}
          </div>
        ))}
        <div className="ml-2 text-sm text-gray-500">
          {step === 1 && 'Sélection du fichier'}
          {step === 2 && 'Correspondance des colonnes'}
          {step === 3 && 'Import terminé'}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Step 1 */}
      {step === 1 && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-800">Importer un relevé bancaire</h2>

          {/* Période comptable */}
          <div>
            <label className="label">Période comptable *</label>
            <div className="flex gap-3 mb-2">
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input type="radio" name="periodMode" value="existing" checked={periodMode === 'existing'} onChange={() => setPeriodMode('existing')} />
                Période existante
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <input type="radio" name="periodMode" value="new" checked={periodMode === 'new'} onChange={() => setPeriodMode('new')} />
                Nouvelle période
              </label>
            </div>
            {periodMode === 'existing' && (
              <select className="input text-sm" value={selectedPeriodId} onChange={e => setSelectedPeriodId(e.target.value)}>
                <option value="">— Sélectionner une période —</option>
                {periods.map(p => (
                  <option key={p.id} value={p.id}>{p.label} ({p.startDate} → {p.endDate})</option>
                ))}
              </select>
            )}
            {periodMode === 'new' && (
              <div className="grid grid-cols-3 gap-2">
                <input className="input text-sm col-span-3 md:col-span-1" placeholder="Libellé de la période" value={newPeriodLabel} onChange={e => setNewPeriodLabel(e.target.value)} />
                <input type="date" className="input text-sm" value={newPeriodStart} onChange={e => setNewPeriodStart(e.target.value)} />
                <input type="date" className="input text-sm" value={newPeriodEnd} onChange={e => setNewPeriodEnd(e.target.value)} />
              </div>
            )}
          </div>

          <div>
            <label className="label">Libellé du compte *</label>
            <input
              className="input"
              placeholder="ex: Compte courant BNP 2025"
              value={importLabel}
              onChange={e => setImportLabel(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Fichier bancaire *</label>
            <input
              ref={fileRef}
              type="file"
              accept=".xls,.xlsx,.csv,.txt"
              className="input"
              onChange={handleFileChange}
            />
            <p className="text-xs text-gray-400 mt-1">Formats acceptés : XLS, XLSX, CSV, TXT (CIC, Crédit Mutuel, BNP, etc.)</p>
          </div>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={handlePreview}
            disabled={loadingPreview || parsedRows.length === 0 || !importLabel.trim()}
          >
            <Upload size={16} />
            {loadingPreview ? 'Analyse en cours…' : 'Analyser le fichier'}
          </button>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && preview && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-4">
              Correspondance des colonnes
              <span className="text-sm font-normal text-gray-400 ml-2">({preview.totalRows} lignes détectées)</span>
            </h2>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="label">Colonne Date *</label>
                <select className="input text-sm" value={mapping.date} onChange={e => setMapping(m => ({ ...m, date: e.target.value }))}>
                  <option value="">— Sélectionner —</option>
                  {headerOptions}
                </select>
              </div>
              <div>
                <label className="label">Colonne Libellé *</label>
                <select className="input text-sm" value={mapping.label} onChange={e => setMapping(m => ({ ...m, label: e.target.value }))}>
                  <option value="">— Sélectionner —</option>
                  {headerOptions}
                </select>
              </div>
              <div>
                <label className="label">Colonne Débit</label>
                <select className="input text-sm" value={mapping.debit || ''} onChange={e => setMapping(m => ({ ...m, debit: e.target.value, amount: '' }))}>
                  <option value="">— Aucune —</option>
                  {headerOptions}
                </select>
              </div>
              <div>
                <label className="label">Colonne Crédit</label>
                <select className="input text-sm" value={mapping.credit || ''} onChange={e => setMapping(m => ({ ...m, credit: e.target.value, amount: '' }))}>
                  <option value="">— Aucune —</option>
                  {headerOptions}
                </select>
              </div>
              <div>
                <label className="label">Colonne Montant unique</label>
                <select className="input text-sm" value={mapping.amount || ''} onChange={e => setMapping(m => ({ ...m, amount: e.target.value, debit: '', credit: '' }))}>
                  <option value="">— Aucune —</option>
                  {headerOptions}
                </select>
              </div>
            </div>

            <p className="text-xs text-gray-400 mb-3">
              Utilisez soit les colonnes Débit/Crédit séparées, soit une colonne Montant unique (positif=crédit, négatif=débit).
            </p>

            {/* Preview table */}
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Aperçu (5 premières lignes)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-gray-100 rounded">
                <thead className="bg-gray-50">
                  <tr>
                    {preview.headers.map(h => (
                      <th key={h} className="px-2 py-1.5 text-left font-semibold text-gray-500 border-b border-gray-100">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      {preview.headers.map(h => (
                        <td key={h} className="px-2 py-1.5 text-gray-700 max-w-[120px] truncate" title={row[h]}>
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button className="btn-secondary" onClick={() => setStep(1)}>
              Retour
            </button>
            <button
              className="btn-primary flex items-center gap-2"
              onClick={handleConfirm}
              disabled={loadingConfirm}
            >
              <Check size={16} />
              {loadingConfirm ? 'Import en cours…' : 'Confirmer l\'import'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && summary && (
        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${summary.imported > 0 ? 'bg-green-100' : 'bg-yellow-100'}`}>
              <Check size={24} className={summary.imported > 0 ? 'text-green-600' : 'text-yellow-600'} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">
                {summary.imported > 0 ? 'Import terminé' : 'Aucune nouvelle opération'}
              </h2>
              <p className="text-sm text-gray-500">
                {summary.imported > 0
                  ? `${summary.imported} opération(s) ajoutée(s) en base.`
                  : 'Toutes les opérations de ce fichier sont déjà présentes.'}
              </p>
            </div>
          </div>

          {/* Summary table */}
          <div className="rounded-lg border border-gray-100 overflow-hidden mb-5">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-2.5 text-gray-500">Lignes dans le fichier</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{summary.total}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-4 py-2.5 text-gray-500">Lignes valides (date + montant)</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{summary.parsed}</td>
                </tr>
                {summary.invalid > 0 && (
                  <tr className="border-b border-gray-100 bg-orange-50">
                    <td className="px-4 py-2.5 text-orange-600">Lignes ignorées (données invalides)</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-orange-600">{summary.invalid}</td>
                  </tr>
                )}
                {summary.skipped > 0 && (
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500">Doublons ignorés (déjà importés)</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-500">{summary.skipped}</td>
                  </tr>
                )}
                <tr className={summary.imported > 0 ? 'bg-green-50' : 'bg-yellow-50'}>
                  <td className={`px-4 py-2.5 font-medium ${summary.imported > 0 ? 'text-green-700' : 'text-yellow-700'}`}>
                    Opérations importées
                  </td>
                  <td className={`px-4 py-2.5 text-right font-bold text-lg ${summary.imported > 0 ? 'text-green-700' : 'text-yellow-700'}`}>
                    {summary.imported}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button className="btn-secondary" onClick={reset}>
              Nouvel import
            </button>
            {summary.imported > 0 && (
              <button className="btn-primary" onClick={onGoToOperations}>
                Voir les opérations
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Imports List ─────────────────────────────────────────────────────────────

interface ImportsListProps {
  imports: BankImport[];
  onDelete: (id: string) => void;
}

function ImportsList({ imports, onDelete }: ImportsListProps) {
  const [open, setOpen] = useState(false);

  if (imports.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-2"
        onClick={() => setOpen(o => !o)}
      >
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        {imports.length} import(s) existant(s)
      </button>
      {open && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="px-4 py-2">Libellé</th>
                <th className="px-4 py-2">Fichier</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2 text-right">Opérations</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {imports.map(imp => (
                <tr key={imp.id} className="border-b border-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{imp.label}</td>
                  <td className="px-4 py-2 text-gray-500">{imp.fileName}</td>
                  <td className="px-4 py-2 text-gray-500">{fmtDate(imp.importedAt)}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{imp.operationCount}</td>
                  <td className="px-4 py-2">
                    <button
                      className="text-gray-400 hover:text-red-500"
                      onClick={() => onDelete(imp.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Periods Tab ──────────────────────────────────────────────────────────────

interface PeriodsTabProps {
  periods: AccountingPeriod[];
  onPeriodsChange: () => void;
  onGoToImport: () => void;
  onGoToRules: () => void;
}

function PeriodsTab({ periods, onPeriodsChange, onGoToImport, onGoToRules }: PeriodsTabProps) {
  const [editing, setEditing] = useState<AccountingPeriod | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ label: '', startDate: '', endDate: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openNew = () => { setForm({ label: '', startDate: '', endDate: '' }); setEditing(null); setCreating(true); setError(null); };
  const openEdit = (p: AccountingPeriod) => { setForm({ label: p.label, startDate: p.startDate, endDate: p.endDate }); setEditing(p); setCreating(true); setError(null); };
  const closeForm = () => { setCreating(false); setEditing(null); setError(null); };

  const handleSave = async () => {
    if (!form.label.trim() || !form.startDate || !form.endDate) { setError('Tous les champs sont requis'); return; }
    if (form.startDate >= form.endDate) { setError('La date de fin doit être postérieure à la date de début'); return; }
    setSaving(true); setError(null);
    try {
      if (editing) {
        await api.put(`/accounting/periods/${editing.id}`, form);
      } else {
        await api.post('/accounting/periods', form);
      }
      await onPeriodsChange();
      closeForm();
    } catch (e: unknown) {
      setError((e as { message?: string }).message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: AccountingPeriod) => {
    if (p.importCount > 0) return;
    if (!confirm(`Supprimer la période "${p.label}" ?`)) return;
    try {
      await api.delete(`/accounting/periods/${p.id}`);
      onPeriodsChange();
    } catch (e: unknown) {
      alert((e as { message?: string }).message || 'Erreur');
    }
  };

  const fmtD = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR');

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-700">Périodes comptables</h2>
        <div className="flex gap-2">
          <button className="btn-secondary flex items-center gap-1.5 text-sm" onClick={onGoToRules}>
            Règles de catégorisation
          </button>
          <button className="btn-secondary flex items-center gap-1.5 text-sm" onClick={onGoToImport}>
            <Upload size={14} /> Importer un relevé
          </button>
          <button className="btn-primary flex items-center gap-1.5 text-sm" onClick={openNew}>
            <Plus size={14} /> Nouvelle période
          </button>
        </div>
      </div>

      {/* Form */}
      {creating && (
        <div className="card mb-4">
          <h3 className="font-semibold text-gray-800 mb-4">{editing ? 'Modifier la période' : 'Nouvelle période'}</h3>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="label">Libellé *</label>
              <input className="input text-sm" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Ex : Exercice 2025-2026" autoFocus />
            </div>
            <div>
              <label className="label">Date de début *</label>
              <input type="date" className="input text-sm" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Date de fin *</label>
              <input type="date" className="input text-sm" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary text-sm" onClick={closeForm}>Annuler</button>
            <button className="btn-primary text-sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement…' : editing ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </div>
      )}

      {/* Periods list */}
      {periods.length === 0 ? (
        <div className="card p-10 text-center text-gray-400 text-sm">
          <Calendar size={32} className="mx-auto mb-3 opacity-30" />
          Aucune période comptable. Créez votre première période pour organiser vos imports.
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5">Période</th>
                <th className="px-4 py-2.5">Du</th>
                <th className="px-4 py-2.5">Au</th>
                <th className="px-4 py-2.5 text-center">Imports</th>
                <th className="px-4 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {periods.map(p => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-800">{p.label}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtD(p.startDate)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtD(p.endDate)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{p.importCount}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button className="text-gray-400 hover:text-tennis-green" onClick={() => openEdit(p)} title="Modifier"><Pencil size={14} /></button>
                      <button
                        className={`${p.importCount > 0 ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-red-500'}`}
                        onClick={() => handleDelete(p)}
                        title={p.importCount > 0 ? 'Impossible de supprimer : imports rattachés' : 'Supprimer'}
                        disabled={p.importCount > 0}
                      >
                        <Trash2 size={14} />
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
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'periods' | 'operations' | 'rules' | 'import';

export default function AccountingPage() {
  const [tab, setTab] = useState<Tab>('periods');
  const [imports, setImports] = useState<BankImport[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);

  const loadImports = useCallback(async () => {
    try { setImports(await api.get<BankImport[]>('/accounting/imports')); } catch { /* silent */ }
  }, []);

  const loadCategories = useCallback(async () => {
    try { setCategories(await api.get<string[]>('/accounting/categories')); } catch { /* silent */ }
  }, []);

  const loadPeriods = useCallback(async () => {
    try { setPeriods(await api.get<AccountingPeriod[]>('/accounting/periods')); } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadImports();
    loadCategories();
    loadPeriods();
  }, [loadImports, loadCategories, loadPeriods]);

  const handleDeleteImport = async (id: string) => {
    if (!confirm('Supprimer cet import et toutes ses opérations ?')) return;
    try {
      await api.delete(`/accounting/imports/${id}`);
      setImports(prev => prev.filter(i => i.id !== id));
      await Promise.all([loadCategories(), loadPeriods()]);
    } catch { /* silent */ }
  };

  const handleImportDone = async () => {
    await Promise.all([loadImports(), loadCategories(), loadPeriods()]);
  };

  const handleDeleteAllOps = async () => {
    await Promise.all([loadImports(), loadCategories()]);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'periods',    label: 'Périodes' },
    { key: 'operations', label: 'Opérations' },
    { key: 'rules',      label: 'Règles' },
    { key: 'import',     label: 'Importer' },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Comptabilité</h1>
        <p className="text-gray-500 text-sm mt-1">Import et catégorisation des opérations bancaires</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key
                ? 'border-tennis-green text-tennis-green'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'periods' && (
        <PeriodsTab
          periods={periods}
          onPeriodsChange={loadPeriods}
          onGoToImport={() => setTab('import')}
          onGoToRules={() => setTab('rules')}
        />
      )}

      {tab === 'import' && (
        <>
          <ImportsList imports={imports} onDelete={handleDeleteImport} />
          <ImportTab
            periods={periods}
            onImportDone={handleImportDone}
            onGoToOperations={() => setTab('operations')}
          />
        </>
      )}

      {tab === 'operations' && (
        <OperationsTab
          imports={imports}
          periods={periods}
          categories={categories}
          onCategoriesChange={loadCategories}
          onDeleteAll={handleDeleteAllOps}
        />
      )}

      {tab === 'rules' && (
        <RulesTab
          categories={categories}
          onCategoriesChange={loadCategories}
        />
      )}
    </div>
  );
}
