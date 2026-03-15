"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DNA_EXTRACTION_ANTIBIOTICS, DNA_EXTRACTION_ANTIBIOTIC_NAMES, DNA_EXTRACTION_TEMPERATURES } from "@/lib/types";
import { Thermometer, Pill, XCircle } from "lucide-react";

type DnaExtractionControlPanelProps = {
  onApplyParameter: (type: 'antibiotic' | 'temperature', value: string) => void;
  onClearParameters: () => void;
  hasSelection: boolean;
};

export function DnaExtractionControlPanel({ onApplyParameter, onClearParameters, hasSelection }: DnaExtractionControlPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Well Conditions</CardTitle>
        <CardDescription>Select wells on the grids below and apply conditions.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={!hasSelection}>
              <Pill className="mr-2 h-4 w-4" />
              Antibiotic
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {DNA_EXTRACTION_ANTIBIOTICS.map((ab) => (
              <DropdownMenuItem key={ab} onSelect={() => onApplyParameter('antibiotic', ab)}>
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
              <DropdownMenuItem key={temp} onSelect={() => onApplyParameter('temperature', temp)}>
                {temp}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="destructive" size="icon" onClick={onClearParameters} disabled={!hasSelection} title="Clear Parameters">
          <XCircle className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
