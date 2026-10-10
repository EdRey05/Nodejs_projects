"use client";

import { cn } from "@/lib/utils";
import type { WellData } from "@/lib/types";
import { ANTIBIOTIC_COLORS, TEMPERATURE_COLORS } from "@/lib/types";

type WellProps = {
  well: WellData;
  isSelected: boolean;
  onSelect: (wellId: string, isCtrlKey: boolean) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, wellId: string) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, wellId: string, sampleId: string) => void;
  isDragOver: boolean;
  onDragEnter: (wellId: string) => void;
  onDragLeave: () => void;
};

export function Well({
  well,
  isSelected,
  onSelect,
  onDrop,
  onDragStart,
  isDragOver,
  onDragEnter,
  onDragLeave,
}: WellProps) {
  const antibioticColor = well.params.antibiotic ? ANTIBIOTIC_COLORS[well.params.antibiotic] : "";
  const temperatureColor = well.params.temperature ? TEMPERATURE_COLORS[well.params.temperature] : "";

  return (
    <div
      onClick={(e) => onSelect(well.id, e.ctrlKey || e.metaKey)}
      onDrop={(e) => onDrop(e, well.id)}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={() => onDragEnter(well.id)}
      onDragLeave={onDragLeave}
      data-well-id={well.id}
      className={cn(
        "relative flex aspect-square cursor-pointer items-center justify-center rounded-full border-2 transition-all duration-150",
        isSelected ? "border-accent ring-2 ring-accent" : "border-muted",
        isDragOver ? "border-accent ring-2 ring-accent scale-110 z-10" : "",
        "hover:border-accent/70",
        antibioticColor,
        temperatureColor,
      )}
    >
      <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] font-bold text-muted-foreground">{well.params.temperature}</span>
      <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[8px] font-bold text-muted-foreground">{well.params.antibiotic}</span>
      {well.sample ? (
        <div
          draggable
          onDragStart={(e) => onDragStart(e, well.id, well.sample!.id)}
          className={cn(
            "flex h-[80%] w-[80%] items-center justify-center rounded-full border shadow-inner transition-transform active:scale-90",
            well.sample.color
          )}
        >
          <span className="text-xs font-medium text-white mix-blend-difference">
            {well.sample.name}
          </span>
        </div>
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">{well.id}</span>
      )}
    </div>
  );
}
