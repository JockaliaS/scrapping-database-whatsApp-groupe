import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import StatusPill from '../components/StatusPill';
import useWebSocket from '../hooks/useWebSocket';
import { getOpportunities, getOpportunity, updateOpportunityStatus } from '../services/api';

export default function Opportunities() {
  const { connected, newOpportunities } = useWebSocket();
  const [opportunities, setOpportunities] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [copiedField, setCopiedField] = useState(null);

  const handleCopy = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };
  const [searchParams] = useSearchParams();

  useEffect(() => {
    getOpportunities()
      .then((data) => setOpportunities(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Auto-select from URL
  useEffect(() => {
    const id = searchParams.get('id');
    if (id) {
      getOpportunity(id)
        .then(setSelected)
        .catch(() => {});
    }
  }, [searchParams]);

  const allOpps = [...newOpportunities, ...opportunities];

  const filtered = allOpps.filter((opp) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (opp.sender_name || '').toLowerCase().includes(s) ||
      (opp.message_content || '').toLowerCase().includes(s) ||
      (opp.group_name || '').toLowerCase().includes(s)
    );
  });

  const handleStatusChange = async (id, status) => {
    try {
      await updateOpportunityStatus(id, status);
      setOpportunities((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status } : o))
      );
      if (selected?.id === id) setSelected({ ...selected, status });
    } catch {
      // ignore
    }
  };

  const handleSelectRow = async (opp) => {
    try {
      const detail = await getOpportunity(opp.id);
      setSelected(detail);
    } catch {
      setSelected(opp);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    return {
      date: isToday ? "Aujourd'hui" : isYesterday ? 'Hier' : d.toLocaleDateString('fr-FR'),
      time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const getInitials = (name) => {
    if (!name) return '??';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getInitialColor = (name) => {
    const colors = ['bg-blue-100 text-blue-600', 'bg-purple-100 text-purple-600', 'bg-green-100 text-green-600', 'bg-amber-100 text-amber-600', 'bg-pink-100 text-pink-600'];
    const idx = (name || '').charCodeAt(0) % colors.length;
    return colors[idx];
  };

  const getScoreBadgeClass = (score) => {
    if (score >= 80) return 'bg-primary/20 border-primary/30 text-primary';
    if (score >= 50) return 'bg-primary/10 border-primary/20 text-primary/70';
    return 'bg-yellow-100 border-yellow-200 text-yellow-600';
  };

  return (
    <div className="bg-background-light text-slate-900 min-h-screen flex flex-col">
      <Navbar connected={connected} />

      <main className="flex h-[calc(100vh-65px)] overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Page Header & Filters */}
          <div className="p-6 pb-0 space-y-6 bg-white border-b border-slate-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-baseline gap-3">
                <h2 className="text-2xl font-black tracking-tight text-slate-900">Opportunites</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold font-mono">{allOpps.length} total</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-all">
                  <span className="material-symbols-outlined text-lg">download</span>
                  Exporter (CSV)
                </button>
              </div>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-wrap items-center gap-3 pb-6">
              <div className="relative flex-1 min-w-[240px]">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm transition-all"
                  placeholder="Rechercher un contact, un message..."
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-white transition-all">
                <span className="material-symbols-outlined text-lg">calendar_today</span>
                7 derniers jours
                <span className="material-symbols-outlined text-lg">expand_more</span>
              </button>
              <button className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-white transition-all">
                <span className="material-symbols-outlined text-lg">filter_list</span>
                Statut
                <span className="material-symbols-outlined text-lg">expand_more</span>
              </button>
            </div>
          </div>

          {/* Data Table */}
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-sm z-10 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Date/Heure</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Groupe</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Contact</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Extrait du message</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono text-center">Score</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Statut</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map((opp, i) => {
                  const dt = formatDate(opp.created_at);
                  const isSelected = selected?.id === opp.id;
                  return (
                    <tr
                      key={opp.id || i}
                      className={`hover:bg-primary/5 transition-colors cursor-pointer ${isSelected ? 'bg-primary/10' : ''}`}
                      onClick={() => handleSelectRow(opp)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-xs font-bold text-slate-900">{dt.date}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{dt.time}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 rounded bg-slate-100 text-[10px] font-bold text-slate-600 border border-slate-200 font-mono">
                          {opp.group_name || 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold ${getInitialColor(opp.sender_name)}`}>
                            {getInitials(opp.sender_name)}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">{opp.sender_name || 'Inconnu'}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{opp.sender_phone || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-slate-600 line-clamp-1 italic max-w-xs">
                          "{opp.message_content?.slice(0, 80) || ''}..."
                        </p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center justify-center size-9 rounded-full border font-black font-mono text-xs ${getScoreBadgeClass(opp.score)}`}>
                          {opp.score}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusPill status={opp.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-2 hover:bg-white rounded-full text-slate-400 hover:text-primary transition-all shadow-sm border border-transparent hover:border-slate-100">
                          <span className="material-symbols-outlined text-xl">visibility</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-slate-400">
                      Aucune opportunite trouvee
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Slide-in Right Side Panel */}
        {selected && (
          <aside className="w-[450px] bg-white border-l border-slate-200 flex flex-col shadow-2xl z-20 shrink-0">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Details de l'opportunite</h3>
                <p className="text-[10px] text-slate-400 font-mono uppercase font-bold tracking-widest">ID: #{selected.id}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="size-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
              {/* Message complet */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-tighter">
                    <span className="material-symbols-outlined text-sm">chat_bubble</span>
                    Message complet
                  </div>
                  <button
                    onClick={() => handleCopy(selected.message_content, 'message')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                      copiedField === 'message'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xs">{copiedField === 'message' ? 'done' : 'content_copy'}</span>
                    {copiedField === 'message' ? 'Copie !' : 'Copier'}
                  </button>
                </div>
                <div className="bg-slate-50 rounded-2xl rounded-tl-none p-4 relative shadow-sm border border-slate-100">
                  <p className="text-sm text-slate-700 leading-relaxed">{selected.message_content}</p>
                  <div className="text-[10px] text-slate-400 mt-2 text-right font-mono">
                    {formatDate(selected.created_at).time}
                  </div>
                </div>
              </section>

              {/* Profil du contact */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-tighter">
                  <span className="material-symbols-outlined text-sm">account_circle</span>
                  Profil du contact
                </div>
                <div className="p-4 rounded-xl border border-slate-100 bg-white shadow-sm flex items-center gap-4">
                  <div className={`size-14 rounded-full flex items-center justify-center text-xl font-black ${getInitialColor(selected.sender_name)}`}>
                    {getInitials(selected.sender_name)}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-base font-bold text-slate-900">{selected.sender_name || 'Inconnu'}</h4>
                    <p className="text-xs text-slate-500 font-mono">{selected.sender_phone || ''}</p>
                  </div>
                </div>
              </section>

              {/* Analyse du score */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-tighter">
                  <span className="material-symbols-outlined text-sm">analytics</span>
                  Analyse du score
                </div>
                <div className="p-5 rounded-2xl bg-slate-900 text-white shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-3xl -mr-10 -mt-10"></div>
                  <div className="relative z-10 flex items-center justify-between">
                    <div>
                      <div className="text-3xl font-black font-mono text-primary">{selected.score}%</div>
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mt-1">
                        {selected.score >= 80 ? 'Match tres eleve' : selected.score >= 50 ? 'Match moyen' : 'Match faible'}
                      </p>
                    </div>
                    <div className="size-16 rounded-full border-4 border-slate-800 border-t-primary flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-2xl">auto_awesome</span>
                    </div>
                  </div>
                  {selected.matched_keywords?.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selected.matched_keywords.map((kw, i) => (
                        <span key={i} className="px-2 py-1 rounded bg-slate-800 text-[10px] font-bold text-primary font-mono">#{kw}</span>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Analyse IA — pourquoi ce message est pertinent */}
              {selected.context_analysis && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-tighter">
                    <span className="material-symbols-outlined text-sm">psychology</span>
                    Pourquoi l'IA a detecte cette opportunite
                  </div>
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                    <p className="text-sm text-amber-900 leading-relaxed">{selected.context_analysis}</p>
                  </div>
                </section>
              )}

              {/* Reponse suggeree */}
              {selected.suggested_reply && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-tighter">
                    <span className="material-symbols-outlined text-sm">smart_toy</span>
                    Reponse suggeree par l'IA
                  </div>
                  <div className="bg-primary/5 rounded-2xl rounded-tr-none p-4 border border-primary/20 relative">
                    <p className="text-sm text-slate-700 leading-relaxed italic">"{selected.suggested_reply}"</p>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => handleCopy(selected.suggested_reply, 'reply')}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
                          copiedField === 'reply'
                            ? 'bg-green-500 text-white'
                            : 'bg-primary text-white hover:opacity-90'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">{copiedField === 'reply' ? 'done' : 'content_copy'}</span>
                        {copiedField === 'reply' ? 'Copie !' : 'Copier la reponse'}
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {/* Actions */}
              <section className="pt-4 space-y-4">
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleStatusChange(selected.id, 'contacte')}
                    className="w-full py-3 bg-white border border-slate-200 text-slate-700 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-lg text-orange-500">check_circle</span>
                    Marque comme contacte
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleStatusChange(selected.id, 'gagne')}
                      className="py-3 bg-primary/10 border border-primary/20 text-primary text-xs font-black uppercase tracking-widest rounded-xl hover:bg-primary/20 transition-all"
                    >
                      Gagne
                    </button>
                    <button
                      onClick={() => handleStatusChange(selected.id, 'non_pertinent')}
                      className="py-3 bg-slate-100 text-slate-400 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-slate-200 transition-all"
                    >
                      Non pertinent
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}
