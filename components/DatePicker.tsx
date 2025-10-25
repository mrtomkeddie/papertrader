import React from 'react';

interface DatePickerProps {
  label?: string;
  value: string; // ISO string: yyyy-MM-dd
  onChange: (value: string) => void;
  className?: string;
}

const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDisplay(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function daysGrid(year: number, month: number): (number|null)[] {
  const firstDow = new Date(year, month, 1).getDay(); // 0..6 (Sun..Sat)
  const days = new Date(year, month+1, 0).getDate();
  const grid: (number|null)[] = [];
  for (let i=0;i<firstDow;i++) grid.push(null);
  for (let d=1; d<=days; d++) grid.push(d);
  // pad to full weeks
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

export const DatePicker: React.FC<DatePickerProps> = ({ label, value, onChange, className }) => {
  const selected = value ? new Date(value) : null;
  const [open, setOpen] = React.useState(false);
  const [viewYear, setViewYear] = React.useState<number>(selected ? selected.getFullYear() : new Date().getFullYear());
  const [viewMonth, setViewMonth] = React.useState<number>(selected ? selected.getMonth() : new Date().getMonth());
  const ref = React.useRef<HTMLDivElement|null>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', onDocClick);
      return () => document.removeEventListener('mousedown', onDocClick);
    }
  }, [open]);

  const onSelectDay = (day: number) => {
    const iso = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    onChange(iso);
    setOpen(false);
  };

  const today = new Date();
  const grid = daysGrid(viewYear, viewMonth);

  return (
    <div className={`relative ${className ?? ''}`} ref={ref}>
      {label && <label className="text-sm font-medium text-gray-300 mb-1.5 block">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full bg-gray-900 text-gray-200 rounded px-3.5 py-2.5 border border-gray-600 hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <div className="flex items-center justify-start">
          <span className={value ? 'text-white' : 'text-gray-500'}>{value ? formatDisplay(value) : 'dd/mm/yyyy'}</span>
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-64 bg-gray-800 rounded-lg shadow-xl border border-white/10">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <button className="p-1 text-gray-300 hover:text-white" onClick={() => setViewMonth(m => { const nm = m-1; if (nm < 0) { setViewYear(y => y-1); return 11; } return nm; })} aria-label="Previous month">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div className="text-sm font-semibold text-white">{monthNames[viewMonth]} {viewYear}</div>
            <button className="p-1 text-gray-300 hover:text-white" onClick={() => setViewMonth(m => { const nm = m+1; if (nm > 11) { setViewYear(y => y+1); return 0; } return nm; })} aria-label="Next month">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 p-2 text-xs">
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
              <div key={d} className="text-center text-gray-400">{d}</div>
            ))}
            {grid.map((d, idx) => {
              if (d === null) return <div key={`e-${idx}`} />;
              const isSelected = selected && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === d;
              const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d;
              return (
                <button
                  key={d}
                  onClick={() => onSelectDay(d)}
                  className={`h-8 w-8 rounded-full flex items-center justify-center ${isSelected ? 'bg-primary-dark text-white' : isToday ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-200 hover:bg-gray-700'}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-t border-white/10">
            <button className="text-xs text-gray-300 hover:text-white" onClick={() => { const t = new Date(); onChange(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`); setOpen(false); }}>Today</button>
            <button className="text-xs text-gray-300 hover:text-white" onClick={() => { onChange(''); setOpen(false); }}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatePicker;