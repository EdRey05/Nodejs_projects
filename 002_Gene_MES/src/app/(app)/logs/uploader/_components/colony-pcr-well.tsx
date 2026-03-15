"use client";
import { cn } from "@/lib/utils";
import type { WellData } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type ColonyPcrWellProps = {
  well: WellData;
  isPositive: boolean;
  onTogglePositive: (wellId: string) => void;
};

export function ColonyPcrWell({ well, isPositive, onTogglePositive }: ColonyPcrWellProps) {
  const content = well.content?.trim() ?? '';
  const isDisabled = content === '' || content === 'CK+' || content === 'CK-';

  const wellComponent = (
    <div
      onClick={() => !isDisabled && onTogglePositive(well.id)}
      data-well-id={well.id}
      className={cn(
        "relative flex aspect-[4/2] items-center justify-center rounded-md border p-1 transition-all duration-150",
        isDisabled
          ? "cursor-not-allowed border-muted bg-muted/50"
          : isPositive
          ? "cursor-pointer border-2 border-green-500 bg-green-400/50 ring-1 ring-green-500"
          : "cursor-pointer border-muted hover:border-accent/70"
      )}
    >
      {well.content && (
        <span className={cn(
            "text-center text-[10px] font-medium leading-tight",
            isDisabled ? "text-muted-foreground" : "text-foreground"
        )}>
          {well.content}
        </span>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>{wellComponent}</TooltipTrigger>
        {well.content && (
          <TooltipContent>
            <p className="font-bold">Well: {well.id}</p>
            <p>Content: {well.content}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
