import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';

function TennisBallSVG() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="30" fill="#d4e157" stroke="#c6c900" strokeWidth="2" />
      <path d="M 10 22 Q 32 32 10 42" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M 54 22 Q 32 32 54 42" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) navigate('/login', { replace: true });
  }, [token, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Une erreur est survenue.');
      } else {
        setSuccess(true);
      }
    } catch {
      setError('Impossible de joindre le serveur.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-tennis-green-dark via-tennis-green to-tennis-green-light px-4">
      {/* Background tennis net pattern */}
      <div className="absolute inset-0 opacity-5">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="net" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M0 20 H40 M20 0 V40" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#net)" />
        </svg>
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-tennis-green-dark to-tennis-green px-8 py-10 text-center">
            <div className="flex justify-center mb-4">
              <TennisBallSVG />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-wide">Tennis Club RH</h1>
            <p className="text-tennis-green-light mt-1 text-sm">Gestion des Ressources Humaines</p>
          </div>

          <div className="px-8 py-8">
            {success ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-800">Mot de passe modifié</h2>
                <p className="text-gray-600 text-sm">
                  Votre mot de passe a été réinitialisé avec succès.
                </p>
                <Link
                  to="/login"
                  className="inline-block w-full btn-primary py-3 text-base text-center mt-2"
                >
                  Se connecter
                </Link>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-gray-800 mb-2 text-center">
                  Nouveau mot de passe
                </h2>
                <p className="text-gray-500 text-sm text-center mb-6">
                  Choisissez un nouveau mot de passe pour votre compte.
                </p>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="label" htmlFor="password">Nouveau mot de passe</label>
                    <input
                      id="password"
                      type="password"
                      className="input"
                      placeholder="Minimum 6 caractères"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="confirm">Confirmer le mot de passe</label>
                    <input
                      id="confirm"
                      type="password"
                      className="input"
                      placeholder="••••••••"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      required
                      autoComplete="new-password"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full btn-primary py-3 text-base disabled:opacity-60"
                  >
                    {loading ? 'Enregistrement...' : 'Enregistrer le mot de passe'}
                  </button>
                </form>

                <div className="mt-4 text-center">
                  <Link to="/login" className="text-sm text-tennis-green hover:underline">
                    ← Retour à la connexion
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
