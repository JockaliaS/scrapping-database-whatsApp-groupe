import { useState } from 'react';

export default function KeywordChips({ keywords = [], onChange }) {
  const [inputValue, setInputValue] = useState('');

  const handleRemove = (index) => {
    const updated = keywords.filter((_, i) => i !== index);
    onChange?.(updated);
  };

  const handleAdd = (e) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      const updated = [...keywords, inputValue.trim()];
      onChange?.(updated);
      setInputValue('');
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {keywords.map((kw, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20"
        >
          {kw}
          <button onClick={() => handleRemove(i)} className="hover:text-primary/70">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </span>
      ))}
      <div className="relative group">
        <input
          className="text-sm px-3 py-1.5 rounded-full border border-dashed border-slate-300 bg-transparent focus:border-primary focus:ring-0 outline-none w-40 transition-all placeholder:text-slate-400"
          placeholder="+ Ajouter un mot-cle"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleAdd}
        />
      </div>
    </div>
  );
}
