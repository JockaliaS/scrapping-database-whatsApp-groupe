const STATUS_MAP = {
  nouveau: {
    label: 'Nouveau',
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    dot: 'bg-orange-500',
  },
  contacte: {
    label: 'Contacte',
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    dot: 'bg-blue-500',
  },
  gagne: {
    label: 'Gagne',
    bg: 'bg-primary/10',
    text: 'text-primary',
    dot: 'bg-primary',
  },
  non_pertinent: {
    label: 'Non Pertinent',
    bg: 'bg-slate-100',
    text: 'text-slate-500',
    dot: 'bg-slate-400',
  },
};

export default function StatusPill({ status }) {
  const config = STATUS_MAP[status] || STATUS_MAP.nouveau;

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${config.bg} ${config.text} text-[10px] font-black uppercase tracking-wide w-fit`}>
      <span className={`size-1.5 rounded-full ${config.dot}`}></span>
      {config.label}
    </div>
  );
}
