'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DNA_EXTRACTION_ANTIBIOTIC_COLORS, DNA_EXTRACTION_TEMPERATURE_BORDERS } from '@/lib/types';
import type { PlateData } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

type DnaExtractionLegendProps = {
  plateData: PlateData;
};

export function DnaExtractionLegend({ plateData }: DnaExtractionLegendProps) {
  const { usedTemperatures, usedAntibiotics } = useMemo(() => {
    const temps = new Set<string>();
    const abx = new Set<string>();
    Object.values(plateData).forEach(well => {
      if (well?.params.temperature) temps.add(well.params.temperature);
      if (well?.params.antibiotic) abx.add(well.params.antibiotic);
    });
    return { usedTemperatures: Array.from(temps).sort(), usedAntibiotics: Array.from(abx).sort() };
  }, [plateData]);

  if (usedTemperatures.length === 0 && usedAntibiotics.length === 0) {
    return null;
  }

  return (
    <Card className="border-none bg-transparent shadow-none">
      <CardHeader className="p-2 pt-4">
        <CardTitle className="text-base font-semibold">Conditions</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 p-2 text-sm">
        {usedAntibiotics.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold">Antibiotic</h4>
            <div className="space-y-1">
              {usedAntibiotics.map(ab => (
                <div key={ab} className="flex items-center gap-2">
                  <div className={cn("h-4 w-4 rounded-sm border", DNA_EXTRACTION_ANTIBIOTIC_COLORS[ab])}></div>
                  <span>{ab}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {usedTemperatures.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold">Temperature</h4>
            <div className="space-y-1">
              {usedTemperatures.map(temp => (
                <div key={temp} className="flex items-center gap-2">
                  <div className={cn("h-4 w-4 rounded-sm border-2", DNA_EXTRACTION_TEMPERATURE_BORDERS[temp])}></div>
                  <span>{temp}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
