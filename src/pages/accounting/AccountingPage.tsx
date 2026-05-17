import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Pencil,
  Trash2,
  Plus,
  X,
  Check,
  Upload,
  RefreshCw,
  ChevronDown,
  ChevronLeft,
  Wand2,
  Calendar,
  Bookmark,
  ChevronUp,
  ChevronsUpDown,
  Download,
  ExternalLink,
  FlaskConical,
  GitMerge,
} from 'lucide-react';
import { api, getToken } from '../../api/client';
import {
  AccountingPeriod,
  BankImport,
  BankOperation,
  AccountingRule,
  RuleCondition,
  RuleField,
  RuleOperator,
  PaymentMethod,
  SavedFilter,
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
  amount: 'Montant',
  operationDate: 'Date',
};

const OPERATOR_LABELS: Record<RuleOperator, string> = {
  contains: 'contient',
  equals: 'est égal à',
  startsWith: 'commence par',
  endsWith: 'se termine par',
  notContains: 'ne contient pas',
  greaterThan: 'supérieur à',
  lessThan: 'inférieur à',
  greaterThanOrEqual: 'supérieur ou égal à',
  lessThanOrEqual: 'inférieur ou égal à',
  before:      'avant le',
  after:       'après le',
  onOrBefore:  'avant ou le',
  onOrAfter:   'après ou le',
};

const TEXT_OPERATORS:    RuleOperator[] = ['contains', 'equals', 'startsWith', 'endsWith', 'notContains'];
const NUMERIC_OPERATORS: RuleOperator[] = ['equals', 'greaterThan', 'lessThan', 'greaterThanOrEqual', 'lessThanOrEqual'];
const ENUM_OPERATORS:    RuleOperator[] = ['equals'];
const DATE_OPERATORS:    RuleOperator[] = ['equals', 'before', 'after', 'onOrBefore', 'onOrAfter'];

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: 'Carte',
  transfer: 'Virement',
  direct_debit: 'Prélèvement',
  check: 'Chèque',
  cash: 'Espèces',
  other: 'Autre',
};

// Champs à valeurs finies → combobox dans les conditions de règle
const ENUM_FIELD_VALUES: Partial<Record<RuleField, { value: string; label: string }[]>> = {
  direction: [
    { value: 'credit', label: 'Crédit' },
    { value: 'debit',  label: 'Débit'  },
  ],
  paymentMethod: (Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][])
    .map(([value, label]) => ({ value, label })),
};

const NUMERIC_FIELDS: RuleField[] = ['amount'];

function getFieldKind(field: RuleField): 'text' | 'numeric' | 'enum' | 'date' {
  if (field === 'operationDate')      return 'date';
  if (NUMERIC_FIELDS.includes(field)) return 'numeric';
  if (field in ENUM_FIELD_VALUES)     return 'enum';
  return 'text';
}

function defaultOperatorForKind(kind: 'text' | 'numeric' | 'enum' | 'date'): RuleOperator {
  if (kind === 'numeric') return 'greaterThan';
  if (kind === 'enum')    return 'equals';
  if (kind === 'date')    return 'equals';
  return 'contains';
}

const ALL_FIELDS: RuleField[] = ['rawLabel', 'thirdParty', 'blockMDT', 'blockLIB', 'blockMOTIF', 'blockRNF', 'paymentMethod', 'direction', 'amount', 'operationDate'];

