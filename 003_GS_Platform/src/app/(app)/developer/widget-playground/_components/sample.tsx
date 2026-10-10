"use client";

import { cn } from "@/lib/utils";
import type { Sample as SampleType } from "@/lib/types";

type SampleProps = {
  sample: SampleType;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, sample: SampleType) => void;
  isUsed?: boolean;
};

export function Sample({ sample, onDragStart, isUsed = false }: SampleProps) {
  return (
    <div
      draggable={!isUsed}
      onDragStart={(e) => onDragStart(e, sample)}
      className={cn(
        "flex h-12 w-24 cursor-grab items-center justify-center rounded-lg border-2 p-2 shadow-sm transition-opacity",
        sample.color,
        isUsed ? 'opacity-30 cursor-not-allowed' : 'hover:shadow-md active:cursor-grabbing active:scale-95'
      )}
    >
      <span className="font-medium text-sm text-primary-foreground mix-blend-difference">{sample.name}</span>
    </div>
  );
}
