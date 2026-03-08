import { Link, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth';

export default function Navbar({ connected }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/opportunities', label: 'Opportunites' },
    { to: '/scan', label: 'Scan' },
    { to: '/settings', label: 'Parametres' },
  ];

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-3 backdrop-blur-md lg:px-10">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
            <span className="material-symbols-outlined text-[20px]">radar</span>
          </div>
          <h1 className="font-mono text-xl font-bold tracking-tighter text-text-primary">RADAR</h1>
        </Link>
      </div>

      <div className="hidden items-center md:flex">
        <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5">
          <span className="relative flex h-2 w-2">
            {connected && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
            )}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${connected ? 'bg-primary' : 'bg-slate-400'}`}></span>
          </span>
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-primary">
            {connected ? 'Surveillance Active' : 'Deconnecte'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-sm font-medium transition-colors ${
                location.pathname === link.to
                  ? 'text-primary font-semibold border-b-2 border-primary pb-1'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {link.label}
            </Link>
          ))}
          {user?.role === 'admin' && (
            <Link
              to="/admin"
              className={`text-sm font-medium transition-colors ${
                location.pathname === '/admin'
                  ? 'text-primary font-semibold border-b-2 border-primary pb-1'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Admin
            </Link>
          )}
        </nav>

        <div className="h-6 w-px bg-slate-200"></div>

        <button className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-text-secondary transition-colors hover:bg-slate-200">
          <span className="material-symbols-outlined">notifications</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-slate-900">{user?.name || 'Utilisateur'}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">{user?.role || 'User'}</p>
          </div>
          <button
            onClick={logout}
            className="h-10 w-10 overflow-hidden rounded-full border-2 border-primary/20 bg-primary/10 flex items-center justify-center text-primary font-bold text-sm"
            title="Deconnexion"
          >
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </button>
        </div>
      </div>
    </header>
  );
}
