"use client";
import { cn } from "@/lib/utils";
import type { WellData } from "@/lib/types";
import { DNA_EXTRACTION_ANTIBIOTIC_COLORS, DNA_EXTRACTION_TEMPERATURE_BORDERS, DNA_EXTRACTION_ANTIBIOTIC_BORDERS } from "@/lib/types";

type DnaExtractionWellProps = {
  well: WellData;
  isSelected: boolean;
  onSelect: (wellId: string, isCtrlKey: boolean) => void;
};

export function DnaExtractionWell({ well, isSelected, onSelect }: DnaExtractionWellProps) {
  const content = well.content?.trim() ?? '';
  const isDisabled = content === '';

  const antibioticBgColor = well.params.antibiotic ? DNA_EXTRACTION_ANTIBIOTIC_COLORS[well.params.antibiotic] : "";
  const antibioticBorderColor = well.params.antibiotic ? DNA_EXTRACTION_ANTIBIOTIC_BORDERS[well.params.antibiotic] : "border-muted";
  const temperatureBorderStyle = well.params.temperature ? DNA_EXTRACTION_TEMPERATURE_BORDERS[well.params.temperature] : "border-solid";
  
  return (
    <div
      onClick={(e) => !isDisabled && onSelect(well.id, e.ctrlKey || e.metaKey)}
      data-well-id={well.id}
      className={cn(
        "relative flex aspect-[4/2] items-center justify-center rounded-md p-1 transition-all duration-150",
        // Base interactive style
        isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-accent/70",
        
        // Base background for empty wells
        isDisabled && !antibioticBgColor && "bg-muted/30",
        
        // Conditional background and border colors from antibiotic
        antibioticBgColor,
        temperatureBorderStyle,
        well.params.antibiotic ? `${antibioticBorderColor} border-2` : "border",
        
        // Selection override
        isSelected && !isDisabled && "border-accent ring-2 ring-accent z-10"
      )}
    >
      {content && (
        <span className="text-center text-[11px] font-black leading-tight text-black">
          {content}
        </span>
      )}
    </div>
  );
}
