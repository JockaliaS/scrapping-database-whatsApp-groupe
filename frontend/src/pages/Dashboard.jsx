import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import OpportunityCard from '../components/OpportunityCard';
import useWebSocket from '../hooks/useWebSocket';
import { getOpportunities, getGroups, getWebhookStats } from '../services/api';

export default function Dashboard() {
  const { connected, newOpportunities, webhookCounter } = useWebSocket();
  const [opportunities, setOpportunities] = useState([]);
  const [groups, setGroups] = useState([]);
  const [filter, setFilter] = useState('24h');
  const [webhookStats, setWebhookStats] = useState({ total_today: 0, total_groups: 0, total_monitored: 0, total_processed: 0 });
  const [showWebhookTooltip, setShowWebhookTooltip] = useState(false);
  const navigate = useNavigate();

  const loadWebhookStats = () => {
    getWebhookStats()
      .then((data) => setWebhookStats(data))
      .catch(() => {});
  };

  useEffect(() => {
    getOpportunities()
      .then((data) => setOpportunities(Array.isArray(data) ? data : []))
      .catch(() => {});
    getGroups()
      .then((data) => setGroups(Array.isArray(data) ? data : []))
      .catch(() => {});
    loadWebhookStats();
  }, []);

  // Refresh stats when new webhook events arrive via WebSocket
  useEffect(() => {
    if (webhookCounter > 0) loadWebhookStats();
  }, [webhookCounter]);

  // Merge WS opportunities
  const allOpportunities = [...newOpportunities, ...opportunities];

  const stats = {
    groups: groups.filter((g) => g.is_monitored).length,
    opportunities: allOpportunities.length,
    avgScore: allOpportunities.length
      ? Math.round(allOpportunities.reduce((sum, o) => sum + (o.score || 0), 0) / allOpportunities.length)
      : 0,
    responseRate: 92,
  };

  const triggeredKeywords = [];
  allOpportunities.forEach((opp) => {
    (opp.matched_keywords || []).forEach((kw) => {
      if (!triggeredKeywords.includes(kw)) triggeredKeywords.push(kw);
    });
  });

  return (
    <div className="bg-background-light font-display text-text-primary antialiased min-h-screen flex flex-col">
      <Navbar connected={connected} />

      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 p-6 lg:p-10">
        {/* Quick Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-2 px-2">
          <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">Filtres rapides :</span>
          <div className="flex items-center gap-2">
            {['24h', '7 jours', '1 mois'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold ${
                  filter === f
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-text-secondary hover:bg-slate-50'
                }`}
              >
                {f}
              </button>
            ))}
            <button className="flex items-center gap-2 rounded-full bg-white border border-slate-200 px-4 py-1.5 text-xs font-bold text-text-secondary hover:bg-slate-50">
              <span className="material-symbols-outlined text-sm">calendar_today</span>
              <span>Periode personnalisee</span>
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Stat 1 - Groups */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="material-symbols-outlined rounded-lg bg-blue-50 p-2 text-blue-500">groups</span>
              <div className="h-6 w-16 bg-gradient-to-r from-blue-100 to-blue-500/20 [clip-path:polygon(0%_80%,20%_60%,40%_70%,60%_40%,80%_50%,100%_20%,100%_100%,0%_100%)]"></div>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-secondary">Groupes Monitores</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-text-primary leading-none">{stats.groups}</span>
              </div>
            </div>
          </div>

          {/* Stat 2 - Opportunities */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="material-symbols-outlined rounded-lg bg-primary/10 p-2 text-primary">target</span>
              <div className="h-6 w-16 bg-gradient-to-r from-primary/10 to-primary/40 [clip-path:polygon(0%_90%,20%_80%,40%_60%,60%_70%,80%_30%,100%_10%,100%_100%,0%_100%)]"></div>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-secondary">Opportunites (24h)</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-text-primary leading-none">{stats.opportunities}</span>
              </div>
            </div>
          </div>

          {/* Stat 3 - Score */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="material-symbols-outlined rounded-lg bg-amber-50 p-2 text-amber-500">analytics</span>
              <div className="h-6 w-16 bg-gradient-to-r from-amber-100 to-amber-500/20 [clip-path:polygon(0%_40%,20%_50%,40%_45%,60%_55%,80%_48%,100%_50%,100%_100%,0%_100%)]"></div>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-secondary">Score Moyen</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-text-primary leading-none">{stats.avgScore}%</span>
              </div>
            </div>
          </div>

          {/* Stat 4 - Webhooks */}
          <div
            className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md relative cursor-default"
            onMouseEnter={() => setShowWebhookTooltip(true)}
            onMouseLeave={() => setShowWebhookTooltip(false)}
          >
            <div className="flex items-center justify-between">
              <span className="material-symbols-outlined rounded-lg bg-purple-50 p-2 text-purple-500">webhook</span>
              {webhookCounter > 0 && (
                <span className="size-2 bg-green-500 rounded-full animate-pulse" title="Live"></span>
              )}
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-secondary">Webhooks (aujourd'hui)</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-text-primary leading-none">{webhookStats.total_today}</span>
              </div>
            </div>

            {/* Tooltip on hover */}
            {showWebhookTooltip && (
              <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-slate-900 text-white rounded-xl shadow-2xl p-5 text-sm space-y-3 min-w-[280px]">
                <div className="absolute -top-2 left-6 w-4 h-4 bg-slate-900 rotate-45 rounded-sm"></div>
                <h4 className="font-bold text-xs uppercase tracking-widest text-slate-400 mb-3">Detail des webhooks du jour</h4>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Total (tous types)</span>
                  <span className="font-mono font-bold text-white">{webhookStats.total_today}</span>
                </div>
                <div className="border-t border-slate-700"></div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Messages groupes (@g.us)</span>
                  <span className="font-mono font-bold text-blue-400">{webhookStats.total_groups}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Groupes surveilles</span>
                  <span className="font-mono font-bold text-primary">{webhookStats.total_monitored}</span>
                </div>
                <div className="border-t border-slate-700"></div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300">Messages traites</span>
                  <span className="font-mono font-bold text-green-400">{webhookStats.total_processed}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Main Feed */}
          <div className="flex flex-col gap-6 lg:col-span-8">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xl font-bold text-text-primary">Opportunites Recentes</h2>
              <Link to="/opportunities" className="text-sm font-semibold text-primary hover:underline">Voir tout</Link>
            </div>
            <div className="flex flex-col gap-4">
              {allOpportunities.length === 0 ? (
                <div className="rounded-xl border border-slate-100 bg-white p-8 text-center text-slate-400">
                  <span className="material-symbols-outlined text-4xl mb-2 block">inbox</span>
                  <p>Aucune opportunite detectee pour le moment</p>
                </div>
              ) : (
                allOpportunities.slice(0, 5).map((opp, i) => (
                  <OpportunityCard
                    key={opp.id || i}
                    opportunity={opp}
                    onDetails={() => navigate(`/opportunities?id=${opp.id}`)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-6 lg:col-span-4">
            {/* Top Groups */}
            <div className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-text-primary">Groupes les plus actifs</h2>
              <div className="flex flex-col gap-5">
                {groups.filter((g) => g.is_monitored).slice(0, 4).map((group) => (
                  <div key={group.id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-text-primary">{group.name}</span>
                      <span className="font-mono text-xs font-bold text-text-secondary">{group.member_count || 0}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full bg-primary" style={{ width: `${Math.min(100, (group.member_count || 50) / 20)}%` }}></div>
                    </div>
                  </div>
                ))}
                {groups.filter((g) => g.is_monitored).length === 0 && (
                  <p className="text-sm text-slate-400">Aucun groupe monitore</p>
                )}
              </div>
            </div>

            {/* Keywords */}
            <div className="flex flex-col gap-4 rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-text-primary">Mots-cles declenches</h2>
              <div className="flex flex-wrap gap-2">
                {triggeredKeywords.length === 0 ? (
                  <p className="text-sm text-slate-400">Aucun mot-cle detecte</p>
                ) : (
                  triggeredKeywords.slice(0, 10).map((kw, i) => (
                    <span
                      key={i}
                      className={`cursor-pointer rounded-lg px-3 py-1 text-sm font-medium ${
                        i % 2 === 0
                          ? 'bg-primary/5 text-primary hover:bg-primary/10'
                          : 'bg-slate-100 text-text-secondary hover:bg-slate-200'
                      }`}
                    >
                      #{kw}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Floating Action Button */}
      <Link
        to="/scan"
        className="fixed bottom-8 right-8 flex items-center gap-3 rounded-full bg-primary px-6 py-4 text-white shadow-xl shadow-primary/20 transition-all hover:-translate-y-1 hover:bg-emerald-600 active:scale-95"
      >
        <span className="material-symbols-outlined text-[24px]">radar</span>
        <span className="font-bold tracking-wide">Scan manuel</span>
      </Link>
    </div>
  );
}
