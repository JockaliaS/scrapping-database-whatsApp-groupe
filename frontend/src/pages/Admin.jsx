import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import useWebSocket from '../hooks/useWebSocket';
import {
  getAdminUsers,
  updateAdminUser,
  getAdminConfig,
  updateAdminConfig,
  getHealth,
} from '../services/api';

export default function Admin() {
  const { connected } = useWebSocket();

  const [users, setUsers] = useState([]);
  const [config, setConfig] = useState({});
  const [health, setHealth] = useState(null);

  // Integration fields
  const [evoUrl, setEvoUrl] = useState('');
  const [evoKey, setEvoKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('Gemini 1.5 Pro (Latest)');
  const [geminiKey, setGeminiKey] = useState('');
  const [showEvoKey, setShowEvoKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  useEffect(() => {
    getAdminUsers()
      .then(setUsers)
      .catch(() => {});
    getAdminConfig()
      .then((data) => {
        setConfig(data);
        setEvoUrl(data.evolution_api_url || '');
        setEvoKey(data.evolution_api_key || '');
        setGeminiModel(data.gemini_model || 'Gemini 1.5 Pro (Latest)');
        setGeminiKey(data.gemini_api_key || '');
      })
      .catch(() => {});
    getHealth()
      .then(setHealth)
      .catch(() => {});
  }, []);

  const handleSaveConfig = async () => {
    try {
      await updateAdminConfig({
        evolution_api_url: evoUrl,
        evolution_api_key: evoKey,
        gemini_model: geminiModel,
        gemini_api_key: geminiKey,
      });
    } catch {
      // ignore
    }
  };

  return (
    <div className="bg-background-light font-display text-slate-900 min-h-screen flex flex-col">
      <Navbar connected={connected} />

      <main className="max-w-7xl mx-auto p-6 lg:p-10 space-y-12 w-full">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Parametres & Administration</h2>
            <p className="text-slate-500 mt-1 italic">Gerez vos integrations, utilisateurs et l'etat du systeme Radar.</p>
          </div>
          <div className="flex items-center gap-2 text-sm font-mono text-slate-400 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            SYSTEME OPERATIONNEL
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Integrations */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <span className="material-symbols-outlined text-primary">extension</span>
                <h3 className="text-lg font-bold">Integrations</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Evolution API Card */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-50 rounded-lg">
                        <span className="material-symbols-outlined text-primary">hub</span>
                      </div>
                      <h4 className="font-bold">Evolution API</h4>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider">Connecte</span>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase text-slate-400 font-mono tracking-wider">Endpoint URL</label>
                      <input
                        className="w-full bg-slate-50 border-slate-200 rounded-lg text-sm font-mono focus:ring-primary focus:border-primary"
                        type="text"
                        value={evoUrl}
                        onChange={(e) => setEvoUrl(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase text-slate-400 font-mono tracking-wider">Cle API</label>
                      <div className="relative">
                        <input
                          className="w-full bg-slate-50 border-slate-200 rounded-lg text-sm font-mono focus:ring-primary focus:border-primary"
                          type={showEvoKey ? 'text' : 'password'}
                          value={evoKey}
                          onChange={(e) => setEvoKey(e.target.value)}
                        />
                        <button
                          onClick={() => setShowEvoKey(!showEvoKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary"
                        >
                          <span className="material-symbols-outlined text-sm">{showEvoKey ? 'visibility' : 'visibility_off'}</span>
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={handleSaveConfig}
                      className="w-full py-2 bg-primary text-white text-sm font-bold rounded-lg hover:brightness-110 transition-all flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">sync_alt</span>
                      Tester la connexion
                    </button>
                  </div>
                </div>

                {/* Gemini API Card */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <span className="material-symbols-outlined text-blue-500">psychology</span>
                      </div>
                      <h4 className="font-bold">Gemini API</h4>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-600 border border-amber-200 uppercase tracking-wider">Action Requise</span>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase text-slate-400 font-mono tracking-wider">Modele selectionne</label>
                      <select
                        className="w-full bg-slate-50 border-slate-200 rounded-lg text-sm focus:ring-primary focus:border-primary"
                        value={geminiModel}
                        onChange={(e) => setGeminiModel(e.target.value)}
                      >
                        <option>Gemini 1.5 Pro (Latest)</option>
                        <option>Gemini 1.5 Flash</option>
                        <option>Gemini 1.0 Ultra</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase text-slate-400 font-mono tracking-wider">Cle API</label>
                      <div className="relative">
                        <input
                          className="w-full bg-slate-50 border-slate-200 rounded-lg text-sm font-mono focus:ring-primary focus:border-primary"
                          type={showGeminiKey ? 'text' : 'password'}
                          placeholder="Saisir la cle API Gemini"
                          value={geminiKey}
                          onChange={(e) => setGeminiKey(e.target.value)}
                        />
                        <button
                          onClick={() => setShowGeminiKey(!showGeminiKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary"
                        >
                          <span className="material-symbols-outlined text-sm">{showGeminiKey ? 'visibility_off' : 'visibility'}</span>
                        </button>
                      </div>
                    </div>
                    <button className="w-full py-2 bg-slate-100 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-200 transition-all">
                      Tester l'IA
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Users Table */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">group</span>
                  <h3 className="text-lg font-bold">Utilisateurs & Profils</h3>
                </div>
                <button className="bg-primary hover:brightness-110 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all">
                  <span className="material-symbols-outlined text-sm">person_add</span>
                  Inviter un utilisateur
                </button>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-mono text-[11px] uppercase tracking-wider">
                      <th className="px-4 py-3 border-b border-slate-200">Utilisateur</th>
                      <th className="px-4 py-3 border-b border-slate-200">Email</th>
                      <th className="px-4 py-3 border-b border-slate-200">Groupes</th>
                      <th className="px-4 py-3 border-b border-slate-200">Statut</th>
                      <th className="px-4 py-3 border-b border-slate-200 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((user, i) => (
                      <tr key={user.id || i}>
                        <td className="px-4 py-3 font-semibold">{user.name || 'N/A'}</td>
                        <td className="px-4 py-3 text-slate-500">{user.email || ''}</td>
                        <td className="px-4 py-3">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold">
                            {user.groups_count || 0} groupes
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`flex items-center gap-1.5 font-bold text-xs uppercase ${user.is_active ? 'text-primary' : 'text-slate-400'}`}>
                            <span className={`size-1.5 rounded-full ${user.is_active ? 'bg-primary' : 'bg-slate-300'}`}></span>
                            {user.is_active ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2 text-slate-400">
                            <button className="hover:text-primary transition-colors">
                              <span className="material-symbols-outlined text-lg">edit</span>
                            </button>
                            <button className="hover:text-red-500 transition-colors">
                              <span className="material-symbols-outlined text-lg">block</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan="5" className="px-4 py-8 text-center text-slate-400">Aucun utilisateur</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100 text-amber-800 text-xs italic">
                <span className="material-symbols-outlined text-sm">info</span>
                Les utilisateurs standards n'ont pas acces aux parametres de l'administration.
              </div>
            </section>
          </div>

          {/* Right Column */}
          <div className="space-y-8">
            {/* System Health */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">analytics</span>
                  <h3 className="text-lg font-bold">Etat du Systeme</h3>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Frontend Version</p>
                    <p className="font-bold text-sm">v1.0.0</p>
                  </div>
                  <span className="material-symbols-outlined text-primary text-xl">check_circle</span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Backend API</p>
                    <p className="font-bold text-sm">{health?.version || 'N/A'}</p>
                  </div>
                  <span className={`material-symbols-outlined text-xl ${health ? 'text-primary' : 'text-slate-300'}`}>
                    {health ? 'check_circle' : 'error'}
                  </span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Base de donnees</p>
                    <p className="font-bold text-sm">PostgreSQL Cluster</p>
                  </div>
                  <div className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded">ACTIVE</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">WebSockets</p>
                    <p className="font-bold text-sm">{connected ? 'Connexion Active' : 'Deconnecte'}</p>
                  </div>
                  <span className="material-symbols-outlined text-primary text-xl">dynamic_feed</span>
                </div>
              </div>
            </section>

            {/* Collaborative Mode */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <span className="material-symbols-outlined text-primary">diversity_3</span>
                <h3 className="text-lg font-bold">Mode Collaboratif</h3>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
                <p className="text-sm text-slate-500 italic leading-relaxed">
                  Permettez a vos agents de partager la meme base d'opportunites pour une collaboration en temps reel.
                </p>
                <div className="space-y-3">
                  {users.slice(0, 5).map((u, i) => (
                    <div key={u.id || i} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg transition-colors">
                      <span className="text-sm font-medium">{u.name || u.email}</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked={u.is_active} className="sr-only peer" />
                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Notification Templates */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <span className="material-symbols-outlined text-primary">notifications_active</span>
            <h3 className="text-lg font-bold">Modeles de Notification</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                <h4 className="font-bold text-sm">Alerte Nouvelle Opportunite</h4>
                <span className="text-[10px] font-mono text-slate-400">ID: NOTIF_01</span>
              </div>
              <div className="p-4 flex-grow">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <p className="text-xs text-slate-500 font-mono italic">
                    "Bonjour {'{{user}}'}, une nouvelle opportunite est disponible sur {'{{platform}}'}..."
                  </p>
                </div>
              </div>
              <div className="px-4 py-3 bg-slate-50/50 flex justify-between items-center">
                <span className="text-xs text-slate-400">Derniere modif: 2j</span>
                <button className="text-primary hover:underline text-sm font-bold flex items-center gap-1">
                  <span className="material-symbols-outlined text-base">edit_note</span> Editer
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                <h4 className="font-bold text-sm">Rapport Hebdomadaire</h4>
                <span className="text-[10px] font-mono text-slate-400">ID: NOTIF_02</span>
              </div>
              <div className="p-4 flex-grow">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <p className="text-xs text-slate-500 font-mono italic">
                    "Voici votre resume de la semaine. Total des detections : {'{{count}}'}..."
                  </p>
                </div>
              </div>
              <div className="px-4 py-3 bg-slate-50/50 flex justify-between items-center">
                <span className="text-xs text-slate-400">Derniere modif: 15j</span>
                <button className="text-primary hover:underline text-sm font-bold flex items-center gap-1">
                  <span className="material-symbols-outlined text-base">edit_note</span> Editer
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 border-dashed overflow-hidden flex flex-col group cursor-pointer hover:border-primary/50 transition-colors">
              <div className="flex-grow flex flex-col items-center justify-center p-8 text-slate-400 group-hover:text-primary">
                <span className="material-symbols-outlined text-4xl mb-2">add_circle</span>
                <p className="text-sm font-bold uppercase tracking-wider">Creer un modele</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-10 text-center border-t border-slate-200 text-slate-400 text-sm w-full">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">radar</span>
            <span className="font-mono font-bold">RADAR Admin v1.0.0</span>
          </div>
          <p>&copy; 2024 RADAR SaaS. Tous droits reserves.</p>
        </div>
      </footer>
    </div>
  );
}
