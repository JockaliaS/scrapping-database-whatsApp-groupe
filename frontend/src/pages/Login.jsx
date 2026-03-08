import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../services/api';
import useAuth from '../hooks/useAuth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginUser } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      loginUser(data.token, data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-light flex flex-col">
      <header className="border-b border-primary/10 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center">
          <div className="flex items-center gap-2">
            <div className="size-8 bg-primary rounded-lg flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-xl">radar</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">RADAR</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-10 text-center">
            <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-2">Connexion</h2>
            <p className="text-lg text-slate-600">Accedez a votre tableau de bord Radar</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="flex flex-col gap-2">
                <span className="mono-label text-xs font-bold text-slate-500">Email</span>
                <input
                  type="email"
                  className="w-full p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-slate-700 bg-slate-50/50"
                  placeholder="vous@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="mono-label text-xs font-bold text-slate-500">Mot de passe</span>
                <input
                  type="password"
                  className="w-full p-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-slate-700 bg-slate-50/50"
                  placeholder="Votre mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                {loading ? 'Connexion...' : 'Se connecter'}
                <span className="material-symbols-outlined text-lg">login</span>
              </button>
            </form>
            <p className="mt-6 text-center text-sm text-slate-500">
              Pas encore de compte ?{' '}
              <Link to="/register" className="text-primary font-semibold hover:underline">
                Creer un compte
              </Link>
            </p>
          </div>
        </div>
      </main>

      <footer className="py-10 text-center text-slate-400 text-sm">
        <p>&copy; 2024 RADAR AI. Tous droits reserves.</p>
      </footer>
    </div>
  );
}
