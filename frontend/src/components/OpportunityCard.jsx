import ScoreBadge from './ScoreBadge';

export default function OpportunityCard({ opportunity, onDetails }) {
  const { score, group_name, message_content, created_at, id } = opportunity;

  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "A l'instant";
    if (mins < 60) return `Il y a ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Il y a ${hours}h`;
    return `Il y a ${Math.floor(hours / 24)}j`;
  };

  let hoverBorder = 'hover:border-primary/30';
  if (score < 50) hoverBorder = 'hover:border-slate-300/30';
  else if (score < 80) hoverBorder = 'hover:border-amber-300/30';

  return (
    <div className={`group flex flex-col gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-all ${hoverBorder} hover:shadow-md md:flex-row`}>
      <ScoreBadge score={score} />
      <div className="flex flex-1 flex-col justify-between py-1">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold tracking-tighter text-text-secondary">ID: #{id}</span>
            <span className="text-[11px] text-text-secondary">{timeAgo(created_at)}</span>
          </div>
          <h3 className="text-lg font-bold text-text-primary">{group_name || 'Groupe inconnu'}</h3>
          <p className="line-clamp-2 text-sm text-text-secondary">{message_content}</p>
        </div>
        <div className="mt-4 flex items-center justify-end">
          <button
            onClick={() => onDetails?.(opportunity)}
            className="flex items-center gap-1 rounded-lg bg-slate-100 px-4 py-1.5 text-sm font-bold text-text-primary transition-colors hover:bg-primary hover:text-white"
          >
            <span>Details</span>
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}
