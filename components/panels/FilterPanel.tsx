'use client';

import { useSimStore } from '@/lib/store';
import type { Triage } from '@/lib/types';

const TRIAGE: Triage[] = ['T1', 'T2', 'T3', 'T4'];

export function FilterPanel() {
  const filters = useSimStore((s) => s.filters);
  const updateFilters = useSimStore((s) => s.updateFilters);

  return (
    <section data-testid="filter-panel" className="flex flex-col gap-3">
      <div className="text-micro" style={{ color: 'var(--text-tertiary)' }}>
        Filter
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-label" style={{ color: 'var(--text-secondary)' }}>
          Mindest-Auslastung {Math.round(filters.bedThresholds.min * 100)} %
        </span>
        <input
          data-testid="filter-min"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={filters.bedThresholds.min}
          onChange={(e) =>
            updateFilters({
              bedThresholds: { ...filters.bedThresholds, min: Number(e.target.value) },
            })
          }
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-label" style={{ color: 'var(--text-secondary)' }}>
          Maximal-Auslastung {Math.round(filters.bedThresholds.max * 100)} %
        </span>
        <input
          data-testid="filter-max"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={filters.bedThresholds.max}
          onChange={(e) =>
            updateFilters({
              bedThresholds: { ...filters.bedThresholds, max: Number(e.target.value) },
            })
          }
        />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-label" style={{ color: 'var(--text-secondary)' }}>
          Triage
        </span>
        <div className="flex gap-2">
          {TRIAGE.map((t) => (
            <label
              key={t}
              className="flex items-center gap-1 text-caption"
              style={{ color: 'var(--text-secondary)' }}
            >
              <input
                data-testid={`filter-triage-${t}`}
                type="checkbox"
                checked={filters.triage[t]}
                onChange={(e) =>
                  updateFilters({
                    triage: { ...filters.triage, [t]: e.target.checked },
                  })
                }
              />
              {t}
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
