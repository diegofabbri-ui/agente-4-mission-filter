// src/components/MissionCard.tsx
import React from "react";

export type ScoreFactor = {
  key: string;
  label: string;
  score: number; // 0–100
  weight?: number; // 0–1 opzionale
};

export type AIMissionMeta = {
  overallScore: number; // 0–100
  isScam: boolean;
  riskLabel?: string;
  factors: ScoreFactor[];
  reasoning?: string;
};

export type MissionSummary = {
  id: string;
  title: string;
  description?: string;
  platform?: string;
  payout?: number;
  currency?: string;
  estimatedMinutes?: number;
  url?: string;
};

type MissionCardProps = {
  mission: MissionSummary;
  ai: AIMissionMeta;
  onSelect?: (id: string) => void;
  onAccept?: (id: string) => void;
};

const getScoreColor = (score: number) => {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-yellow-400";
  if (score >= 40) return "bg-orange-400";
  return "bg-rose-500";
};

const getScoreTextColor = (score: number) => {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-yellow-600";
  if (score >= 40) return "text-orange-600";
  return "text-rose-600";
};

const riskBadgeStyles: Record<string, string> = {
  safe: "bg-emerald-100 text-emerald-700 border-emerald-300",
  warning: "bg-amber-100 text-amber-700 border-amber-300",
  danger: "bg-rose-100 text-rose-700 border-rose-300",
};

export const MissionCard: React.FC<MissionCardProps> = ({
  mission,
  ai,
  onSelect,
  onAccept,
}) => {
  const {
    id,
    title,
    description,
    platform,
    payout,
    currency = "€",
    estimatedMinutes,
    url,
  } = mission;

  const { overallScore, isScam, riskLabel, factors, reasoning } = ai;

  const riskKey = riskLabel ?? (isScam ? "danger" : "safe");
  const riskBadgeClass =
    riskBadgeStyles[riskKey] ??
    "bg-slate-100 text-slate-700 border-slate-300";

  const handleCardClick = () => {
    if (onSelect) onSelect(id);
  };

  const handleAcceptClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (onAccept) onAccept(id);
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-slate-800/60 bg-slate-950/60 p-4 shadow-md shadow-slate-900/60 hover:border-indigo-500/80 hover:shadow-lg hover:shadow-indigo-900/40 transition-colors cursor-pointer"
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {platform && (
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-200 uppercase tracking-wide">
                {platform}
              </span>
            )}
            {isScam && (
              <span className="rounded-full bg-rose-900/50 px-2.5 py-0.5 text-xs font-semibold text-rose-200 border border-rose-700/80">
                Possible SCAM
              </span>
            )}
          </div>
          <h3 className="mt-1 text-base font-semibold text-slate-50 line-clamp-2">
            {title}
          </h3>
        </div>

        {/* Overall score */}
        <div className="flex flex-col items-end gap-1">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-slate-900" />
            <div className="absolute inset-[3px] rounded-full bg-slate-950 border border-slate-700" />
            <div
              className={`relative h-10 w-10 rounded-full ${getScoreColor(
                overallScore
              )} flex items-center justify-center text-sm font-bold text-slate-950`}
            >
              {Math.round(overallScore)}
            </div>
          </div>
          <span
            className={`text-[11px] font-semibold uppercase tracking-wide ${getScoreTextColor(
              overallScore
            )}`}
          >
            AI SCORE
          </span>
        </div>
      </div>

      {/* Description */}
      {description && (
        <p className="text-sm text-slate-300 line-clamp-3">{description}</p>
      )}

      {/* Payout + time */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-200">
        {typeof payout === "number" && (
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-2 py-1">
            <span className="font-semibold">
              {payout.toFixed(2)} {currency}
            </span>
            {typeof estimatedMinutes === "number" && estimatedMinutes > 0 && (
              <span className="text-slate-400">
                · ~{estimatedMinutes} min ·{" "}
                {payout > 0 && estimatedMinutes > 0
                  ? `${(payout / (estimatedMinutes / 60)).toFixed(1)} ${currency}/h`
                  : ""}
              </span>
            )}
          </div>
        )}

        {riskLabel && (
          <span
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium ${riskBadgeClass}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {riskLabel.toUpperCase()}
          </span>
        )}
      </div>

      {/* Factors mini-bar */}
      {factors?.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {factors.slice(0, 4).map((factor) => (
            <div
              key={factor.key}
              className="flex min-w-[120px] flex-1 flex-col gap-0.5 rounded-lg bg-slate-900/80 p-2"
            >
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="font-medium">{factor.label}</span>
                <span className="font-semibold text-slate-50">
                  {Math.round(factor.score)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${Math.max(0, Math.min(100, factor.score))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reasoning */}
      {reasoning && (
        <p className="mt-1 text-xs text-slate-400 line-clamp-2">
          {reasoning}
        </p>
      )}

      {/* Footer actions */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-[11px] text-slate-500">
          ID: <span className="font-mono text-slate-300">{id}</span>
        </div>

        <div className="flex items-center gap-2">
          {url && (
            <a
              href={url}
              onClick={(e) => e.stopPropagation()}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
            >
              Apri dettagli
            </a>
          )}
          {onAccept && (
            <button
              onClick={handleAcceptClick}
              className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-indigo-400 active:bg-indigo-500 transition-colors"
            >
              Accetta missione
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
