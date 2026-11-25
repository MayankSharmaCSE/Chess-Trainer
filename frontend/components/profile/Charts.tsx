import { formatShortDate } from "@/lib/profile";

/* -------------------------------- sparkline ------------------------------- */

export function Sparkline({
  values,
  className = "",
  stroke = "#34d399",
}: {
  values: number[];
  className?: string;
  stroke?: string;
}) {
  if (values.length < 2) {
    return <span className="block h-7 w-full rounded border border-dashed border-slate-800" aria-hidden="true" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 26 - ((value - min) / span) * 22;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={`h-7 w-full ${className}`} role="img" aria-label={`Rating trend ${values[0]} to ${values[values.length - 1]}`}>
      <polygon points={`0,28 ${points.join(" ")} 100,28`} fill={stroke} fillOpacity="0.1" />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ------------------------------- rating chart ----------------------------- */

export interface RatingSeriesPoint {
  rating: number;
  playedAt: string | null;
  result?: string | null;
  opponent?: string | null;
}

export function RatingChart({ points }: { points: RatingSeriesPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-800 text-xs text-slate-500">
        No rated games in this time control yet.
      </div>
    );
  }

  const ratings = points.map((point) => point.rating);
  const rawMin = Math.min(...ratings);
  const rawMax = Math.max(...ratings);
  const pad = Math.max(10, Math.round((rawMax - rawMin) * 0.15));
  const min = rawMin - pad;
  const max = rawMax + pad;

  const W = 640;
  const H = 200;
  const PX = 10;
  const PY = 16;
  const x = (index: number) =>
    points.length === 1 ? W / 2 : PX + (index / (points.length - 1)) * (W - PX * 2);
  const y = (rating: number) => H - PY - ((rating - min) / (max - min)) * (H - PY * 2);
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(point.rating).toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${H - PY} L ${x(0).toFixed(1)} ${H - PY} Z`;
  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.rating - first.rating;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Rating over time</p>
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${
            delta > 0
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : delta < 0
                ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                : "border-slate-700 bg-slate-800/60 text-slate-400"
          }`}
        >
          {delta > 0 ? "+" : ""}
          {delta}
        </span>
      </div>

      <div className="mt-2 flex gap-2">
        <div className="flex flex-col justify-between py-3 font-mono text-[10px] text-slate-600">
          <span>{rawMax}</span>
          <span>{rawMin}</span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Rating chart from ${first.rating} to ${last.rating}, high ${rawMax}, low ${rawMin}`}
        >
          {[0, 0.5, 1].map((fraction) => (
            <line
              key={fraction}
              x1={PX}
              x2={W - PX}
              y1={PY + fraction * (H - PY * 2)}
              y2={PY + fraction * (H - PY * 2)}
              stroke="#1e293b"
              strokeWidth="1"
              strokeDasharray="4 6"
            />
          ))}
          <path d={area} fill="#34d399" fillOpacity="0.1" />
          <path d={line} fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((point, index) => (
            <circle
              key={`${point.playedAt ?? "point"}-${index}`}
              cx={x(index)}
              cy={y(point.rating)}
              r={index === points.length - 1 ? 4 : 2}
              fill={index === points.length - 1 ? "#0A0F1D" : "#34d399"}
              stroke="#34d399"
              strokeWidth={index === points.length - 1 ? 2 : 1}
              opacity={index === points.length - 1 ? 1 : 0.55}
            >
              <title>
                {`${point.rating}${point.opponent ? ` vs ${point.opponent}` : ""} — ${formatShortDate(point.playedAt)}`}
              </title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="mt-1 flex justify-between pl-6 text-[10px] text-slate-600">
        <span>{formatShortDate(first.playedAt)}</span>
        <span>
          {points.length} rated game{points.length === 1 ? "" : "s"}
        </span>
        <span>{formatShortDate(last.playedAt)}</span>
      </div>
    </div>
  );
}

/* ---------------------------------- donut --------------------------------- */

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: DonutSegment[];
  centerValue: string;
  centerLabel: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const lengths = segments.map((segment) =>
    total > 0 ? (segment.value / total) * circumference : 0,
  );
  const offsets = lengths.map((_, index) =>
    lengths.slice(0, index).reduce((sum, length) => sum + length, 0),
  );

  return (
    <div className="relative mx-auto h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full" role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#1e293b" strokeWidth="12" />
        {segments.map((segment, index) => (
          <circle
            key={segment.label}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth="12"
            strokeDasharray={`${lengths[index]} ${circumference - lengths[index]}`}
            strokeDashoffset={-offsets[index]}
            transform="rotate(-90 60 60)"
          >
            <title>{`${segment.label}: ${segment.value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl font-extrabold text-white">{centerValue}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{centerLabel}</span>
      </div>
    </div>
  );
}

/* ------------------------------ phase bars -------------------------------- */

export interface PhaseBucket {
  phase: string;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  total: number;
}

export function PhaseBars({ phases }: { phases: PhaseBucket[] }) {
  const max = Math.max(1, ...phases.map((phase) => phase.blunders + phase.mistakes + phase.inaccuracies));
  return (
    <div>
      <div className="flex flex-wrap gap-3 text-[10px] font-semibold text-slate-400">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-rose-500" /> Blunders</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-amber-400" /> Mistakes</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-sky-400" /> Inaccuracies</span>
      </div>
      <div className="mt-3 space-y-3">
        {phases.map((phase) => {
          const total = phase.blunders + phase.mistakes + phase.inaccuracies;
          return (
            <div key={phase.phase}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">{phase.phase}</span>
                <span className="font-mono text-[11px] text-slate-500">
                  {phase.blunders}B · {phase.mistakes}M · {phase.inaccuracies}I
                </span>
              </div>
              <div
                className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-slate-800"
                role="img"
                aria-label={`${phase.phase}: ${phase.blunders} blunders, ${phase.mistakes} mistakes, ${phase.inaccuracies} inaccuracies`}
              >
                {phase.blunders > 0 && <span className="bg-rose-500" style={{ width: `${(phase.blunders / max) * 100}%` }} />}
                {phase.mistakes > 0 && <span className="bg-amber-400" style={{ width: `${(phase.mistakes / max) * 100}%` }} />}
                {phase.inaccuracies > 0 && <span className="bg-sky-400" style={{ width: `${(phase.inaccuracies / max) * 100}%` }} />}
                {total === 0 && <span className="w-full bg-slate-800" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------- progress bar ----------------------------- */

export function ProgressTrack({
  value,
  tone = "bg-emerald-400",
  className = "",
}: {
  value: number;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-slate-800 ${className}`}>
      <div className={`h-full rounded-full ${tone} transition-[width]`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
