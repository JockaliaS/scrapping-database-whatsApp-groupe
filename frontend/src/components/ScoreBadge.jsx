export default function ScoreBadge({ score, size = 'md' }) {
  const circumference = 2 * Math.PI * 36; // r=36
  const offset = circumference - (score / 100) * circumference;

  let colorClass = 'text-primary';
  let bgClass = 'bg-primary/5 border-primary/20';
  let labelColor = 'text-primary';

  if (score < 50) {
    colorClass = 'text-slate-400';
    bgClass = 'bg-slate-50 border-slate-200';
    labelColor = 'text-slate-500';
  } else if (score < 80) {
    colorClass = 'text-amber-500';
    bgClass = 'bg-amber-50 border-amber-200';
    labelColor = 'text-amber-600';
  }

  const sizeClasses = size === 'sm'
    ? 'h-20 w-full md:w-32'
    : 'h-32 w-full md:w-48';

  return (
    <div className={`flex shrink-0 flex-col items-center justify-center rounded-lg ${bgClass} border ${sizeClasses}`}>
      <div className="relative flex items-center justify-center">
        <svg className="h-20 w-20 -rotate-90">
          <circle
            className="text-slate-100"
            cx="40" cy="40" fill="transparent" r="36"
            stroke="currentColor" strokeWidth="6"
          />
          <circle
            className={colorClass}
            cx="40" cy="40" fill="transparent" r="36"
            stroke="currentColor"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeWidth="6"
          />
        </svg>
        <span className={`absolute text-2xl font-bold ${colorClass}`}>{score}</span>
      </div>
      <span className={`mt-1 font-mono text-[10px] font-bold uppercase ${labelColor}`}>Score Opportunite</span>
    </div>
  );
}
