'use client';
import * as React from "react";
import type { PlateData } from "@/lib/types";
import { DnaExtractionWell } from "./dna-extraction-well";
import { cn } from "@/lib/utils";

type DnaExtractionGridProps = {
  plateData: PlateData;
  platePrefix: string;
  colOffset?: number;
  selectedWells?: Set<string>;
  onWellSelect?: (prefixedWellId: string, isCtrlKey: boolean) => void;
  onBulkSelect?: (platePrefix: string, type: 'row' | 'col', key: string | number) => void;
};

export function DnaExtractionGrid({
  plateData,
  platePrefix,
  colOffset = 0,
  selectedWells,
  onWellSelect,
  onBulkSelect,
}: DnaExtractionGridProps) {
  const rows = 8;
  const cols = 6;
  const rowLabels = Array.from({ length: rows }, (_, i) => String.fromCharCode(65 + i));
  const colLabels = Array.from({ length: cols }, (_, i) => i + 1 + colOffset);

  const isInteractive = !!onWellSelect && !!onBulkSelect && !!selectedWells;

  if (!plateData || Object.keys(plateData).length === 0) {
    return <div className="p-4 text-muted-foreground">No plate data to display.</div>;
  }

  return (
    <div className="grid gap-2 p-2" style={{ gridTemplateColumns: `auto repeat(${cols}, minmax(0, 1fr))` }}>
      {/* Corner */}
      <div></div>

      {/* Column Headers */}
      {colLabels.map((col) => (
          <div 
          key={`col-${col}`} 
          onClick={() => isInteractive && onBulkSelect?.(platePrefix, 'col', col)}
          className={cn(
              "flex items-center justify-center rounded-md p-1 text-base font-bold text-muted-foreground",
              isInteractive && "cursor-pointer hover:bg-muted"
          )}>
          {col}
          </div>
      ))}

      {/* Row Headers and Wells */}
      {rowLabels.map((rowLabel) => (
          <React.Fragment key={rowLabel}>
          <div 
              onClick={() => isInteractive && onBulkSelect?.(platePrefix, 'row', rowLabel)}
              className={cn(
                  "flex items-center justify-center rounded-md p-1 text-base font-bold text-muted-foreground",
                  isInteractive && "cursor-pointer hover:bg-muted"
              )}>
              {rowLabel}
          </div>
          {colLabels.map((col, index) => {
              const wellIdInGrid = `${rowLabel}${index + 1}`;
              const well = plateData[wellIdInGrid];

              if (!well) return <div key={wellIdInGrid} />;

              const prefixedWellId = `${platePrefix}-${well.id}`;
              
              return (
                <DnaExtractionWell
                    key={well.id}
                    well={well}
                    isSelected={!!(isInteractive && selectedWells.has(prefixedWellId))}
                    onSelect={onWellSelect ? (_wellId, isCtrlKey) => {
                        onWellSelect(prefixedWellId, isCtrlKey);
                    } : () => {}}
                />
              );
          })}
          </React.Fragment>
      ))}
    </div>
  );
}
