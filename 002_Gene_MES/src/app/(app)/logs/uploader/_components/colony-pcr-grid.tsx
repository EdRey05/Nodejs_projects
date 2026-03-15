"use client";
import * as React from "react";
import type { PlateData } from "@/lib/types";
import { ColonyPcrWell } from "./colony-pcr-well";

type ColonyPcrGridProps = {
  plateData: PlateData;
  positiveWells: Set<string>;
  onTogglePositive: (wellId: string) => void;
};

export function ColonyPcrGrid({ plateData, positiveWells, onTogglePositive }: ColonyPcrGridProps) {
  const rows = 8;
  const cols = 12;
  const rowLabels = Array.from({ length: rows }, (_, i) => String.fromCharCode(65 + i));
  const colLabels = Array.from({ length: cols }, (_, i) => i + 1);

  return (
    <div className="grid gap-2 p-2" style={{ gridTemplateColumns: `auto repeat(${cols}, minmax(0, 1fr))` }}>
      {/* Corner */}
      <div></div>

      {/* Column Headers */}
      {colLabels.map((col) => (
        <div key={`col-${col}`} className="flex cursor-default items-center justify-center rounded-md p-1 text-sm font-bold">
          {col}
        </div>
      ))}

      {/* Row Headers and Wells */}
      {rowLabels.map((rowLabel) => (
        <React.Fragment key={rowLabel}>
          <div className="flex cursor-default items-center justify-center rounded-md p-1 text-sm font-bold">
            {rowLabel}
          </div>
          {colLabels.map((col) => {
            const wellId = `${rowLabel}${col}`;
            const well = plateData[wellId];
            if (!well) return <div key={wellId} />;
            return (
              <ColonyPcrWell
                key={well.id}
                well={well}
                isPositive={positiveWells.has(well.id)}
                onTogglePositive={onTogglePositive}
              />
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
