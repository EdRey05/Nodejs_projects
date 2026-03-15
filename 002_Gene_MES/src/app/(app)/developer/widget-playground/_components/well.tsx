"use client";

import { cn } from "@/lib/utils";
import type { WellData } from "@/lib/types";
import { ANTIBIOTIC_COLORS, TEMPERATURE_COLORS } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type WellProps = {
  well: WellData;
  wellShape: 'circle' | 'rect';
  isSelected: boolean;
  onSelect: (wellId: string, isCtrlKey: boolean) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, sampleId: string) => void;
  isDragOver: boolean;
  onDragEnter: (wellId: string) => void;
  onDragLeave: () => void;
};

export function Well({
  well,
  wellShape,
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

  const hasContent = well.sample || well.params.antibiotic || well.params.temperature;

  const wellComponent = (
     <div
      onClick={(e) => onSelect(well.id, e.ctrlKey || e.metaKey)}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={() => onDragEnter(well.id)}
      onDragLeave={onDragLeave}
      data-well-id={well.id}
      className={cn(
        "relative flex aspect-square cursor-pointer items-center justify-center border-2 transition-all duration-150",
        wellShape === 'circle' ? 'rounded-full' : 'rounded-md',
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
          onDragStart={(e) => onDragStart(e, well.sample!.id)}
          className={cn(
            "flex h-[80%] w-[80%] items-center justify-center border shadow-inner transition-transform active:scale-90",
            wellShape === 'circle' ? 'rounded-full' : 'rounded-md',
            well.sample.color
          )}
        >
          <span className="text-xs font-medium text-white mix-blend-difference">
            {well.sample.name}
          </span>
        </div>
      ) : null}
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{wellComponent}</TooltipTrigger>
        {hasContent && (
          <TooltipContent>
            <p className="font-bold">Well: {well.id}</p>
            {well.sample && <p>Sample: {well.sample.name}</p>}
            {well.params.temperature && <p>Temperature: {well.params.temperature}</p>}
            {well.params.antibiotic && <p>Antibiotic: {well.params.antibiotic}</p>}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}
