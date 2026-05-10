import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight } from 'lucide-react';
import { api } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { BudgetRequest, RealBudget, BudgetRequestStatus, RealBudgetStatus } from '../../types';

function useIsBudgetValidator() {
  const { currentUser, validationConfig } = useApp();
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  const pos = currentUser.position;
  if (!pos) return false;
  return validationConfig.budget.positions.includes(pos);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const statusBadge: Record<BudgetRequestStatus, { label: string; cls: string }> = {
  draft:     { label: 'Brouillon', cls: 'bg-gray-100 text-gray-600' },
  submitted: { label: 'Soumise',   cls: 'bg-blue-100 text-blue-700' },
  approved:  { label: 'Approuvée', cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Annulée',   cls: 'bg-red-100 text-red-600' },
};

const realStatusBadge: Record<RealBudgetStatus, { label: string; cls: string }> = {
  active: { label: 'Actif',  cls: 'bg-green-100 text-green-700' },
  closed: { label: 'Clôturé', cls: 'bg-gray-100 text-gray-600' },
};

export default function BudgetList() {
  const navigate = useNavigate();
  const { currentUser, users } = useApp();
  const isTreas = useIsBudgetValidator();
  const [tab, setTab] = useState<'requests' | 'real'>('requests');

  const [requests, setRequests] = useState<BudgetRequest[]>([]);
  const [realBudgets, setRealBudgets] = useState<RealBudget[]>([]);
  const [loadingReq, setLoadingReq] = useState(true);
  const [loadingReal, setLoadingReal] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<BudgetRequest[]>('/budgets/requests')
      .then(setRequests)
      .catch(() => setError('Erreur lors du chargement des demandes'))
      .finally(() => setLoadingReq(false));
  }, []);

  useEffect(() => {
    api.get<RealBudget[]>('/budgets/real')
      .then(setRealBudgets)
      .catch(() => setError('Erreur lors du chargement des budgets réels'))
      .finally(() => setLoadingReal(false));
  }, []);

  const canToggle = (budget: RealBudget) => {
    if (!currentUser) return false;
    return isTreas || budget.userId === currentUser.id;
  };

  const toggleRealStatus = async (budget: RealBudget, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus: RealBudgetStatus = budget.status === 'active' ? 'closed' : 'active';
    try {
      const updated = await api.put<RealBudget>(`/budgets/real/${budget.id}/status`, { status: newStatus });
      setRealBudgets(prev => prev.map(b => b.id === budget.id ? { ...b, status: updated.status } : b));
    } catch {
      setError('Erreur lors de la mise à jour du statut');
    }
  };

  const getUserName = (userId: string) => {
    const u = users.find(u => u.id === userId);
    return u ? `${u.firstName} ${u.lastName}` : userId;
  };

  const showRequesterCol = isTreas;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Budget</h1>
        {tab === 'requests' && (
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => navigate('/budget/requests/new')}
          >
            <Plus size={16} />
            Nouvelle demande
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'requests' ? 'border-tennis-green text-tennis-green' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setTab('requests')}
        >
          Demandes
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'real' ? 'border-tennis-green text-tennis-green' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setTab('real')}
        >
          Budgets réels
        </button>
      </div>

      {tab === 'requests' && (
        <div className="card">
          {loadingReq ? (
            <p className="text-gray-500 py-8 text-center">Chargement…</p>
          ) : requests.length === 0 ? (
            <p className="text-gray-400 py-8 text-center">Aucune demande de budget</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  <th className="pb-3 pr-4">Libellé</th>
                  {showRequesterCol && <th className="pb-3 pr-4">Demandeur</th>}
                  <th className="pb-3 pr-4">Période</th>
                  <th className="pb-3 pr-4">Statut</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody>
                {requests.map(req => {
                  const badge = statusBadge[req.status];
                  return (
                    <tr
                      key={req.id}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/budget/requests/${req.id}`)}
                    >
                      <td className="py-3 pr-4 font-medium text-gray-800">{req.label}</td>
                      {showRequesterCol && (
                        <td className="py-3 pr-4 text-sm text-gray-600">{getUserName(req.userId)}</td>
                      )}
                      <td className="py-3 pr-4 text-sm text-gray-600">
                        {fmtDate(req.startDate)} → {fmtDate(req.endDate)}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-3 text-gray-400">
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'real' && (
        <div className="card">
          {loadingReal ? (
            <p className="text-gray-500 py-8 text-center">Chargement…</p>
          ) : realBudgets.length === 0 ? (
            <p className="text-gray-400 py-8 text-center">Aucun budget réel</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  <th className="pb-3 pr-4">Libellé</th>
                  <th className="pb-3 pr-4">Période</th>
                  <th className="pb-3 pr-4">Statut</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody>
                {realBudgets.map(budget => {
                  const badge = realStatusBadge[budget.status];
                  return (
                    <tr
                      key={budget.id}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/budget/real/${budget.id}`)}
                    >
                      <td className="py-3 pr-4 font-medium text-gray-800">{budget.label}</td>
                      <td className="py-3 pr-4 text-sm text-gray-600">
                        {fmtDate(budget.startDate)} → {fmtDate(budget.endDate)}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                            {badge.label}
                          </span>
                          {canToggle(budget) && (
                            <button
                              onClick={(e) => toggleRealStatus(budget, e)}
                              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                                budget.status === 'active' ? 'bg-green-500' : 'bg-gray-300'
                              }`}
                              title={budget.status === 'active' ? 'Clôturer' : 'Réactiver'}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                                  budget.status === 'active' ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-gray-400">
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
