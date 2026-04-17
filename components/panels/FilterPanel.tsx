'use client';

import type { Filters } from '@/lib/store';
import { DEFAULT_FILTERS, useSimStore } from '@/lib/store';

const SK_KEYS: Array<keyof Filters['sk']> = ['T1', 'T2', 'T3'];
const SK_LABEL: Record<keyof Filters['sk'], string> = {
  T1: 'SK I (lebensbedrohlich)',
  T2: 'SK II (schwer, stabil)',
  T3: 'SK III (leicht)',
};

export function FilterPanel() {
  const filters = useSimStore((s) => s.filters);
  const setFilter = useSimStore((s) => s.setFilter);
  const toggleSK = useSimStore((s) => s.toggleSK);
  const resetFilters = useSimStore((s) => s.resetFilters);

  const isActive =
    filters.freeMin > 0 ||
    filters.occupiedMax > 0 ||
    filters.reservedMin > 0 ||
    filters.emergencyMin > 0 ||
    SK_KEYS.some((k) => !filters.sk[k]);

  return (
    <section className="p-3 border-b border-border-1">
      <div className="flex items-center justify-between mb-2">
        <div className="section-label">Filter</div>
        {isActive && (
          <button
            type="button"
            className="num text-[10px] text-text-2 hover:text-text-0 border border-border-1 px-1.5 py-0.5"
            onClick={resetFilters}
          >
            Reset
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <FilterInput
          label="Freie Betten"
          relation="≥"
          value={filters.freeMin}
          onChange={(v) => setFilter('freeMin', v)}
        />
        <FilterInput
          label="Belegte Betten"
          relation="≤"
          value={filters.occupiedMax}
          onChange={(v) => setFilter('occupiedMax', v)}
          placeholder="0 = aus"
        />
        <FilterInput
          label="MANV-Reserve"
          relation="≥"
          value={filters.reservedMin}
          onChange={(v) => setFilter('reservedMin', v)}
        />
        <FilterInput
          label="Notfallbetten"
          relation="≥"
          value={filters.emergencyMin}
          onChange={(v) => setFilter('emergencyMin', v)}
        />
      </div>

      <div className="mt-3">
        <div className="section-label mb-1">Sichtungskategorie</div>
        <div className="flex flex-col gap-1">
          {SK_KEYS.map((k) => (
            <label
              key={k}
              className="flex items-center gap-2 text-[12px] text-text-1 cursor-pointer hover:text-text-0"
            >
              <input
                type="checkbox"
                checked={filters.sk[k]}
                onChange={() => toggleSK(k)}
                className="accent-accent-cyan"
              />
              <span className="num w-6 text-text-0">{k}</span>
              <span>{SK_LABEL[k]}</span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function FilterInput({
  label,
  relation,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  relation: string;
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="flex-1 text-text-1">{label}</span>
      <span className="text-text-2 num">{relation}</span>
      <input
        type="number"
        min={0}
        step={5}
        value={value || ''}
        placeholder={placeholder ?? '0 = aus'}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="num w-16 text-right bg-bg-3 border border-border-1 text-text-0 px-1 py-0.5"
      />
    </div>
  );
}

export { DEFAULT_FILTERS };
