// src/components/AIExplanation.tsx
import React from "react";
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Radar } from "react-chartjs-2";
import type { ScoreFactor } from "./MissionCard";

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

type AIExplanationProps = {
  overallScore: number;
  factors: ScoreFactor[];
  reasoning?: string;
  compact?: boolean;
};

export const AIExplanation: React.FC<AIExplanationProps> = ({
  overallScore,
  factors,
  reasoning,
  compact = false,
}) => {
  const labels = factors.map((f) => f.label);
  const scores = factors.map((f) => Math.max(0, Math.min(100, f.score)));

  const data = {
    labels,
    datasets: [
      {
        label: "AI Score",
        data: scores,
        borderWidth: 1.5,
        pointRadius: 2.5,
        pointHitRadius: 8,
        fill: true,
      },
    ],
  };

  const options: React.ComponentProps<typeof Radar>["options"] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.label}: ${Math.round(Number(ctx.raw))}/100`,
        },
      },
    },
    scales: {
      r: {
        suggestedMin: 0,
        suggestedMax: 100,
        angleLines: {
          color: "rgba(148, 163, 184, 0.25)",
        },
        grid: {
          color: "rgba(51, 65, 85, 0.4)",
        },
        ticks: {
          backdropColor: "rgba(15, 23, 42, 0.9)",
          color: "#cbd5f5",
          showLabelBackdrop: true,
          stepSize: 20,
        },
        pointLabels: {
          color: "#e5e7eb",
          font: {
            size: compact ? 9 : 11,
          },
        },
      },
    },
  };

  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-950/70 p-4 ${
        compact ? "space-y-3" : "space-y-4"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-50">
            Come l&apos;AI ha valutato questa missione
          </h4>
          <p className="text-xs text-slate-400">
            Breakdown dei fattori del modello W-MOON.
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[11px] uppercase text-slate-400">Score</span>
          <span className="text-lg font-semibold text-indigo-300">
            {Math.round(overallScore)}/100
          </span>
        </div>
      </div>

      {/* Radar chart */}
      {factors.length > 1 && (
        <div className="h-52">
          <Radar data={data} options={options} />
        </div>
      )}

      {/* Tabella fattori */}
      <div className="grid grid-cols-1 gap-2 text-xs text-slate-200 sm:grid-cols-2">
        {factors.map((factor) => (
          <div
            key={factor.key}
            className="flex flex-col rounded-lg bg-slate-900/80 p-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{factor.label}</span>
              <span className="font-semibold text-slate-50">
                {Math.round(factor.score)}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-500"
                style={{
                  width: `${Math.max(0, Math.min(100, factor.score))}%`,
                }}
              />
            </div>
            {typeof factor.weight === "number" && (
              <span className="mt-0.5 text-[10px] text-slate-400">
                Peso nel modello: {(factor.weight * 100).toFixed(0)}%
              </span>
            )}
          </div>
        ))}
      </div>

      {reasoning && (
        <div className="border-t border-slate-800 pt-3">
          <p className="text-xs text-slate-300 whitespace-pre-line">
            {reasoning}
          </p>
        </div>
      )}
    </div>
  );
};
