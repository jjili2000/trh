import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

function TennisBallSVG() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="30" fill="#d4e157" stroke="#c6c900" strokeWidth="2" />
      {/* Seam curves */}
      <path
        d="M 10 22 Q 32 32 10 42"
        stroke="white"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 54 22 Q 32 32 54 42"
        stroke="white"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Login() {
  const { login } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot password modal state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    await new Promise(r => setTimeout(r, 200));
    const result = await login(email, password);
    setLoading(false);
    if (result === true) {
      navigate('/dashboard');
    } else {
      setError(result);
    }
  };

  const handleForgotSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      if (!res.ok) {
        const data = await res.json();
        setForgotError(data.error || 'Une erreur est survenue.');
      } else {
        setForgotSent(true);
      }
    } catch {
      setForgotError('Impossible de joindre le serveur.');
    } finally {
      setForgotLoading(false);
    }
  };

  const closeForgot = () => {
    setShowForgot(false);
    setForgotEmail('');
    setForgotSent(false);
    setForgotError('');
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
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-tennis-green-dark to-tennis-green px-8 py-10 text-center">
            <div className="flex justify-center mb-4">
              <TennisBallSVG />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-wide">Tennis Club RH</h1>
            <p className="text-tennis-green-light mt-1 text-sm">Gestion des Ressources Humaines</p>
          </div>

          {/* Form */}
          <div className="px-8 py-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">Connexion</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label" htmlFor="email">Adresse email</label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  placeholder="nom@tennisclub.fr"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0" htmlFor="password">Mot de passe</label>
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="text-xs text-tennis-green hover:text-tennis-green-dark hover:underline"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
                <input
                  id="password"
                  type="password"
                  className="input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-3 text-base disabled:opacity-60"
              >
                {loading ? 'Connexion...' : 'Se connecter'}
              </button>
            </form>

          </div>
        </div>
      </div>

      {/* Forgot password modal */}
      {showForgot && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) closeForgot(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-gradient-to-r from-tennis-green-dark to-tennis-green px-6 py-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Mot de passe oublié</h3>
              <button
                onClick={closeForgot}
                className="text-white/70 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6">
              {forgotSent ? (
                <div className="text-center space-y-4">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-gray-700 font-medium">Email envoyé !</p>
                  <p className="text-gray-500 text-sm">
                    Si l'adresse <strong>{forgotEmail}</strong> est associée à un compte,
                    vous recevrez un email avec un lien de réinitialisation valable <strong>1 heure</strong>.
                  </p>
                  <button
                    onClick={closeForgot}
                    className="w-full btn-primary py-2.5 mt-2"
                  >
                    Fermer
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-gray-600 text-sm mb-5">
                    Saisissez votre adresse email. Vous recevrez un lien pour réinitialiser votre mot de passe.
                  </p>

                  {forgotError && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                      {forgotError}
                    </div>
                  )}

                  <form onSubmit={handleForgotSubmit} className="space-y-4">
                    <div>
                      <label className="label" htmlFor="forgot-email">Adresse email</label>
                      <input
                        id="forgot-email"
                        type="email"
                        className="input"
                        placeholder="nom@tennisclub.fr"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-3 pt-1">
                      <button
                        type="button"
                        onClick={closeForgot}
                        className="flex-1 btn-secondary py-2.5"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={forgotLoading}
                        className="flex-1 btn-primary py-2.5 disabled:opacity-60"
                      >
                        {forgotLoading ? 'Envoi...' : 'Envoyer'}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
