import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import useWebSocket from '../hooks/useWebSocket';
import { getGroups, startHistoricalScan, getScanStatus } from '../services/api';

export default function Scan() {
  const { connected } = useWebSocket();
  const navigate = useNavigate();

  const [groups, setGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [period, setPeriod] = useState('30 jours');
  const [warningVisible, setWarningVisible] = useState(true);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [scanId, setScanId] = useState(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanGroupName, setScanGroupName] = useState('');
  const [messagesAnalyzed, setMessagesAnalyzed] = useState(0);
  const [matchesFound, setMatchesFound] = useState(0);

  // Last scan results
  const [lastScan, setLastScan] = useState({
    totalScanned: 0,
    matches: 0,
    newContacts: 0,
  });

  const pollRef = useRef(null);

  useEffect(() => {
    getGroups()
      .then((data) => {
        const g = Array.isArray(data) ? data : [];
        setGroups(g);
      })
      .catch(() => {});
  }, []);

  const handleToggleGroup = (id) => {
    setSelectedGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const handleStartScan = async () => {
    if (selectedGroups.length === 0) return;
    setScanning(true);
    setScanProgress(0);
    setMessagesAnalyzed(0);
    setMatchesFound(0);

    try {
      const result = await startHistoricalScan(selectedGroups);
      setScanId(result.scan_id);

      // Poll status
      pollRef.current = setInterval(async () => {
        try {
          const status = await getScanStatus(result.scan_id);
          setScanProgress(status.progress || 0);
          setScanGroupName(status.current_group || '');
          setMessagesAnalyzed(status.messages_analyzed || 0);
          setMatchesFound(status.matches_found || 0);

          if (status.progress >= 100 || status.status === 'completed') {
            clearInterval(pollRef.current);
            setScanning(false);
            setLastScan({
              totalScanned: status.messages_analyzed || 0,
              matches: status.matches_found || 0,
              newContacts: status.new_contacts || 0,
            });
          }
        } catch {
          // ignore poll errors
        }
      }, 2000);
    } catch {
      setScanning(false);
    }
  };

  const handleCancelScan = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const periods = ['7 jours', '30 jours', '3 mois', 'Personnalise'];

  return (
    <div className="bg-background-light text-slate-900 min-h-screen flex flex-col">
      <Navbar connected={connected} />

      <main className="flex flex-1 justify-center py-8">
        <div className="flex flex-col w-full max-w-[1024px] px-6 gap-8">
          {/* Title */}
          <div className="flex flex-col gap-2">
            <h1 className="text-slate-900 text-4xl font-black leading-tight tracking-[-0.033em]">Scan historique</h1>
            <p className="text-slate-500 text-lg">Analysez manuellement les messages passes de vos groupes connectes.</p>
          </div>

          {/* Warning Banner */}
          {warningVisible && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex flex-col sm:flex-row items-start justify-between gap-4">
              <div className="flex gap-3">
                <span className="material-symbols-outlined text-amber-600 mt-0.5">warning</span>
                <div className="flex flex-col gap-1">
                  <p className="text-amber-900 text-sm font-bold leading-tight">Limites de l'API WhatsApp</p>
                  <p className="text-amber-800 text-sm font-normal leading-relaxed">
                    Les limites de l'API restreignent l'acces aux messages historiques. Vos resultats dependent de ce que WhatsApp rend disponible. Votre base de donnees s'enrichira au fil du temps a mesure que Radar surveille vos groupes en continu.
                  </p>
                </div>
              </div>
              <button onClick={() => setWarningVisible(false)} className="flex p-1 text-amber-500 hover:text-amber-700 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              {/* Configure Scan */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-slate-900 text-xl font-bold mb-6 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">settings</span>
                  Configurer le scan
                </h3>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-3">Selectionner les groupes</label>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                      {groups.map((group) => (
                        <label key={group.id} className="flex items-center p-3 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedGroups.includes(group.id)}
                            onChange={() => handleToggleGroup(group.id)}
                            className="rounded text-primary focus:ring-primary h-5 w-5 mr-3"
                          />
                          <span className="flex-1 font-medium text-slate-800">{group.name}</span>
                          <span className="text-xs mono-text bg-slate-100 px-2 py-1 rounded">{group.member_count || 0} membres</span>
                        </label>
                      ))}
                      {groups.length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-4">Aucun groupe disponible</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-3">Periode d'analyse</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                      {periods.map((p) => (
                        <button
                          key={p}
                          onClick={() => setPeriod(p)}
                          className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all ${
                            period === p
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-slate-200 hover:border-primary text-slate-600 hover:text-primary'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={handleStartScan}
                    disabled={scanning || selectedGroups.length === 0}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-white font-bold py-4 rounded-xl hover:bg-primary/90 transition-all shadow-md mt-4 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined">rocket_launch</span>
                    Lancer le scan historique
                  </button>
                </div>
              </div>

              {/* Scan in progress */}
              {scanning && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                      <div className="size-2 bg-primary rounded-full animate-pulse"></div>
                      <h3 className="text-slate-900 text-lg font-bold">Scan en cours</h3>
                    </div>
                    <button onClick={handleCancelScan} className="text-xs font-bold text-rose-500 hover:text-rose-700 underline flex items-center gap-1">
                      Annuler le scan
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-600 font-medium">
                        Analyse : <span className="text-primary">{scanGroupName || '...'}</span>
                      </span>
                      <span className="mono-text font-bold text-primary">{scanProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${scanProgress}%` }}></div>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Messages analyses</span>
                        <span className="mono-text text-lg font-bold text-slate-700">{messagesAnalyzed.toLocaleString()}</span>
                      </div>
                      <div className="h-8 w-px bg-slate-200"></div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Correspondances</span>
                        <span className="mono-text text-lg font-bold text-primary">{matchesFound}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* Last Scan Summary */}
              <div className="bg-slate-900 text-white rounded-xl shadow-xl p-6 overflow-hidden relative">
                <div className="absolute -top-12 -right-12 w-40 h-40 bg-primary/20 rounded-full blur-3xl"></div>
                <h3 className="text-lg font-bold mb-8 relative z-10 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">analytics</span>
                  Dernier resume de scan
                </h3>
                <div className="space-y-6 relative z-10">
                  <div className="flex justify-between items-end border-b border-white/10 pb-4">
                    <div className="flex flex-col gap-1">
                      <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Total scannes</p>
                      <p className="mono-text text-2xl font-black">{lastScan.totalScanned.toLocaleString()}</p>
                    </div>
                    <span className="text-xs text-primary bg-primary/10 px-2 py-1 rounded">Messages</span>
                  </div>
                  <div className="flex justify-between items-end border-b border-white/10 pb-4">
                    <div className="flex flex-col gap-1">
                      <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Correspondances</p>
                      <p className="mono-text text-2xl font-black text-primary">{lastScan.matches}</p>
                    </div>
                    <span className="material-symbols-outlined text-primary">target</span>
                  </div>
                  <div className="flex justify-between items-end border-b border-white/10 pb-4">
                    <div className="flex flex-col gap-1">
                      <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Nouveaux contacts</p>
                      <p className="mono-text text-2xl font-black text-white">{lastScan.newContacts}</p>
                    </div>
                    <span className="material-symbols-outlined text-white/50">person_add</span>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/opportunities')}
                  className="w-full mt-8 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-all flex items-center justify-center gap-2 group border border-white/5"
                >
                  Voir dans Opportunites
                  <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </button>
              </div>

              {/* Expert Tip */}
              <div className="bg-primary/5 rounded-xl border border-primary/20 p-6">
                <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-base">info</span>
                  Conseil Expert
                </h4>
                <p className="text-sm text-slate-600 leading-relaxed italic">
                  "Utilisez le scan historique ponctuellement pour rattraper des conversations lors de l'onboarding d'un nouveau groupe. Pour une surveillance optimale, laissez Radar tourner en tache de fond."
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 mt-auto py-6">
        <div className="max-w-[1024px] mx-auto px-6 flex justify-between items-center text-slate-400 text-xs mono-text">
          <p>&copy; 2024 RADAR — WhatsApp Intelligence Engine</p>
          <div className="flex gap-4">
            <a className="hover:text-primary transition-colors" href="#">Documentation API</a>
            <a className="hover:text-primary transition-colors" href="#">Statut</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
