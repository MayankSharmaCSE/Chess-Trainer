import { Icon, type IconName } from "./icons";
import { Sparkline } from "./Charts";
import { speedLabel, type RatingPoint, type RatingStat, type Speed } from "@/lib/profile";

const SPEED_ICON: Record<Speed, IconName> = {
  bullet: "bolt",
  blitz: "flame",
  rapid: "clock",
  classical: "crown",
  daily: "globe",
};

const SPEED_TONE: Record<Speed, string> = {
  bullet: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  blitz: "border-sky-500/25 bg-sky-500/10 text-sky-300",
  rapid: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  classical: "border-violet-500/25 bg-violet-500/10 text-violet-300",
  daily: "border-teal-500/25 bg-teal-500/10 text-teal-300",
};

export default function RatingCard({ stat, points }: { stat: RatingStat; points: RatingPoint[] }) {
  const icon = SPEED_ICON[stat.speed];
  const tone = SPEED_TONE[stat.speed];
  const values = points.map((point) => point.rating).slice(-24);
  const atPeak = stat.current != null && stat.peak != null && stat.current >= stat.peak;

  return (
    <article className="rounded-2xl border border-slate-800 bg-[#111A2E] p-4 transition hover:border-slate-700">
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${tone}`}>
          <Icon name={icon} size={12} />
          {speedLabel(stat.speed)}
        </span>
        <span className="font-mono text-[10px] text-slate-500">
          {stat.games} game{stat.games === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[26px] font-extrabold leading-none text-white">
            {stat.current ?? <span className="text-base font-bold text-slate-500">Unrated</span>}
          </p>
          <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
            {stat.peak != null ? (
              <>
                <Icon name="star" size={10} className={atPeak ? "text-amber-400" : "text-slate-600"} filled={atPeak} />
                Peak <span className="font-mono text-slate-400">{stat.peak}</span>
              </>
            ) : (
              "No rated games yet"
            )}
          </p>
        </div>
        <div className="w-20">
          <Sparkline values={values} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-slate-800/70 pt-2 font-mono text-[10px]">
        <span className="text-emerald-400">{stat.wins}W</span>
        <span className="text-slate-700">/</span>
        <span className="text-rose-400">{stat.losses}L</span>
        <span className="text-slate-700">/</span>
        <span className="text-slate-400">{stat.draws}D</span>
      </div>
    </article>
  );
}
