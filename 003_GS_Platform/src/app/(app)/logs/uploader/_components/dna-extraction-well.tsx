"use client";
import { cn } from "@/lib/utils";
import type { WellData } from "@/lib/types";
import { DNA_EXTRACTION_ANTIBIOTIC_COLORS, DNA_EXTRACTION_ANTIBIOTIC_BORDERS, STANDARD_CONDITIONS } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type DnaExtractionWellProps = {
  well: WellData;
  isSelected?: boolean;
  onSelect?: (wellId: string, isCtrlKey: boolean) => void;
};

export function DnaExtractionWell({ well, isSelected = false, onSelect }: DnaExtractionWellProps) {
  const content = well.content?.trim() ?? '';
  const isDisabled = content === '';

  const antibioticBgColor = well.params.antibiotic ? DNA_EXTRACTION_ANTIBIOTIC_COLORS[well.params.antibiotic] : "";
  const antibioticBorderColor = well.params.antibiotic ? DNA_EXTRACTION_ANTIBIOTIC_BORDERS[well.params.antibiotic] : "border-muted";

  const getConditionValue = (key: keyof typeof STANDARD_CONDITIONS) => {
    return well.params[key] || STANDARD_CONDITIONS[key];
  };

  const bacteria = getConditionValue('bacteria');
  const temperature = getConditionValue('temperature');
  const incubation = getConditionValue('incubationTime');
  const prep = getConditionValue('prep');
  const antibiotic = well.params.antibiotic || 'None';

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onClick={(e) => !isDisabled && onSelect?.(well.id, e.ctrlKey || e.metaKey)}
            data-well-id={well.id}
            className={cn(
              "relative flex aspect-[3/1] items-center justify-center rounded-md p-1 transition-all duration-150",
              isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-accent/70",
              isDisabled && !antibioticBgColor && "bg-muted/30",
              antibioticBgColor,
              well.params.antibiotic ? `${antibioticBorderColor} border-2` : "border",
              isSelected && !isDisabled && "border-accent ring-2 ring-accent z-10"
            )}
          >
            {content && (
              <span className="text-center text-[10px] font-black leading-tight text-black">
                {content}
              </span>
            )}
          </div>
        </TooltipTrigger>
        {!isDisabled && (
          <TooltipContent className="p-3 space-y-1">
            <p className="font-bold border-b pb-1 mb-1">Well {well.id}</p>
            <p className="text-xs"><strong>Antibiotic:</strong> {antibiotic}</p>
            <p className="text-xs"><strong>Bacteria:</strong> {bacteria}</p>
            <p className="text-xs"><strong>Temperature:</strong> {temperature}</p>
            <p className="text-xs"><strong>Incubation:</strong> {incubation}</p>
            <p className="text-xs"><strong>Prep:</strong> {prep}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
