"use client";

import * as React from "react";
import type { PlateData } from "@/lib/types";
import { Well } from "./well";

type PlateGridProps = {
  plateData: PlateData;
  rows: number;
  cols: number;
  title: string;
  selectedWells: Set<string>;
  plateId: 'plate96' | 'plate48';
  wellShape: 'circle' | 'rect';
  onWellSelect: (wellId: string, isCtrlKey: boolean) => void;
  onWellDrop: (e: React.DragEvent<HTMLDivElement>, wellId: string, plateId: 'plate96' | 'plate48') => void;
  onWellDragStart: (e: React.DragEvent<HTMLDivElement>, wellId: string, sampleId: string, plateId: 'plate96' | 'plate48') => void;
  onBulkSelect: (type: 'row' | 'col', key: string | number) => void;
  draggedOverWell: string | null;
  onWellDragEnter: (wellId: string) => void;
  onWellDragLeave: () => void;
};

export function PlateGrid({
  plateData,
  rows,
  cols,
  title,
  selectedWells,
  onWellSelect,
  onWellDrop,
  onWellDragStart,
  onBulkSelect,
  draggedOverWell,
  onWellDragEnter,
  onWellDragLeave,
  plateId,
  wellShape
}: PlateGridProps) {
  const rowLabels = Array.from({ length: rows }, (_, i) => String.fromCharCode(65 + i));
  const colLabels = Array.from({ length: cols }, (_, i) => i + 1);

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 text-center">{title}</h2>
        <div className="grid gap-2" style={{ gridTemplateColumns: `auto repeat(${cols}, 1fr)` }}>
            {/* Corner */}
            <div></div>

            {/* Column Headers */}
            {colLabels.map((col) => (
            <div key={`col-${col}`} onClick={() => onBulkSelect('col', col)} className="flex cursor-pointer items-center justify-center rounded-md p-1 text-sm font-bold text-muted-foreground hover:bg-muted">
                {col}
            </div>
            ))}

            {/* Row Headers and Wells */}
            {rowLabels.map((rowLabel) => (
            <React.Fragment key={rowLabel}>
                <div onClick={() => onBulkSelect('row', rowLabel)} className="flex cursor-pointer items-center justify-center rounded-md p-1 text-sm font-bold text-muted-foreground hover:bg-muted">
                {rowLabel}
                </div>
                {colLabels.map((col) => {
                const wellId = `${rowLabel}${col}`;
                const well = plateData[wellId];
                if (!well) return null;
                return (
                    <Well
                    key={well.id}
                    well={well}
                    wellShape={wellShape}
                    isSelected={selectedWells.has(well.id)}
                    onSelect={onWellSelect}
                    onDrop={(e) => onWellDrop(e, well.id, plateId)}
                    onDragStart={(e, sampleId) => onWellDragStart(e, well.id, sampleId, plateId)}
                    isDragOver={draggedOverWell === well.id}
                    onDragEnter={onWellDragEnter}
                    onDragLeave={onWellDragLeave}
                    />
                );
                })}
            </React.Fragment>
            ))}
        </div>
    </div>
  );
}
