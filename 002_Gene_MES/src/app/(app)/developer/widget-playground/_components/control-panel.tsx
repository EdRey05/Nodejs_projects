"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ANTIBIOTICS, TEMPERATURES } from "@/lib/types";
import { Thermometer, Pill, XCircle } from "lucide-react";

type ControlPanelProps = {
  onApplyParameter: (type: 'antibiotic' | 'temperature', value: string) => void;
  onClearParameters: () => void;
  hasSelection: boolean;
};

export function ControlPanel({ onApplyParameter, onClearParameters, hasSelection }: ControlPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Control Panel</CardTitle>
        <CardDescription>Select wells and apply parameters.</CardDescription>
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
            {ANTIBIOTICS.map((ab) => (
              <DropdownMenuItem key={ab} onSelect={() => onApplyParameter('antibiotic', ab)}>
                {ab}
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
            {TEMPERATURES.map((temp) => (
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
