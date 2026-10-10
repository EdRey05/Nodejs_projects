"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { DNA_EXTRACTION_ANTIBIOTICS, DNA_EXTRACTION_ANTIBIOTIC_NAMES, DNA_EXTRACTION_TEMPERATURES, DNA_EXTRACTION_BACTERIA, DNA_EXTRACTION_INCUBATION_TIMES, DNA_EXTRACTION_PREPS } from "@/lib/types";
import { Thermometer, Pill, XCircle, Beaker, Clock, Edit3, ClipboardList } from "lucide-react";

type DnaExtractionControlPanelProps = {
  onApplyParameter: (type: 'antibiotic' | 'temperature' | 'bacteria' | 'incubationTime' | 'prep', value: string) => void;
  onClearParameters: () => void;
  hasSelection: boolean;
};

export function DnaExtractionControlPanel({ onApplyParameter, onClearParameters, hasSelection }: DnaExtractionControlPanelProps) {
  const [customInput, setCustomInput] = useState<{ type: string; value: string } | null>(null);

  const handleApply = (type: any, value: string) => {
    if (value === 'Other') {
      setCustomInput({ type, value: '' });
    } else {
      onApplyParameter(type, value);
      setCustomInput(null);
    }
  };

  const handleCustomSubmit = () => {
    if (customInput && customInput.value.trim()) {
      onApplyParameter(customInput.type as any, customInput.value);
      setCustomInput(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Well Conditions</CardTitle>
        <CardDescription>Select wells on the grids below and apply conditions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!hasSelection}>
                <Pill className="mr-2 h-4 w-4" />
                Antibiotic
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {DNA_EXTRACTION_ANTIBIOTICS.map((ab) => (
                <DropdownMenuItem key={ab} onSelect={() => handleApply('antibiotic', ab)}>
                  {DNA_EXTRACTION_ANTIBIOTIC_NAMES[ab]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!hasSelection}>
                <Thermometer className="mr-2 h-4 w-4" />
                Temperature
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {DNA_EXTRACTION_TEMPERATURES.map((temp) => (
                <DropdownMenuItem key={temp} onSelect={() => handleApply('temperature', temp)}>
                  {temp}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!hasSelection}>
                <Beaker className="mr-2 h-4 w-4" />
                Bacteria
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {DNA_EXTRACTION_BACTERIA.map((bac) => (
                <DropdownMenuItem key={bac} onSelect={() => handleApply('bacteria', bac)}>
                  {bac}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!hasSelection}>
                <Clock className="mr-2 h-4 w-4" />
                Incubation
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {DNA_EXTRACTION_INCUBATION_TIMES.map((time) => (
                <DropdownMenuItem key={time} onSelect={() => handleApply('incubationTime', time)}>
                  {time}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!hasSelection}>
                <ClipboardList className="mr-2 h-4 w-4" />
                Prep
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {DNA_EXTRACTION_PREPS.map((p) => (
                <DropdownMenuItem key={p} onSelect={() => handleApply('prep', p)}>
                  {p}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="destructive" size="icon" onClick={onClearParameters} disabled={!hasSelection} title="Clear Parameters">
            <XCircle className="h-4 w-4" />
          </Button>
        </div>

        {customInput && (
          <div className="flex items-center gap-2 p-2 rounded-md border bg-muted/50 animate-in fade-in slide-in-from-top-2">
            <Edit3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Custom {customInput.type}:</span>
            <Input 
              size={1}
              className="flex-1 h-8"
              placeholder="Enter value..."
              value={customInput.value}
              onChange={(e) => setCustomInput({ ...customInput, value: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
              autoFocus
            />
            <Button size="sm" className="h-8" onClick={handleCustomSubmit}>Apply</Button>
            <Button size="sm" className="h-8" variant="ghost" onClick={() => setCustomInput(null)}>Cancel</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
