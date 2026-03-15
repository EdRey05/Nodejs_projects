"use client";

import type { Sample as SampleType } from "@/lib/types";
import { Sample } from "./sample";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

type SamplePaletteProps = {
  samples: SampleType[];
  usedSampleIds: Set<string>;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, sample: SampleType) => void;
  onDropInTrash: (e: React.DragEvent<HTMLDivElement>) => void;
};

export function SamplePalette({ samples, usedSampleIds, onDragStart, onDropInTrash }: SamplePaletteProps) {
  const [isOverTrash, setIsOverTrash] = useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOverTrash(true);
  };
  
  const handleDragLeave = () => {
    setIsOverTrash(false);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    onDropInTrash(e);
    setIsOverTrash(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sample Palette</CardTitle>
        <CardDescription>Drag samples onto the wells of a plate.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-4">
        {samples.map((sample) => (
          <Sample
            key={sample.id}
            sample={sample}
            onDragStart={onDragStart}
            isUsed={usedSampleIds.has(sample.id)}
          />
        ))}
        <div 
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "flex flex-col h-24 w-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed p-2 transition-colors",
            isOverTrash ? "border-destructive bg-destructive/20" : "border-muted-foreground/50 hover:border-destructive"
          )}
        >
          <Trash2 className={cn("h-8 w-8 transition-colors", isOverTrash ? "text-destructive" : "text-muted-foreground")} />
          <p className={cn("text-xs mt-1 transition-colors", isOverTrash ? "text-destructive" : "text-muted-foreground")}>
            Remove Sample
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
