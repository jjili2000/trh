import { useState, useEffect } from 'react';
import { Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

type Mode = 'AND' | 'OR';

function ConfigSection({
  title,
  description,
  positions,
  mode,
  selectedPositions,
  onModeChange,
  onTogglePosition,
}: {
  title: string;
  description: string;
  positions: string[];
  mode: Mode;
  selectedPositions: string[];
  onModeChange: (m: Mode) => void;
  onTogglePosition: (name: string) => void;
}) {
  return (
    <div className="card mb-6">
      <h3 className="font-semibold text-gray-800 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{description}</p>

      {/* Mode selector */}
      <div className="mb-4">
        <label className="label">Mode de validation</label>
        <div className="flex gap-4 mt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={`mode-${title}`}
              checked={mode === 'OR'}
              onChange={() => onModeChange('OR')}
              className="text-tennis-green"
            />
            <span className="text-sm text-gray-700">
              <strong>OU</strong> — un seul responsable suffit
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={`mode-${title}`}
              checked={mode === 'AND'}
              onChange={() => onModeChange('AND')}
              className="text-tennis-green"
            />
            <span className="text-sm text-gray-700">
              <strong>ET</strong> — tous les responsables doivent valider
            </span>
          </label>
        </div>
      </div>

      {/* Position list */}
      <div>
        <label className="label">Postes validateurs</label>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {positions.map(name => (
            <label key={name} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
              <input
                type="checkbox"
                className="w-4 h-4 text-tennis-green rounded border-gray-300"
                checked={selectedPositions.includes(name)}
                onChange={() => onTogglePosition(name)}
              />
              <span className="text-sm text-gray-700">{name}</span>
            </label>
          ))}
          {positions.length === 0 && (
            <p className="text-sm text-gray-400 col-span-2">
              Aucun poste configuré. Ajoutez des postes dans l'onglet «&nbsp;Types de postes&nbsp;».
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ValidationConfig() {
  const { validationConfig, positions, updateValidationConfig } = useApp();

  const [budgetMode, setBudgetMode]       = useState<Mode>(validationConfig.budget.mode);
  const [budgetPositions, setBudgetPos]   = useState<string[]>(validationConfig.budget.positions);
  const [expensesMode, setExpensesMode]   = useState<Mode>(validationConfig.expenses.mode);
  const [expensesPositions, setExpensesPos] = useState<string[]>(validationConfig.expenses.positions);

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Sync if context updates
  useEffect(() => {
    setBudgetMode(validationConfig.budget.mode);
    setBudgetPos(validationConfig.budget.positions);
    setExpensesMode(validationConfig.expenses.mode);
    setExpensesPos(validationConfig.expenses.positions);
  }, [validationConfig]);

  const positionNames = positions.map(p => p.name).sort();

  const toggleBudgetPos = (name: string) =>
    setBudgetPos(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);

  const toggleExpensesPos = (name: string) =>
    setExpensesPos(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      await updateValidationConfig('budget',   { mode: budgetMode,   positions: budgetPositions });
      await updateValidationConfig('expenses', { mode: expensesMode, positions: expensesPositions });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-semibold text-gray-800">Configuration de validation</h2>
          <p className="text-sm text-gray-400">
            Définissez quels postes peuvent valider les demandes de budget et les notes de frais.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 size={16} /> Enregistré
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-sm text-red-500">
              <AlertCircle size={16} /> Erreur
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            <Save size={16} />
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>

      <ConfigSection
        title="Validation des budgets"
        description="Les utilisateurs dont le poste figure dans cette liste pourront approuver ou renvoyer les demandes de budget."
        positions={positionNames}
        mode={budgetMode}
        selectedPositions={budgetPositions}
        onModeChange={setBudgetMode}
        onTogglePosition={toggleBudgetPos}
      />

      <ConfigSection
        title="Validation des notes de frais"
        description="Les utilisateurs dont le poste figure dans cette liste pourront approuver ou rejeter les notes de frais."
        positions={positionNames}
        mode={expensesMode}
        selectedPositions={expensesPositions}
        onModeChange={setExpensesMode}
        onTogglePosition={toggleExpensesPos}
      />
    </div>
  );
}
