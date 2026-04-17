'use client';

import clsx from 'clsx';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { DISCIPLINE_LABEL, type Discipline } from '@/lib/data/disciplines';
import { useSimStore } from '@/lib/store';
import type { EscalationLevel, Hospital } from '@/lib/types';

const ESCALATION_ORDER: EscalationLevel[] = [
  'normal',
  'erhoeht',
  'manv-1',
  'manv-2',
  'katastrophe',
];

const ESCALATION_LABEL: Record<EscalationLevel, string> = {
  normal: 'Normal',
  erhoeht: 'Erhoeht',
  'manv-1': 'MANV-1',
  'manv-2': 'MANV-2',
  katastrophe: 'Katastrophe',
};

const ESCALATION_COLOR: Record<EscalationLevel, string> = {
  normal: 'text-text-1',
  erhoeht: 'text-accent-cyan',
  'manv-1': 'text-accent-amber',
  'manv-2': 'text-accent-amber',
  katastrophe: 'text-accent-red',
};

function occupancyColor(ratio: number): string {
  if (ratio >= 0.95) return '#e5484d';
  if (ratio >= 0.85) return '#f5a623';
  if (ratio >= 0.7) return '#f5a623';
  return '#22c55e';
}

export function HospitalDetailPanel({ id }: { id: string }) {
  const hospital = useSimStore((s) => s.hospitals[id]);
  const history = useSimStore((s) => s.occupancyHistory);
  const simTime = useSimStore((s) => s.simTime);
  const setSelection = useSimStore((s) => s.setSelection);
  const escalateHospital = useSimStore((s) => s.escalateHospital);

  if (!hospital) return null;

  const disciplines = Object.entries(hospital.disciplines) as Array<
    [Discipline, NonNullable<Hospital['disciplines'][Discipline]>]
  >;

  // Capacity Timeline (letzte 4h via occupancyHistory)
  const chartData = history
    .filter((s) => simTime - s.simTime <= 240 && s.occupancy[id] != null)
    .map((s) => ({
      t: s.simTime,
      tLabel: `T+${Math.floor(s.simTime / 60)}:${String(s.simTime % 60).padStart(2, '0')}`,
      occ: Math.round((s.occupancy[id] ?? 0) * 100),
    }));

  return (
    <section className="p-3 border-b border-border-1">
      <div className="flex items-center justify-between mb-2">
        <div className="section-label">Krankenhaus-Detail</div>
        <button
          type="button"
          className="num text-[10px] text-text-2 hover:text-text-0 border border-border-1 px-1.5 py-0.5"
          onClick={() => setSelection(null)}
        >
          schliessen
        </button>
      </div>

      <div className="text-text-0 font-medium text-[13px]">{hospital.name}</div>
      <div className="text-text-2 num text-[11px]">
        {hospital.address.city} · {hospital.versorgungsstufe} ·{' '}
        {hospital.traeger}
      </div>

      {/* Escalation */}
      <div className="flex items-center justify-between mt-3 mb-2">
        <span className="section-label">Stufe</span>
        <span
          className={clsx(
            'num text-[11px] section-label',
            ESCALATION_COLOR[hospital.escalationLevel],
          )}
        >
          {ESCALATION_LABEL[hospital.escalationLevel]}
        </span>
      </div>
      <div className="flex gap-1 mb-3">
        {ESCALATION_ORDER.map((lvl) => {
          const curIdx = ESCALATION_ORDER.indexOf(hospital.escalationLevel);
          const lvlIdx = ESCALATION_ORDER.indexOf(lvl);
          return (
            <div
              key={lvl}
              className={clsx(
                'h-1 flex-1',
                lvlIdx <= curIdx ? 'bg-accent-amber' : 'bg-bg-3',
              )}
            />
          );
        })}
      </div>
      <button
        type="button"
        className="w-full num text-[11px] px-2 py-1 border border-border-1 text-text-1 hover:text-text-0 hover:bg-bg-2 disabled:opacity-30"
        onClick={() => escalateHospital(hospital.id)}
        disabled={hospital.escalationLevel === 'katastrophe'}
      >
        Stufe erhoehen
      </button>

      {/* Disciplines */}
      <div className="section-label mt-4 mb-2">Disciplinen</div>
      <div className="flex flex-col gap-1.5">
        {disciplines.map(([d, cap]) => {
          const ratio = cap.bedsTotal > 0 ? cap.bedsOccupied / cap.bedsTotal : 0;
          const color = occupancyColor(ratio);
          return (
            <div key={d}>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-1">{DISCIPLINE_LABEL[d]}</span>
                <span className="num text-text-0">
                  {cap.bedsOccupied}/{cap.bedsTotal}
                  {cap.surgeActive && (
                    <span className="text-accent-cyan ml-1">[surge]</span>
                  )}
                </span>
              </div>
              <div className="h-1 bg-bg-3 w-full mt-0.5">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.min(100, ratio * 100)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* OP Slots */}
      {hospital.opSlots.total > 0 && (
        <div className="flex items-center justify-between mt-3 text-[11px]">
          <span className="text-text-1">OP-Saele</span>
          <span className="num text-text-0">
            {hospital.opSlots.inUse}/{hospital.opSlots.total}
          </span>
        </div>
      )}

      {hospital.emergencyBeds > 0 && (
        <div className="flex items-center justify-between mt-1 text-[11px]">
          <span className="text-text-1">Notfallbetten</span>
          <span className="num text-accent-amber">{hospital.emergencyBeds}</span>
        </div>
      )}

      {/* Capacity Timeline */}
      {chartData.length >= 2 && (
        <div className="mt-4">
          <div className="section-label mb-1">Auslastung letzte 4h</div>
          <div className="h-[90px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 4, right: 4, bottom: 4, left: 0 }}
              >
                <defs>
                  <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="tLabel"
                  tick={{ fontSize: 9, fill: '#6b7687' }}
                  stroke="#222b3a"
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 9, fill: '#6b7687' }}
                  stroke="#222b3a"
                  tickLine={false}
                  width={22}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#151b24',
                    border: '1px solid #2e3a4d',
                    fontSize: '11px',
                    color: '#e6eaf2',
                  }}
                  labelStyle={{ color: '#a9b3c3' }}
                  formatter={(v) => [`${v} %`, 'Auslastung']}
                />
                <Area
                  type="monotone"
                  dataKey="occ"
                  stroke="#38bdf8"
                  fill="url(#occGrad)"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
