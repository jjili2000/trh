import { useNavigate } from 'react-router-dom';
import { Clock, Calendar, Receipt, Users, TrendingUp, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ElementType } from 'react';

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  onClick,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: ElementType;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="card text-left hover:shadow-md transition-shadow cursor-pointer w-full group"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
        </div>
        <div className={`p-3 rounded-xl ${color} group-hover:scale-110 transition-transform`}>
          <Icon size={22} className="text-white" />
        </div>
      </div>
    </button>
  );
}

export default function Dashboard() {
  const { currentUser, timeEntries, absenceRequests, expenses, documents, users } = useApp();
  const navigate = useNavigate();

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Time this month
  const myTimeEntries = timeEntries.filter(e => {
    if (currentUser?.role === 'admin') return true;
    const isOwn = e.userId === currentUser?.id;
    const isSubordinate =
      currentUser?.role === 'manager' &&
      users.find(u => u.id === e.userId)?.managerId === currentUser.id;
    return isOwn || isSubordinate;
  });

  const hoursThisMonth = myTimeEntries
    .filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear && e.userId === currentUser?.id;
    })
    .reduce((sum, e) => sum + e.hours, 0);

  const pendingTime = myTimeEntries.filter(e => e.status === 'pending').length;

  // Absences
  const myAbsences = absenceRequests.filter(r => {
    if (currentUser?.role === 'admin') return true;
    const isOwn = r.userId === currentUser?.id;
    const isSubordinate =
      currentUser?.role === 'manager' &&
      users.find(u => u.id === r.userId)?.managerId === currentUser.id;
    return isOwn || isSubordinate;
  });
  const pendingAbsences = myAbsences.filter(r => r.status === 'pending').length;

  // Expenses
  const myExpenses = expenses.filter(e => {
    if (currentUser?.role === 'admin') return true;
    const isOwn = e.userId === currentUser?.id;
    const isSubordinate =
      currentUser?.role === 'manager' &&
      users.find(u => u.id === e.userId)?.managerId === currentUser.id;
    return isOwn || isSubordinate;
  });
  const pendingExpenses = myExpenses.filter(e => e.status === 'pending').length;

  // Documents
  const pendingDocuments = documents.filter(d => d.status === 'pending_validation').length;
  const myValidatedDocuments = documents.filter(d =>
    d.userId === currentUser?.id && d.status === 'validated'
  ).length;

  const isAdmin = currentUser?.role === 'admin';
  const isManagerOrAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const greeting = () => {
    const h = now.getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting()}, {currentUser?.firstName} !
        </h1>
        <p className="text-gray-500 mt-1">
          {now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Summary bar */}
      {isManagerOrAdmin && (pendingTime > 0 || pendingAbsences > 0 || pendingExpenses > 0) && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
          <AlertCircle size={20} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            Vous avez{' '}
            {[
              pendingTime > 0 && `${pendingTime} saisie(s) de temps`,
              pendingAbsences > 0 && `${pendingAbsences} demande(s) d'absence`,
              pendingExpenses > 0 && `${pendingExpenses} note(s) de frais`,
            ]
              .filter(Boolean)
              .join(', ')}{' '}
            en attente de validation.
          </p>
        </div>
      )}

      {/* Module cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard
          title="Gestion du temps"
          value={`${hoursThisMonth}h`}
          subtitle={`${pendingTime} en attente`}
          icon={Clock}
          color="bg-tennis-green"
          onClick={() => navigate('/time')}
        />
        <StatCard
          title="Absences"
          value={pendingAbsences}
          subtitle="demandes en attente"
          icon={Calendar}
          color="bg-blue-500"
          onClick={() => navigate('/absences')}
        />
        <StatCard
          title="Notes de frais"
          value={pendingExpenses}
          subtitle="en attente de validation"
          icon={Receipt}
          color="bg-orange-500"
          onClick={() => navigate('/expenses')}
        />
        {isManagerOrAdmin ? (
          <StatCard
            title="Documents"
            value={pendingDocuments}
            subtitle="en attente de validation"
            icon={FileText}
            color="bg-teal-500"
            onClick={() => navigate('/documents')}
          />
        ) : (
          <StatCard
            title="Mes documents"
            value={myValidatedDocuments}
            subtitle="documents disponibles"
            icon={FileText}
            color="bg-teal-500"
            onClick={() => navigate('/my-documents')}
          />
        )}
        {isAdmin ? (
          <StatCard
            title="Utilisateurs"
            value={users.length}
            subtitle="membres enregistrés"
            icon={Users}
            color="bg-purple-500"
            onClick={() => navigate('/admin')}
          />
        ) : (
          <StatCard
            title="Ce mois-ci"
            value={`${hoursThisMonth}h`}
            subtitle="heures travaillées"
            icon={TrendingUp}
            color="bg-tennis-green-light"
            onClick={() => navigate('/time')}
          />
        )}
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent time entries */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Dernières saisies de temps</h2>
            <button
              onClick={() => navigate('/time')}
              className="text-sm text-tennis-green hover:underline"
            >
              Voir tout
            </button>
          </div>
          {myTimeEntries.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucune saisie</p>
          ) : (
            <div className="space-y-3">
              {myTimeEntries
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 4)
                .map(entry => {
                  const entryUser = users.find(u => u.id === entry.userId);
                  return (
                    <div key={entry.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {entryUser?.firstName} {entryUser?.lastName}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(entry.date).toLocaleDateString('fr-FR')} · {entry.hours}h
                        </p>
                      </div>
                      <span className={`badge-${entry.status}`}>
                        {entry.status === 'pending' ? 'En attente' : entry.status === 'approved' ? 'Approuvé' : 'Rejeté'}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Recent absence requests */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Dernières absences</h2>
            <button
              onClick={() => navigate('/absences')}
              className="text-sm text-tennis-green hover:underline"
            >
              Voir tout
            </button>
          </div>
          {myAbsences.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucune demande</p>
          ) : (
            <div className="space-y-3">
              {myAbsences
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 4)
                .map(req => {
                  const reqUser = users.find(u => u.id === req.userId);
                  const typeLabels = {
                    vacation: 'Congés',
                    sick: 'Maladie',
                    personal: 'Personnel',
                    other: 'Autre',
                  };
                  return (
                    <div key={req.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {reqUser?.firstName} {reqUser?.lastName}
                        </p>
                        <p className="text-xs text-gray-400">
                          {typeLabels[req.type]} · {new Date(req.startDate).toLocaleDateString('fr-FR')}
                          {' → '}
                          {new Date(req.endDate).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <span className={`badge-${req.status}`}>
                        {req.status === 'pending' ? 'En attente' : req.status === 'approved' ? 'Approuvé' : 'Rejeté'}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-6 card">
        <h2 className="font-semibold text-gray-900 mb-4">Actions rapides</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate('/time')} className="btn-primary flex items-center gap-2">
            <Clock size={16} />
            Saisir des heures
          </button>
          <button onClick={() => navigate('/absences')} className="btn-secondary flex items-center gap-2">
            <Calendar size={16} />
            Déclarer une absence
          </button>
          <button onClick={() => navigate('/expenses')} className="btn-secondary flex items-center gap-2">
            <Receipt size={16} />
            Soumettre une note de frais
          </button>
          {isManagerOrAdmin && (
            <button onClick={() => navigate('/admin')} className="btn-secondary flex items-center gap-2">
              <CheckCircle size={16} />
              Valider les demandes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