function fmtCurrency(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Réplique côté client de la logique testCondition du serveur
function testConditionClient(op: BankOperation, cond: RuleCondition): boolean {
  const fieldVal = op[cond.field as keyof BankOperation];
  if (cond.field === 'amount') {
    const numVal  = parseFloat(String(fieldVal ?? ''));
    const numCond = parseFloat(cond.value);
    if (isNaN(numVal) || isNaN(numCond)) return false;
    switch (cond.operator) {
      case 'equals':             return numVal === numCond;
      case 'greaterThan':        return numVal >   numCond;
      case 'lessThan':           return numVal <   numCond;
      case 'greaterThanOrEqual': return numVal >=  numCond;
      case 'lessThanOrEqual':    return numVal <=  numCond;
      default: return false;
    }
  }
  if (cond.field === 'operationDate') {
    const d  = String(fieldVal ?? '').slice(0, 10); // YYYY-MM-DD
    const dc = cond.value.slice(0, 10);
    if (!d || !dc) return false;
    switch (cond.operator) {
      case 'equals':     return d === dc;
      case 'before':     return d <   dc;
      case 'after':      return d >   dc;
      case 'onOrBefore': return d <=  dc;
      case 'onOrAfter':  return d >=  dc;
      default: return false;
    }
  }
  if (fieldVal === null || fieldVal === undefined) return cond.operator === 'notContains';
  const a = String(fieldVal).toLowerCase();
  const b = cond.value.toLowerCase();
  switch (cond.operator) {
    case 'contains':    return a.includes(b);
    case 'equals':      return a === b;
    case 'startsWith':  return a.startsWith(b);
    case 'endsWith':    return a.endsWith(b);
    case 'notContains': return !a.includes(b);
    default: return false;
  }
}

// Valeur lisible du champ d'une opération (pour affichage dans le test)
function getFieldDisplay(op: BankOperation, field: string): string {
  const val = op[field as keyof BankOperation];
  if (val === null || val === undefined || val === '') return '(vide)';
  if (field === 'direction')      return val === 'credit' ? 'Crédit' : 'Débit';
  if (field === 'paymentMethod')  return PAYMENT_METHOD_LABELS[val as PaymentMethod] ?? String(val);
  if (field === 'amount')         return fmtCurrency(Number(val));
  if (field === 'operationDate')  return fmtDate(String(val));
  return String(val);
}

// Description lisible d'une règle (supporte groupes et conditions plates)
function formatRuleDescription(rule: AccountingRule): string {
  const fmtCond = (c: RuleCondition) =>
    `${FIELD_LABELS[c.field]} ${OPERATOR_LABELS[c.operator]} « ${c.value} »`;

  if (rule.groups && rule.groups.length > 0) {
    const groupStrs = rule.groups.map(g => {
      const parts = g.conditions.map(fmtCond);
      if (parts.length === 1) return parts[0];
      const sep = g.groupOperator === 'AND' ? ' ET ' : ' OU ';
      return `(${parts.join(sep)})`;
    });
    const rootSep = (rule.rootOperator || 'AND') === 'AND' ? ' ET ' : ' OU ';
    return groupStrs.join(rootSep);
  }
  // Backward compat: flat conditions
  const sep = rule.conditionOperator === 'AND' ? ' ET ' : ' OU ';
  return rule.conditions.map(fmtCond).join(sep);
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
  // Sens toujours inclus en premier
  conds.push({ field: 'direction', operator: 'equals', value: op.direction });
  if (op.thirdParty)   conds.push({ field: 'thirdParty',  operator: 'contains', value: op.thirdParty });
  if (op.blockLIB)     conds.push({ field: 'blockLIB',    operator: 'contains', value: op.blockLIB });
  if (op.blockMOTIF)   conds.push({ field: 'blockMOTIF',  operator: 'contains', value: op.blockMOTIF });
  if (op.blockMDT)     conds.push({ field: 'blockMDT',    operator: 'contains', value: op.blockMDT });
  if (op.blockRNF)     conds.push({ field: 'blockRNF',    operator: 'contains', value: op.blockRNF });
  if (op.paymentMethod && op.paymentMethod !== 'other') {
    conds.push({ field: 'paymentMethod', operator: 'equals', value: op.paymentMethod });
  }
  // Fallback : libellé brut si aucune info structurée (hors sens)
  if (conds.length === 1 && op.rawLabel) {
    conds.push({ field: 'rawLabel', operator: 'contains', value: op.rawLabel.slice(0, 60).trim() });
  }
  return conds;
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
              {conditions.map((cond, idx) => {
                const kind = getFieldKind(cond.field as RuleField);
                const availableOps = kind === 'numeric' ? NUMERIC_OPERATORS : kind === 'enum' ? ENUM_OPERATORS : kind === 'date' ? DATE_OPERATORS : TEXT_OPERATORS;
                const enumValues = ENUM_FIELD_VALUES[cond.field as RuleField];
                return (
                  <div key={idx} className="flex gap-1.5 items-center">
                    <select
                      className="input text-xs py-1.5 flex-1 min-w-0"
                      value={cond.field}
                      onChange={e => {
                        const f = e.target.value as RuleField;
                        const newKind = getFieldKind(f);
                        updateCond(idx, { field: f, operator: defaultOperatorForKind(newKind), value: '' });
                      }}
                    >
                      {ALL_FIELDS.map(f => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                    </select>
                    <select
                      className="input text-xs py-1.5 w-36 flex-shrink-0"
                      value={cond.operator}
                      onChange={e => updateCond(idx, { operator: e.target.value as RuleOperator })}
                    >
                      {availableOps.map(o => <option key={o} value={o}>{OPERATOR_LABELS[o]}</option>)}
                    </select>
                    {kind === 'enum' && enumValues ? (
                      <select
                        className="input text-xs py-1.5 flex-1 min-w-0"
                        value={cond.value}
                        onChange={e => updateCond(idx, { value: e.target.value })}
                      >
                        <option value="">— Sélectionner —</option>
                        {enumValues.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                      </select>
                    ) : kind === 'date' ? (
                      <input
                        type="date"
                        className="input text-xs py-1.5 flex-1 min-w-0"
                        value={cond.value}
                        onChange={e => updateCond(idx, { value: e.target.value })}
                      />
                    ) : kind === 'numeric' ? (
                      <input
                        type="number" min="0" step="0.01"
                        className="input text-xs py-1.5 flex-1 min-w-0"
                        value={cond.value}
                        onChange={e => updateCond(idx, { value: e.target.value })}
                        placeholder="Montant (€)"
                      />
                    ) : (
                      <input
                        className="input text-xs py-1.5 flex-1 min-w-0"
                        value={cond.value}
                        onChange={e => updateCond(idx, { value: e.target.value })}
                        placeholder="Valeur"
                      />
                    )}
                    {conditions.length > 1 && (
                      <button
                        className="text-gray-300 hover:text-red-500 flex-shrink-0 transition-colors"
                        onClick={() => removeCond(idx)}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
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

// ─── Test Rule Modal ──────────────────────────────────────────────────────────

interface TestRuleModalProps {
  op: BankOperation;
  onClose: () => void;
  onApply: (category: string) => void;
  onEditRule: (rule: AccountingRule) => void;
}

function TestRuleModal({ op, onClose, onApply, onEditRule }: TestRuleModalProps) {
  const [rules, setRules]               = useState<AccountingRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [applying, setApplying]         = useState(false);

  useEffect(() => {
    api.get<AccountingRule[]>('/accounting/rules').then(data => {
      const sorted = [...data].sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }));
      setRules(sorted);
      if (sorted.length > 0) setSelectedRuleId(sorted[0].id);
    }).catch(() => {});
  }, []);

  const selectedRule = rules.find(r => r.id === selectedRuleId);

  // Libellé lisible d'une valeur de condition (enum → label)
  const condValueLabel = (cond: RuleCondition): string => {
    const enumVals = ENUM_FIELD_VALUES[cond.field as RuleField];
    if (enumVals) return enumVals.find(v => v.value === cond.value)?.label ?? cond.value;
    if (cond.field === 'amount') return `${cond.value} €`;
    return cond.value;
  };

  // Évaluation par groupes
  const groupResults = (selectedRule?.groups ?? []).map(g => {
    const condResults = g.conditions.map(cond => ({
      cond,
      passed: testConditionClient(op, cond),
      actual: getFieldDisplay(op, cond.field),
    }));
    const groupPassed = g.groupOperator === 'OR'
      ? condResults.some(r => r.passed)
      : condResults.every(r => r.passed);
    return { group: g, condResults, groupPassed };
  });

  const rootOp = selectedRule?.rootOperator ?? 'AND';
  const ruleMatches = selectedRule && groupResults.length > 0
    ? (rootOp === 'OR' ? groupResults.some(g => g.groupPassed) : groupResults.every(g => g.groupPassed))
    : false;

  const handleApply = async () => {
    if (!selectedRule || !ruleMatches) return;
    setApplying(true);
    try { await onApply(selectedRule.category); }
    finally { setApplying(false); }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FlaskConical size={17} className="text-indigo-500" />
            <h2 className="font-semibold text-gray-800">Tester une règle</h2>
          </div>
          <button className="text-gray-400 hover:text-gray-600" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Résumé opération */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm space-y-0.5 min-w-0">
              <p className="text-gray-400 text-xs">{fmtDate(op.operationDate)}</p>
              {op.thirdParty && <p className="font-medium text-gray-800 truncate">{op.thirdParty}</p>}
              {op.rawLabel  && <p className="text-xs text-gray-400 truncate" title={op.rawLabel}>{op.rawLabel}</p>}
            </div>
            <span className={`text-sm font-bold whitespace-nowrap px-2.5 py-1 rounded-full flex-shrink-0 ${
              op.direction === 'credit' ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
            }`}>
              {op.direction === 'credit' ? '+' : '−'}{fmtCurrency(op.amount)}
            </span>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Sélecteur de règle */}
          <div>
            <label className="label">Règle à tester</label>
            {rules.length === 0 ? (
              <p className="text-sm text-gray-400">Chargement…</p>
            ) : (
              <div className="flex gap-2 items-center">
                <select
                  className="input text-sm flex-1"
                  value={selectedRuleId}
                  onChange={e => setSelectedRuleId(e.target.value)}
                >
                  {rules.map(r => (
                    <option key={r.id} value={r.id}>{r.label} → {r.category}</option>
                  ))}
                </select>
                {selectedRule && (
                  <button
                    className="flex-shrink-0 p-2 rounded-lg border border-gray-200 text-gray-400 hover:text-blue-500 hover:border-blue-300 transition-colors"
                    title="Modifier cette règle"
                    onClick={() => onEditRule(selectedRule)}
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Résultats par groupes */}
          {selectedRule && groupResults.length > 0 && (
            <div className="space-y-3">
              {groupResults.map((gr, gIdx) => (
                <div key={gIdx}>
                  {/* Séparateur entre groupes */}
                  {gIdx > 0 && (
                    <div className="flex items-center gap-2 my-2">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                        rootOp === 'AND'
                          ? 'border-blue-200 bg-blue-50 text-blue-600'
                          : 'border-amber-200 bg-amber-50 text-amber-600'
                      }`}>
                        {rootOp}
                      </span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                  )}

                  {/* Groupe */}
                  <div className={`rounded-lg border p-3 space-y-2 ${
                    gr.groupPassed ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'
                  }`}>
                    {/* En-tête du groupe */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 font-medium">
                        {groupResults.length > 1 ? `Groupe ${gIdx + 1} — ` : ''}
                        {gr.group.groupOperator === 'AND' ? 'Toutes requises (ET)' : 'Au moins une (OU)'}
                      </span>
                      <span className={`text-xs font-semibold ${gr.groupPassed ? 'text-green-600' : 'text-red-500'}`}>
                        {gr.groupPassed ? '✓ validé' : '✗ non validé'}
                      </span>
                    </div>

                    {/* Conditions */}
                    {gr.condResults.map((r, cIdx) => (
                      <div
                        key={cIdx}
                        className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm border ${
                          r.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                        }`}
                      >
                        <span className={`flex-shrink-0 mt-0.5 ${r.passed ? 'text-green-600' : 'text-red-500'}`}>
                          {r.passed ? <Check size={14} /> : <X size={14} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`font-medium text-xs ${r.passed ? 'text-green-800' : 'text-red-700'}`}>
                            {FIELD_LABELS[r.cond.field as RuleField] ?? r.cond.field}
                            {' '}<span className="font-normal opacity-75">{OPERATOR_LABELS[r.cond.operator]}</span>
                            {' '}<span className="font-semibold">«&nbsp;{condValueLabel(r.cond)}&nbsp;»</span>
                          </p>
                          <p className="text-xs mt-0.5 opacity-60">
                            Valeur réelle&nbsp;: <span className="font-medium">{r.actual}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Résultat global */}
          {selectedRule && groupResults.length > 0 && (
            <div className={`flex items-center gap-3 rounded-lg px-4 py-3 border ${
              ruleMatches
                ? 'bg-green-100 border-green-300 text-green-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {ruleMatches
                ? <Check size={18} className="flex-shrink-0" />
                : <X size={18} className="flex-shrink-0" />}
              <p className="font-semibold text-sm">
                {ruleMatches
                  ? `La règle s'applique → catégorie « ${selectedRule.category} »`
                  : 'La règle ne s\'applique pas à cette opération'}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <button className="btn-secondary flex-1" onClick={onClose}>Fermer</button>
          {ruleMatches && (
            <button
              className="btn-primary flex-1 flex items-center justify-center gap-2"
              onClick={handleApply}
              disabled={applying}
            >
              <Check size={15} />
              {applying ? 'Application…' : 'Appliquer la catégorie'}
            </button>
          )}
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
  onGoToEditRule: (rule: AccountingRule) => void;
}

function OperationsTab({ imports, periods, categories, onCategoriesChange, onDeleteAll, onGoToEditRule }: OperationsTabProps) {
  const [operations, setOperations] = useState<BankOperation[]>([]);
  const [loading, setLoading] = useState(false);
  const [applyingRules, setApplyingRules] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [ruleModalOp, setRuleModalOp]   = useState<BankOperation | null>(null);
  const [testRuleOp,  setTestRuleOp]    = useState<BankOperation | null>(null);

  // Multi-selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkPeriodId, setBulkPeriodId] = useState('');
  const [applyingBulk, setApplyingBulk] = useState(false);

  // Saved filters
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [savingName, setSavingName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [savedFilterOpen, setSavedFilterOpen] = useState(false);
  const savedFilterRef = useRef<HTMLDivElement>(null);

  // Persistence des filtres dans localStorage
  const LS_FILTER_KEY = 'accounting_ops_filters';
  const _ls = (() => {
    try { return JSON.parse(localStorage.getItem(LS_FILTER_KEY) || 'null'); } catch { return null; }
  })();

  // Filters — initialisés depuis localStorage si disponible
  const [filterPeriod,    setFilterPeriod]    = useState<string>(_ls?.filterPeriod    || '');
  const [filterImport,    setFilterImport]    = useState<string>(_ls?.filterImport    || '');
  const [filterDirection, setFilterDirection] = useState<string>(_ls?.filterDirection || '');
  const [filterMethod,    setFilterMethod]    = useState<string>(_ls?.filterMethod    || '');
  const [filterCategory,  setFilterCategory]  = useState<string>(_ls?.filterCategory  || '');
  const [filterSearch,    setFilterSearch]    = useState<string>(_ls?.filterSearch    || '');
  const [filterAmountMin, setFilterAmountMin] = useState<string>(_ls?.filterAmountMin || '');
  const [filterAmountMax, setFilterAmountMax] = useState<string>(_ls?.filterAmountMax || '');
  const [appliedSavedFilterId, setAppliedSavedFilterId] = useState<string | null>(_ls?.appliedSavedFilterId || null);

  // Persister les filtres dans localStorage à chaque changement
  useEffect(() => {
    try {
      localStorage.setItem(LS_FILTER_KEY, JSON.stringify({
        filterPeriod, filterImport, filterDirection, filterMethod,
        filterCategory, filterSearch, filterAmountMin, filterAmountMax,
        appliedSavedFilterId,
      }));
    } catch { /* silent */ }
  }, [filterPeriod, filterImport, filterDirection, filterMethod, filterCategory, filterSearch, filterAmountMin, filterAmountMax, appliedSavedFilterId]);

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
      if (filterAmountMin) params.set('amountMin', filterAmountMin);
      if (filterAmountMax) params.set('amountMax', filterAmountMax);
      const data = await api.get<BankOperation[]>(`/accounting/operations?${params.toString()}`);
      setOperations(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filterPeriod, filterImport, filterDirection, filterMethod, filterCategory, filterSearch, filterAmountMin, filterAmountMax]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get<SavedFilter[]>('/accounting/saved-filters').then(setSavedFilters).catch(() => {});
  }, []);

  const currentFilters = () => ({
    periodId:   filterPeriod    || undefined,
    importId:   filterImport    || undefined,
    direction:  filterDirection || undefined,
    paymentMethod: filterMethod || undefined,
    category:   filterCategory  || undefined,
    search:     filterSearch    || undefined,
    amountMin:  filterAmountMin || undefined,
    amountMax:  filterAmountMax || undefined,
  });

  const hasActiveFilter = () => !!(filterPeriod || filterImport || filterDirection || filterMethod || filterCategory || filterSearch || filterAmountMin || filterAmountMax);

  const handleSaveFilter = async () => {
    if (!savingName.trim()) return;
    try {
      const created = await api.post<SavedFilter>('/accounting/saved-filters', {
        label: savingName.trim(),
        filters: currentFilters(),
      });
      setSavedFilters(prev => [...prev, created]);
      setSavingName('');
      setShowSaveInput(false);
    } catch { /* silent */ }
  };

  const handleApplySavedFilter = (sf: SavedFilter) => {
    setFilterPeriod(sf.filters.periodId || '');
    setFilterImport(sf.filters.importId || '');
    setFilterDirection(sf.filters.direction || '');
    setFilterMethod(sf.filters.paymentMethod || '');
    setFilterCategory(sf.filters.category || '');
    setFilterSearch(sf.filters.search || '');
    setFilterAmountMin(sf.filters.amountMin || '');
    setFilterAmountMax(sf.filters.amountMax || '');
    setAppliedSavedFilterId(sf.id);
    setSavedFilterOpen(false);
  };

  const handleClearFilters = () => {
    setFilterPeriod('');
    setFilterImport('');
    setFilterDirection('');
    setFilterMethod('');
    setFilterCategory('');
    setFilterSearch('');
    setFilterAmountMin('');
    setFilterAmountMax('');
    setAppliedSavedFilterId(null);
  };

  useEffect(() => {
    if (!savedFilterOpen) return;
    const handler = (e: MouseEvent) => {
      if (savedFilterRef.current && !savedFilterRef.current.contains(e.target as Node)) {
        setSavedFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [savedFilterOpen]);

  const handleDeleteSavedFilter = async (id: string) => {
    try {
      await api.delete(`/accounting/saved-filters/${id}`);
      setSavedFilters(prev => prev.filter(f => f.id !== id));
      if (appliedSavedFilterId === id) setAppliedSavedFilterId(null);
    } catch { /* silent */ }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayedOps.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedOps.map(op => op.id)));
    }
  };

  const handleBulkApply = async (type: 'category' | 'period') => {
    if (selectedIds.size === 0) return;
    setApplyingBulk(true);
    try {
      const payload: Record<string, unknown> = { ids: Array.from(selectedIds) };
      if (type === 'category') { payload.category = bulkCategory || null; payload.categorySource = 'manual'; }
      if (type === 'period')   { payload.periodId = bulkPeriodId || null; }
      await api.put('/accounting/operations/bulk', payload);
      await load();
      onCategoriesChange();
      setSelectedIds(new Set());
      if (type === 'category') setBulkCategory('');
      if (type === 'period')   setBulkPeriodId('');
    } catch { /* silent */ } finally {
      setApplyingBulk(false);
    }
  };

  const handleApplyRules = async () => {
    setApplyingRules(true);
    setApplyMsg(null);
    try {
      const result = await api.post<{ updated: number; cleared: number }>('/accounting/rules/apply-all', {});
      const parts = [];
      if (result.updated > 0) parts.push(`${result.updated} catégorisée(s)`);
      if (result.cleared > 0) parts.push(`${result.cleared} désaffectée(s)`);
      setApplyMsg(parts.length > 0 ? parts.join(', ') : 'Aucune modification');
      await load();
      onCategoriesChange();
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message || 'Erreur inconnue';
      setApplyMsg(`Erreur : ${msg}`);
      console.error('[apply-rules]', err);
    } finally {
      setApplyingRules(false);
      setTimeout(() => setApplyMsg(null), 8000);
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

  // Sorting
  type SortCol = 'date' | 'direction' | 'paymentMethod' | 'amount' | 'thirdParty' | 'category';
  const [sortCol, setSortCol] = useState<SortCol>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const sorted = [...operations].sort((a, b) => {
    let va: string | number = '', vb: string | number = '';
    if (sortCol === 'date')          { va = a.operationDate; vb = b.operationDate; }
    if (sortCol === 'direction')     { va = a.direction;     vb = b.direction; }
    if (sortCol === 'paymentMethod') { va = PAYMENT_METHOD_LABELS[a.paymentMethod] ?? a.paymentMethod; vb = PAYMENT_METHOD_LABELS[b.paymentMethod] ?? b.paymentMethod; }
    if (sortCol === 'amount')        { va = a.amount;        vb = b.amount; }
    if (sortCol === 'thirdParty')    { va = a.thirdParty ?? ''; vb = b.thirdParty ?? ''; }
    if (sortCol === 'category')      { va = a.category ?? ''; vb = b.category ?? ''; }
    const cmp = typeof va === 'number'
      ? va - (vb as number)
      : String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base' });
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const displayedOps = sorted;

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

          <div className="relative flex-1 min-w-[140px]">
            <input
              className="input text-sm py-1.5 w-full pr-7"
              placeholder="Tiers / libellé"
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
            />
            {filterSearch && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                onClick={() => setFilterSearch('')}
                tabIndex={-1}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.01"
              className="input text-sm py-1.5 w-28 pr-7"
              placeholder="Montant ≥"
              value={filterAmountMin}
              onChange={e => setFilterAmountMin(e.target.value)}
            />
            {filterAmountMin && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                onClick={() => setFilterAmountMin('')}
                tabIndex={-1}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.01"
              className="input text-sm py-1.5 w-28 pr-7"
              placeholder="Montant ≤"
              value={filterAmountMax}
              onChange={e => setFilterAmountMax(e.target.value)}
            />
            {filterAmountMax && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                onClick={() => setFilterAmountMax('')}
                tabIndex={-1}
              >
                <X size={13} />
              </button>
            )}
          </div>

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
        {/* Filtres enregistrés + actions */}
        {(savedFilters.length > 0 || hasActiveFilter()) && (
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">

            {/* Combobox filtres enregistrés */}
            {savedFilters.length > 0 && (
              <div className="relative" ref={savedFilterRef}>
                <button
                  className="input text-sm py-1.5 flex items-center gap-2 w-52"
                  onClick={() => setSavedFilterOpen(o => !o)}
                >
                  <Bookmark size={13} className={`flex-shrink-0 ${appliedSavedFilterId ? 'text-indigo-600' : 'text-indigo-400'}`} />
                  <span className={`flex-1 text-left truncate ${appliedSavedFilterId ? 'text-indigo-700 font-medium' : 'text-gray-500'}`}>
                    {appliedSavedFilterId
                      ? (savedFilters.find(f => f.id === appliedSavedFilterId)?.label ?? 'Filtres enregistrés')
                      : 'Filtres enregistrés'}
                  </span>
                  <ChevronDown size={13} className={`flex-shrink-0 text-gray-400 transition-transform ${savedFilterOpen ? 'rotate-180' : ''}`} />
                </button>
                {savedFilterOpen && (
                  <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {savedFilters.map(sf => (
                      <div key={sf.id} className="flex items-center gap-1 px-2 py-1.5 hover:bg-gray-50 group">
                        <button
                          className="flex-1 text-left text-sm text-gray-700 hover:text-indigo-700 truncate py-0.5"
                          onClick={() => handleApplySavedFilter(sf)}
                          title="Appliquer ce filtre"
                        >
                          {sf.label}
                        </button>
                        <button
                          className="text-gray-300 hover:text-red-500 p-0.5 flex-shrink-0 transition-colors"
                          onClick={e => { e.stopPropagation(); handleDeleteSavedFilter(sf.id); }}
                          title="Supprimer ce filtre enregistré"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Ré-appliquer le filtre enregistré */}
            {appliedSavedFilterId && (
              <button
                className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-400 rounded-lg px-2.5 py-1.5 transition-colors"
                onClick={() => {
                  const sf = savedFilters.find(f => f.id === appliedSavedFilterId);
                  if (sf) handleApplySavedFilter(sf);
                }}
              >
                <RefreshCw size={12} />
                Ré-appliquer le filtre
              </button>
            )}

            {/* Effacer le filtre */}
            {hasActiveFilter() && (
              <button
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-300 rounded-lg px-2.5 py-1.5 transition-colors"
                onClick={handleClearFilters}
              >
                <X size={12} />
                Effacer le filtre
              </button>
            )}

            {/* Enregistrer le filtre courant */}
            {hasActiveFilter() && (
              showSaveInput ? (
                <div className="flex items-center gap-1.5 ml-auto">
                  <input
                    className="input text-xs py-1 px-2 w-40"
                    placeholder="Nom du filtre…"
                    value={savingName}
                    onChange={e => setSavingName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveFilter(); if (e.key === 'Escape') setShowSaveInput(false); }}
                    autoFocus
                  />
                  <button className="btn-primary text-xs py-1 px-2" onClick={handleSaveFilter} disabled={!savingName.trim()}>
                    Enregistrer
                  </button>
                  <button className="text-gray-400 hover:text-gray-600" onClick={() => { setShowSaveInput(false); setSavingName(''); }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 ml-auto"
                  onClick={() => setShowSaveInput(true)}
                >
                  <Bookmark size={12} />
                  Enregistrer ce filtre
                </button>
              )
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          <span className="text-sm font-medium text-gray-600">
            {displayedOps.length} / {totalOps} opération(s)
          </span>
          {applyMsg && (
            <p className="text-sm text-tennis-green font-medium">{applyMsg}</p>
          )}
        </div>
      </div>

      {/* Barre d'actions groupées */}
      {selectedIds.size > 0 && (
        <div className="card mb-3 bg-indigo-50 border-indigo-200 flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-indigo-700">{selectedIds.size} opération(s) sélectionnée(s)</span>
          <div className="flex items-center gap-1.5">
            <select className="input text-sm py-1 w-44" value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}>
              <option value="">— Catégorie —</option>
              <option value="">Aucune (effacer)</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="btn-primary text-xs py-1 px-3" onClick={() => handleBulkApply('category')} disabled={applyingBulk}>
              Appliquer
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <select className="input text-sm py-1 w-44" value={bulkPeriodId} onChange={e => setBulkPeriodId(e.target.value)}>
              <option value="">— Période —</option>
              {periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <button className="btn-primary text-xs py-1 px-3" onClick={() => handleBulkApply('period')} disabled={applyingBulk || !bulkPeriodId}>
              Appliquer
            </button>
          </div>
          <button className="ml-auto text-xs text-indigo-500 hover:text-indigo-800" onClick={() => setSelectedIds(new Set())}>
            Désélectionner tout
          </button>
        </div>
      )}

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
                  <th className="pl-4 pr-2 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={displayedOps.length > 0 && selectedIds.size === displayedOps.length}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </th>
                  {([
                    { col: 'date',          label: 'Date',          cls: '' },
                    { col: null,            label: 'Import',        cls: '' },
                    { col: 'direction',     label: 'Sens',          cls: '' },
                    { col: 'paymentMethod', label: 'Mode',          cls: '' },
                    { col: 'amount',        label: 'Montant',       cls: 'text-right' },
                    { col: 'thirdParty',    label: 'Tiers / Libellé', cls: '' },
                    { col: 'category',      label: 'Catégorie',     cls: '' },
                  ] as { col: SortCol | null; label: string; cls: string }[]).map(({ col, label, cls }) => (
                    <th
                      key={label}
                      className={`px-4 py-2.5 ${cls} ${col ? 'cursor-pointer select-none hover:text-gray-700' : ''}`}
                      onClick={col ? () => handleSort(col) : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        {col && (
                          sortCol === col
                            ? sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                            : <ChevronsUpDown size={12} className="opacity-30" />
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="px-2 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {displayedOps.map(op => (
                  <tr key={op.id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${selectedIds.has(op.id) ? 'bg-indigo-50/40' : ''}`}>
                    <td className="pl-4 pr-2 py-2">
                      <input type="checkbox" checked={selectedIds.has(op.id)} onChange={() => toggleSelect(op.id)} className="rounded" />
                    </td>
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
                      <div className="flex items-center gap-1.5">
                        <button
                          className="text-gray-300 hover:text-tennis-green transition-colors"
                          title="Créer une règle depuis cette opération"
                          onClick={() => setRuleModalOp(op)}
                        >
                          <Wand2 size={14} />
                        </button>
                        <button
                          className="text-gray-300 hover:text-indigo-500 transition-colors"
                          title="Tester une règle sur cette opération"
                          onClick={() => setTestRuleOp(op)}
                        >
                          <FlaskConical size={14} />
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

      {ruleModalOp && (
        <CreateRuleFromOpModal
          op={ruleModalOp}
          categories={categories}
          onClose={() => setRuleModalOp(null)}
          onCreated={() => { load(); onCategoriesChange(); }}
        />
      )}

      {testRuleOp && (
        <TestRuleModal
          op={testRuleOp}
          onClose={() => setTestRuleOp(null)}
          onApply={async (category) => {
            await handleSaveCategory(testRuleOp.id, category);
            setTestRuleOp(null);
          }}
          onEditRule={rule => {
            setTestRuleOp(null);
            onGoToEditRule(rule);
          }}
        />
      )}
    </div>
  );
}

// ─── Merge Rules Modal ────────────────────────────────────────────────────────

interface MergeRulesModalProps {
  rules: AccountingRule[];
  categories: string[];
  onClose: () => void;
  onMerged: (updated: number, cleared: number) => void;
}

function MergeRulesModal({ rules, categories, onClose, onMerged }: MergeRulesModalProps) {
  const differentCategories = [...new Set(rules.map(r => r.category))];
  const [label, setLabel]       = useState<string>(`Fusion : ${rules.map(r => r.label).join(', ')}`);
  const [category, setCategory] = useState<string>(differentCategories[0] || '');
  const [catInput, setCatInput] = useState(differentCategories[0] || '');
  const [catSuggs, setCatSuggs] = useState<string[]>([]);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Toutes les conditions des règles existantes, regroupées par groupe, avec OR entre groupes
  const mergedGroups = useMemo(() => {
    const out: { id: string; groupOperator: 'AND' | 'OR'; conditions: RuleCondition[] }[] = [];
    for (const rule of rules) {
      if (rule.groups && rule.groups.length > 0) {
        for (const g of rule.groups) {
          out.push({ id: crypto.randomUUID(), groupOperator: g.groupOperator, conditions: g.conditions });
        }
      } else if (rule.conditions && rule.conditions.length > 0) {
        out.push({ id: crypto.randomUUID(), groupOperator: rule.conditionOperator || 'AND', conditions: rule.conditions });
      }
    }
    return out;
  }, [rules]);

  const handleCatInput = (v: string) => {
    setCatInput(v);
    setCategory(v);
    if (v.length >= 1) {
      setCatSuggs(categories.filter(c => c.toLowerCase().includes(v.toLowerCase())).slice(0, 8));
    } else {
      setCatSuggs([]);
    }
  };

  const handleConfirm = async () => {
    if (!label.trim()) { setError('Le libellé est requis'); return; }
    if (!category.trim()) { setError('La catégorie est requise'); return; }
    setSaving(true); setError(null);
    try {
      const payload = {
        label: label.trim(),
        rootOperator: 'OR',
        conditionOperator: 'OR',
        category: category.trim(),
        priority: Math.max(...rules.map(r => r.priority ?? 0)),
        groups: mergedGroups,
      };
      await api.post('/accounting/rules', payload);
      // Supprimer les règles sources
      await api.delete('/accounting/rules/bulk', { ids: rules.map(r => r.id) });
      // Ré-appliquer toutes les règles
      const applyRes = await api.post<{ updated: number; cleared: number }>('/accounting/rules/apply-all', {});
      onMerged(applyRes.updated ?? 0, applyRes.cleared ?? 0);
    } catch (e: unknown) {
      setError((e as { message?: string }).message || 'Erreur');
      setSaving(false);
    }
  };

  const fmtCond = (c: RuleCondition) => `${FIELD_LABELS[c.field]} ${OPERATOR_LABELS[c.operator]} « ${c.value} »`;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <GitMerge size={18} className="text-indigo-500" />
            <h2 className="font-semibold text-gray-800">Fusionner {rules.length} règles</h2>
          </div>
          <button className="text-gray-400 hover:text-gray-600" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {differentCategories.length > 1 && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
              ⚠️ Les règles sélectionnées ont des catégories différentes : <strong>{differentCategories.join(', ')}</strong>. Choisissez la catégorie de la règle fusionnée.
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div>
            <label className="label">Libellé de la nouvelle règle *</label>
            <input
              className="input text-sm w-full"
              value={label}
              onChange={e => setLabel(e.target.value)}
              autoFocus
            />
          </div>

          <div className="relative">
            <label className="label">Catégorie *</label>
            <input
              className="input text-sm w-full"
              value={catInput}
              onChange={e => handleCatInput(e.target.value)}
              placeholder="Ex : Licences, Matériel…"
            />
            {catSuggs.length > 0 && (
              <ul className="absolute z-10 bg-white border border-gray-200 rounded-lg shadow-lg w-full mt-0.5 max-h-40 overflow-auto">
                {catSuggs.map(s => (
                  <li
                    key={s}
                    className="px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50"
                    onMouseDown={() => { setCategory(s); setCatInput(s); setCatSuggs([]); }}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Aperçu des groupes fusionnés */}
          <div>
            <p className="label mb-1">Aperçu des conditions fusionnées</p>
            <div className="space-y-1.5">
              {mergedGroups.map((g, i) => (
                <div key={g.id}>
                  {i > 0 && (
                    <div className="flex items-center gap-2 my-1">
                      <div className="flex-1 border-t border-indigo-100" />
                      <span className="text-xs font-semibold text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded-full">OU</span>
                      <div className="flex-1 border-t border-indigo-100" />
                    </div>
                  )}
                  <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs text-gray-600 space-y-0.5">
                    {g.conditions.map((c, ci) => (
                      <div key={ci}>
                        {ci > 0 && <span className="text-gray-400 mr-1">{g.groupOperator === 'AND' ? 'ET' : 'OU'}</span>}
                        {fmtCond(c)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button className="btn-secondary text-sm" onClick={onClose} disabled={saving}>Annuler</button>
          <button
            className="btn-primary text-sm flex items-center gap-1.5"
            onClick={handleConfirm}
            disabled={saving}
          >
            <GitMerge size={14} />
            {saving ? 'Fusion en cours…' : 'Fusionner'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Rules Tab ────────────────────────────────────────────────────────────────

interface RulesTabProps {
  categories: string[];
  onCategoriesChange: () => void;
  openEditRule?: AccountingRule | null;
  onEditRuleHandled?: () => void;
}

const emptyCondition = (): RuleCondition => ({ field: 'rawLabel', operator: 'contains', value: '' });

interface RuleGroupForm {
  id: string;
  groupOperator: 'AND' | 'OR';
  conditions: RuleCondition[];
}

interface RuleFormState {
  label: string;
  rootOperator: 'AND' | 'OR';
  category: string;
  priority: string;
  groups: RuleGroupForm[];
}

const emptyGroup = (): RuleGroupForm => ({
  id: crypto.randomUUID(),
  groupOperator: 'AND',
  conditions: [emptyCondition()],
});

const emptyRuleForm = (): RuleFormState => ({
  label: '',
  rootOperator: 'AND',
  category: '',
  priority: '0',
  groups: [emptyGroup()],
});

function RulesTab({ categories, onCategoriesChange, openEditRule, onEditRuleHandled }: RulesTabProps) {
  const [rules, setRules] = useState<AccountingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<AccountingRule | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState<RuleFormState>(emptyRuleForm());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [catInput, setCatInput] = useState('');
  const [catSuggestions, setCatSuggestions] = useState<string[]>([]);

  // Multi-select for bulk delete / merge
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
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
      setRules([...data].sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' })));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Ouverture automatique de l'éditeur si demandé depuis une autre vue
  useEffect(() => {
    if (openEditRule) {
      openEdit(openEditRule);
      onEditRuleHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openEditRule]);

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
    let groups: RuleGroupForm[];
    if (rule.groups && rule.groups.length > 0) {
      groups = rule.groups.map(g => ({
        id: g.id || crypto.randomUUID(),
        groupOperator: g.groupOperator,
        conditions: g.conditions.length > 0 ? g.conditions : [emptyCondition()],
      }));
    } else {
      // Backward compat: single group from flat conditions
      groups = [{
        id: crypto.randomUUID(),
        groupOperator: rule.conditionOperator,
        conditions: rule.conditions.length > 0 ? rule.conditions : [emptyCondition()],
      }];
    }
    setForm({
      label: rule.label,
      rootOperator: rule.rootOperator || 'AND',
      category: rule.category,
      priority: String(rule.priority),
      groups,
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
      const validGroups = form.groups
        .map(g => ({ ...g, conditions: g.conditions.filter(c => c.value.trim()) }))
        .filter(g => g.conditions.length > 0);
      if (validGroups.length === 0) return;
      const flatConditions = validGroups.flatMap(g => g.conditions);
      const conditionOperator = validGroups[0].groupOperator; // compat
      const payload = {
        label: form.label.trim(),
        conditionOperator,
        rootOperator: form.rootOperator,
        category: form.category.trim(),
        priority: parseInt(form.priority) || 0,
        groups: validGroups,
        conditions: flatConditions,
      };
      if (editingRule) {
        await api.put(`/accounting/rules/${editingRule.id}`, payload);
      } else {
        await api.post('/accounting/rules', payload);
      }
      // Re-appliquer toutes les règles et désaffecter les opérations qui ne matchent plus
      const result = await api.post<{ updated: number; cleared: number }>('/accounting/rules/apply-all', {});
      const parts = [];
      if (result.updated > 0) parts.push(`${result.updated} opération(s) catégorisée(s)`);
      if (result.cleared > 0) parts.push(`${result.cleared} désaffectée(s)`);
      if (parts.length > 0) {
        setSaveMsg(parts.join(', '));
        setTimeout(() => setSaveMsg(null), 4000);
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

  const updateGroup = (gIdx: number, patch: Partial<RuleGroupForm>) =>
    setForm(prev => ({
      ...prev,
      groups: prev.groups.map((g, i) => i === gIdx ? { ...g, ...patch } : g),
    }));

  const removeGroup = (gIdx: number) =>
    setForm(prev => ({ ...prev, groups: prev.groups.filter((_, i) => i !== gIdx) }));

  const addGroup = () =>
    setForm(prev => ({ ...prev, groups: [...prev.groups, emptyGroup()] }));

  const updateGroupCondition = (gIdx: number, cIdx: number, patch: Partial<RuleCondition>) =>
    setForm(prev => ({
      ...prev,
      groups: prev.groups.map((g, gi) => gi !== gIdx ? g : {
        ...g,
        conditions: g.conditions.map((c, ci) => ci === cIdx ? { ...c, ...patch } : c),
      }),
    }));

  const removeGroupCondition = (gIdx: number, cIdx: number) =>
    setForm(prev => ({
      ...prev,
      groups: prev.groups.map((g, gi) => gi !== gIdx ? g : {
        ...g,
        conditions: g.conditions.filter((_, ci) => ci !== cIdx),
      }),
    }));

  const addGroupCondition = (gIdx: number) =>
    setForm(prev => ({
      ...prev,
      groups: prev.groups.map((g, gi) => gi !== gIdx ? g : {
        ...g,
        conditions: [...g.conditions, emptyCondition()],
      }),
    }));

  const selectedRules = rules.filter(r => selectedIds.has(r.id));

  return (
    <>
    {showMergeModal && selectedRules.length >= 2 && (
      <MergeRulesModal
        rules={selectedRules}
        categories={categories}
        onClose={() => setShowMergeModal(false)}
        onMerged={(updated, cleared) => {
          setShowMergeModal(false);
          setSelectedIds(new Set());
          load();
          setSaveMsg(`Règles fusionnées. ${updated} opération(s) mise(s) à jour${cleared > 0 ? `, ${cleared} désaffectée(s)` : ''}.`);
          setTimeout(() => setSaveMsg(null), 5000);
        }}
      />
    )}
    <div className="flex gap-4 flex-col lg:flex-row">
      {/* List */}
      <div className="flex-1">
        {saveMsg && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-tennis-green/10 border border-tennis-green/30 text-tennis-green text-sm font-medium">
            ✓ {saveMsg}
          </div>
        )}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-700">Règles de catégorisation</h2>
            {selectedIds.size > 0 && (
              <>
                {selectedIds.size >= 2 && (
                  <button
                    className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 rounded-lg px-2.5 py-1 transition-colors"
                    onClick={() => setShowMergeModal(true)}
                  >
                    <GitMerge size={13} />
                    Fusionner ({selectedIds.size})
                  </button>
                )}
                <button
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-lg px-2.5 py-1 transition-colors"
                  onClick={handleDeleteSelected}
                >
                  <Trash2 size={13} />
                  Supprimer ({selectedIds.size})
                </button>
              </>
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
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    {formatRuleDescription(rule)}
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label mb-0">Conditions</label>
                  {form.groups.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">Groupes :</span>
                      {(['AND', 'OR'] as const).map(op => (
                        <label key={op} className="flex items-center gap-1 cursor-pointer text-xs text-gray-600">
                          <input
                            type="radio"
                            name="rootOp"
                            value={op}
                            checked={form.rootOperator === op}
                            onChange={() => setForm(prev => ({ ...prev, rootOperator: op }))}
                          />
                          {op}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {form.groups.map((group, gIdx) => (
                    <div key={group.id}>
                      {/* Séparateur entre groupes */}
                      {gIdx > 0 && (
                        <div className="flex items-center gap-2 my-2">
                          <div className="flex-1 h-px bg-gray-200" />
                          <span className="text-xs font-semibold text-gray-400 px-2 py-0.5 border border-gray-200 rounded bg-gray-50">
                            {form.rootOperator}
                          </span>
                          <div className="flex-1 h-px bg-gray-200" />
                        </div>
                      )}

                      {/* Groupe */}
                      <div className="border border-gray-200 rounded-lg p-2 space-y-1.5 bg-gray-50/50">
                        {/* En-tête du groupe */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">Dans ce groupe :</span>
                          {(['AND', 'OR'] as const).map(op => (
                            <label key={op} className="flex items-center gap-1 cursor-pointer text-xs text-gray-600">
                              <input
                                type="radio"
                                name={`grpOp-${group.id}`}
                                value={op}
                                checked={group.groupOperator === op}
                                onChange={() => updateGroup(gIdx, { groupOperator: op })}
                              />
                              {op === 'AND' ? 'Toutes (ET)' : 'Au moins une (OU)'}
                            </label>
                          ))}
                          {form.groups.length > 1 && (
                            <button
                              className="ml-auto text-gray-300 hover:text-red-500 transition-colors"
                              onClick={() => removeGroup(gIdx)}
                              title="Supprimer ce groupe"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>

                        {/* Conditions du groupe */}
                        {group.conditions.map((cond, cIdx) => {
                          const kind = getFieldKind(cond.field as RuleField);
                          const availableOps = kind === 'numeric' ? NUMERIC_OPERATORS : kind === 'enum' ? ENUM_OPERATORS : kind === 'date' ? DATE_OPERATORS : TEXT_OPERATORS;
                          const enumValues = ENUM_FIELD_VALUES[cond.field as RuleField];
                          return (
                            <div key={cIdx} className="flex gap-1 items-center">
                              <select
                                className="input text-xs py-1 flex-1"
                                value={cond.field}
                                onChange={e => {
                                  const f = e.target.value as RuleField;
                                  const nk = getFieldKind(f);
                                  updateGroupCondition(gIdx, cIdx, { field: f, operator: defaultOperatorForKind(nk), value: '' });
                                }}
                              >
                                {ALL_FIELDS.map(f => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                              </select>
                              <select
                                className="input text-xs py-1 flex-1"
                                value={cond.operator}
                                onChange={e => updateGroupCondition(gIdx, cIdx, { operator: e.target.value as RuleOperator })}
                              >
                                {availableOps.map(o => <option key={o} value={o}>{OPERATOR_LABELS[o]}</option>)}
                              </select>
                              {kind === 'enum' && enumValues ? (
                                <select
                                  className="input text-xs py-1 flex-1"
                                  value={cond.value}
                                  onChange={e => updateGroupCondition(gIdx, cIdx, { value: e.target.value })}
                                >
                                  <option value="">— Sélectionner —</option>
                                  {enumValues.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                                </select>
                              ) : kind === 'date' ? (
                                <input
                                  type="date"
                                  className="input text-xs py-1 flex-1"
                                  value={cond.value}
                                  onChange={e => updateGroupCondition(gIdx, cIdx, { value: e.target.value })}
                                />
                              ) : kind === 'numeric' ? (
                                <input
                                  type="number" min="0" step="0.01"
                                  className="input text-xs py-1 flex-1"
                                  placeholder="Montant (€)"
                                  value={cond.value}
                                  onChange={e => updateGroupCondition(gIdx, cIdx, { value: e.target.value })}
                                />
                              ) : (
                                <input
                                  className="input text-xs py-1 flex-1"
                                  placeholder="Valeur"
                                  value={cond.value}
                                  onChange={e => updateGroupCondition(gIdx, cIdx, { value: e.target.value })}
                                />
                              )}
                              {group.conditions.length > 1 && (
                                <button
                                  className="text-gray-400 hover:text-red-500 flex-shrink-0"
                                  onClick={() => removeGroupCondition(gIdx, cIdx)}
                                >
                                  <X size={13} />
                                </button>
                              )}
                            </div>
                          );
                        })}

                        <button
                          className="text-xs text-tennis-green hover:underline flex items-center gap-1 pt-0.5"
                          onClick={() => addGroupCondition(gIdx)}
                        >
                          <Plus size={11} /> Ajouter une condition
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  className="mt-2 text-xs text-indigo-500 hover:underline flex items-center gap-1"
                  onClick={addGroup}
                >
                  <Plus size={11} /> Ajouter un groupe (parenthèses)
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
    </>
  );
}

// ─── Import Tab ───────────────────────────────────────────────────────────────

interface ImportTabProps {
  periods: AccountingPeriod[];
  imports: BankImport[];
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

function ImportTab({ periods, imports, onImportDone, onGoToOperations }: ImportTabProps) {
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

  const fetchFile = async (importId: string, forDownload: boolean, fileName: string) => {
    try {
      const token = getToken();
      const url = `/api/accounting/imports/${importId}/file${forDownload ? '?download=1' : ''}`;
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) { alert('Fichier source non disponible'); return; }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (forDownload) {
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = fileName;
        a.click();
      } else {
        window.open(objectUrl, '_blank');
      }
      setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
    } catch {
      alert('Impossible de récupérer le fichier');
    }
  };

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

      {/* Historique des imports */}
      {imports.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
            Historique des imports
          </h3>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Libellé</th>
                  <th className="px-4 py-2.5">Fichier source</th>
                  <th className="px-4 py-2.5 text-right">Opérations</th>
                </tr>
              </thead>
              <tbody>
                {imports.map(imp => (
                  <tr key={imp.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                      {fmtDate(imp.importedAt)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">
                      {imp.label}
                    </td>
                    <td className="px-4 py-2.5">
                      {imp.storedFileName ? (
                        <div className="flex items-center gap-2">
                          <button
                            className="text-indigo-600 hover:text-indigo-800 hover:underline text-sm flex items-center gap-1 truncate max-w-[220px]"
                            onClick={() => fetchFile(imp.id, false, imp.fileName)}
                            title="Ouvrir le fichier"
                          >
                            <ExternalLink size={12} className="flex-shrink-0" />
                            <span className="truncate">{imp.fileName}</span>
                          </button>
                          <button
                            className="text-gray-400 hover:text-gray-700 flex-shrink-0 transition-colors"
                            onClick={() => fetchFile(imp.id, true, imp.fileName)}
                            title="Télécharger le fichier"
                          >
                            <Download size={14} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs italic">{imp.fileName} (non conservé)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">
                      {imp.operationCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

// ─── Period Detail View ───────────────────────────────────────────────────────

type PeriodSortMode = 'category' | 'direction' | 'thirdParty';

interface CategoryGroup {
  category: string;
  ops: BankOperation[];
  totalCredit: number;
  totalDebit: number;
}

interface PeriodDetailViewProps {
  period: AccountingPeriod;
  onBack: () => void;
}

function PeriodDetailView({ period, onBack }: PeriodDetailViewProps) {
  const [operations, setOperations] = useState<BankOperation[]>([]);
  const [loading, setLoading]       = useState(true);
  const [sortMode, setSortMode]     = useState<PeriodSortMode>('category');
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    api.get<BankOperation[]>(`/accounting/operations?periodId=${period.id}`)
      .then(data => setOperations(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period.id]);

  const groups = useMemo<CategoryGroup[]>(() => {
    // Clé de regroupement selon le mode
    const getKey = (op: BankOperation): string => {
      if (sortMode === 'thirdParty') return op.thirdParty || op.rawLabel || '(Tiers inconnu)';
      return op.category || '(Sans catégorie)';
    };

    const map = new Map<string, BankOperation[]>();
    for (const op of operations) {
      const key = getKey(op);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(op);
    }
    const result: CategoryGroup[] = Array.from(map.entries()).map(([category, ops]) => {
      const sorted = [...ops].sort((a, b) => a.operationDate.localeCompare(b.operationDate));
      const totalCredit = ops.filter(o => o.direction === 'credit').reduce((s, o) => s + o.amount, 0);
      const totalDebit  = ops.filter(o => o.direction === 'debit' ).reduce((s, o) => s + o.amount, 0);
      return { category, ops: sorted, totalCredit, totalDebit };
    });

    const alphaCmp = (a: CategoryGroup, b: CategoryGroup) =>
      a.category.localeCompare(b.category, 'fr', { sensitivity: 'base' });

    if (sortMode === 'category' || sortMode === 'thirdParty') {
      result.sort(alphaCmp);
    } else {
      // Tri par sens : crédits nets d'abord, puis mixtes, puis débits nets
      const dirOrder = (g: CategoryGroup) =>
        g.totalCredit > 0 && g.totalDebit === 0 ? 0 :
        g.totalCredit === 0 && g.totalDebit > 0 ? 2 : 1;
      result.sort((a, b) => {
        const d = dirOrder(a) - dirOrder(b);
        return d !== 0 ? d : alphaCmp(a, b);
      });
    }
    return result;
  }, [operations, sortMode]);

  const totalCredit = operations.filter(o => o.direction === 'credit').reduce((s, o) => s + o.amount, 0);
  const totalDebit  = operations.filter(o => o.direction === 'debit' ).reduce((s, o) => s + o.amount, 0);
  const solde = totalCredit - totalDebit;

  const toggleCategory = (cat: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  const fmtD = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR');

  // Pour l'affichage en mode "par sens", insérer des séparateurs de section
  type Row = { type: 'group'; g: CategoryGroup } | { type: 'header'; label: string };
  const rows = useMemo<Row[]>(() => {
    if (sortMode !== 'direction') return groups.map(g => ({ type: 'group', g }));
    const result: Row[] = [];
    let lastSection = -1;
    const dirOrder = (g: CategoryGroup) =>
      g.totalCredit > 0 && g.totalDebit === 0 ? 0 :
      g.totalCredit === 0 && g.totalDebit > 0 ? 2 : 1;
    const sectionLabels = ['Crédits', 'Mixte', 'Débits'];
    for (const g of groups) {
      const sec = dirOrder(g);
      if (sec !== lastSection) {
        result.push({ type: 'header', label: sectionLabels[sec] });
        lastSection = sec;
      }
      result.push({ type: 'group', g });
    }
    return result;
  }, [groups, sortMode]);

  return (
    <div>
      {/* En-tête */}
      <div className="flex items-center gap-3 mb-4">
        <button
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          onClick={onBack}
          title="Retour aux périodes"
        >
          <ChevronLeft size={18} />
        </button>
        <div>
          <h2 className="text-base font-semibold text-gray-800">{period.label}</h2>
          <p className="text-xs text-gray-400">{fmtD(period.startDate)} – {fmtD(period.endDate)}</p>
        </div>

        {/* Tri */}
        <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {([['category', 'Catégories'], ['direction', 'Par sens'], ['thirdParty', 'Par tiers']] as [PeriodSortMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium ${
                sortMode === mode
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setSortMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Résumé global */}
      {!loading && operations.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="card py-3 px-4">
            <p className="text-xs text-gray-400 mb-0.5">Opérations</p>
            <p className="text-lg font-bold text-gray-700">{operations.length}</p>
          </div>
          <div className="card py-3 px-4">
            <p className="text-xs text-gray-400 mb-0.5">Total crédits</p>
            <p className="text-lg font-bold text-green-600">+{fmtCurrency(totalCredit)}</p>
          </div>
          <div className="card py-3 px-4">
            <p className="text-xs text-gray-400 mb-0.5">Total débits</p>
            <p className="text-lg font-bold text-red-500">−{fmtCurrency(totalDebit)}</p>
          </div>
          <div className="card py-3 px-4">
            <p className="text-xs text-gray-400 mb-0.5">Solde</p>
            <p className={`text-lg font-bold ${solde >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {solde >= 0 ? '+' : '−'}{fmtCurrency(Math.abs(solde))}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card p-10 text-center text-gray-400 text-sm">Chargement…</div>
      ) : operations.length === 0 ? (
        <div className="card p-10 text-center text-gray-400 text-sm">Aucune opération rattachée à cette période.</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                <th className="px-3 py-2.5 w-6"></th>
                <th className="px-3 py-2.5">{sortMode === 'thirdParty' ? 'Tiers' : 'Catégorie'}</th>
                <th className="px-3 py-2.5 text-center">Opérations</th>
                <th className="px-3 py-2.5 text-right text-green-700">Crédits</th>
                <th className="px-3 py-2.5 text-right text-red-500">Débits</th>
                <th className="px-3 py-2.5 text-right">Solde</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                if (row.type === 'header') {
                  return (
                    <tr key={`hdr-${idx}`}>
                      <td colSpan={6} className="px-3 py-1.5 bg-gray-50 border-y border-gray-100">
                        <span className={`text-xs font-semibold uppercase tracking-wider ${
                          row.label === 'Crédits' ? 'text-green-600' :
                          row.label === 'Débits'  ? 'text-red-500' : 'text-gray-400'
                        }`}>{row.label}</span>
                      </td>
                    </tr>
                  );
                }
                const { g } = row;
                const isOpen = expanded.has(g.category);
                const soldeG = g.totalCredit - g.totalDebit;
                return (
                  <>
                    <tr
                      key={g.category}
                      className="border-b border-gray-50 hover:bg-gray-50/60 cursor-pointer"
                      onClick={() => toggleCategory(g.category)}
                    >
                      <td className="px-3 py-2.5 text-gray-400">
                        <ChevronDown size={13} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </td>
                      <td className="px-3 py-2.5 font-medium text-gray-800">
                        {g.category === '(Sans catégorie)'
                          ? <span className="italic text-gray-400">{g.category}</span>
                          : g.category}
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{g.ops.length}</td>
                      <td className="px-3 py-2.5 text-right text-green-600 font-medium">
                        {g.totalCredit > 0 ? `+${fmtCurrency(g.totalCredit)}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-red-500 font-medium">
                        {g.totalDebit > 0 ? `−${fmtCurrency(g.totalDebit)}` : '—'}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${soldeG >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {soldeG >= 0 ? '+' : '−'}{fmtCurrency(Math.abs(soldeG))}
                      </td>
                    </tr>
                    {isOpen && g.ops.map(op => (
                      <tr key={op.id} className="border-b border-gray-50 bg-gray-50/40 text-xs">
                        <td className="px-3 py-1.5"></td>
                        <td className="px-3 py-1.5 text-gray-400 pl-6" colSpan={1}>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-gray-500">{fmtD(op.operationDate)}</span>
                            <span className="text-gray-700 font-medium truncate max-w-xs" title={op.thirdParty || op.rawLabel || ''}>
                              {op.thirdParty || op.rawLabel || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-center text-gray-400">
                          {PAYMENT_METHOD_LABELS[op.paymentMethod]}
                        </td>
                        <td className="px-3 py-1.5 text-right text-green-600">
                          {op.direction === 'credit' ? `+${fmtCurrency(op.amount)}` : ''}
                        </td>
                        <td className="px-3 py-1.5 text-right text-red-500">
                          {op.direction === 'debit' ? `−${fmtCurrency(op.amount)}` : ''}
                        </td>
                        <td></td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
            {/* Ligne de total */}
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-sm">
                <td></td>
                <td className="px-3 py-2.5 text-gray-700">Total — {operations.length} opération(s)</td>
                <td></td>
                <td className="px-3 py-2.5 text-right text-green-700">+{fmtCurrency(totalCredit)}</td>
                <td className="px-3 py-2.5 text-right text-red-600">−{fmtCurrency(totalDebit)}</td>
                <td className={`px-3 py-2.5 text-right ${solde >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {solde >= 0 ? '+' : '−'}{fmtCurrency(Math.abs(solde))}
                </td>
              </tr>
            </tfoot>
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
  const [selectedPeriod, setSelectedPeriod] = useState<AccountingPeriod | null>(null);
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

  if (selectedPeriod) {
    return <PeriodDetailView period={selectedPeriod} onBack={() => setSelectedPeriod(null)} />;
  }

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
                <tr
                  key={p.id}
                  className="border-b border-gray-50 hover:bg-gray-50/70 cursor-pointer"
                  onClick={() => setSelectedPeriod(p)}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{p.label}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtD(p.startDate)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtD(p.endDate)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{p.importCount}</span>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
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
  const [pendingEditRule, setPendingEditRule] = useState<AccountingRule | null>(null);
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
            imports={imports}
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
          onGoToEditRule={rule => {
            setPendingEditRule(rule);
            setTab('rules');
          }}
        />
      )}

      {tab === 'rules' && (
        <RulesTab
          categories={categories}
          onCategoriesChange={loadCategories}
          openEditRule={pendingEditRule}
          onEditRuleHandled={() => setPendingEditRule(null)}
        />
      )}
    </div>
  );
}
