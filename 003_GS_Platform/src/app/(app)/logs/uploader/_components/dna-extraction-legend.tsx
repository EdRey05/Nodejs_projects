'use client';

import { DNA_EXTRACTION_ANTIBIOTIC_COLORS, STANDARD_CONDITIONS } from '@/lib/types';
import type { PlateData } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

type DnaExtractionLegendProps = {
  plateData: PlateData;
};

export function DnaExtractionLegend({ plateData }: DnaExtractionLegendProps) {
  const { usedAntibiotics, nonStandardWells } = useMemo(() => {
    const abx = new Set<string>();
    const deviations: { well: string; details: string }[] = [];

    Object.values(plateData).forEach(well => {
      if (!well?.content?.trim()) return;

      if (well.params.antibiotic) abx.add(well.params.antibiotic);

      const devParts = [];
      if (well.params.bacteria && well.params.bacteria !== STANDARD_CONDITIONS.bacteria) {
        devParts.push(well.params.bacteria);
      }
      if (well.params.temperature && well.params.temperature !== STANDARD_CONDITIONS.temperature) {
        devParts.push(well.params.temperature);
      }
      if (well.params.incubationTime && well.params.incubationTime !== STANDARD_CONDITIONS.incubationTime) {
        devParts.push(well.params.incubationTime);
      }
      if (well.params.prep && well.params.prep !== STANDARD_CONDITIONS.prep) {
        devParts.push(well.params.prep);
      }

      if (devParts.length > 0) {
        deviations.push({ well: well.id, details: devParts.join(', ') });
      }
    });

    return { 
      usedAntibiotics: Array.from(abx).sort(),
      nonStandardWells: deviations
    };
  }, [plateData]);

  return (
    <div className="mt-4 border-t pt-4 px-2">
      <div className="grid grid-cols-3 gap-12">
        {/* Column 1: Standard */}
        <div className="space-y-3">
          <h4 className="text-base font-bold uppercase tracking-wider text-muted-foreground border-b pb-1.5">Standard</h4>
          <p className="text-base text-foreground leading-snug">
            {STANDARD_CONDITIONS.bacteria}, {STANDARD_CONDITIONS.temperature}, {STANDARD_CONDITIONS.incubationTime}
          </p>
        </div>

        {/* Column 2: Antibiotic */}
        <div className="space-y-3">
          <h4 className="text-base font-bold uppercase tracking-wider text-muted-foreground border-b pb-1.5">Antibiotic</h4>
          <div className="flex flex-col gap-2">
            {usedAntibiotics.length > 0 ? (
              usedAntibiotics.map(ab => (
                <div key={ab} className="flex items-center gap-3">
                  <div className={cn("h-4 w-4 rounded-sm border-2", DNA_EXTRACTION_ANTIBIOTIC_COLORS[ab])}></div>
                  <span className="text-base font-medium">{ab}</span>
                </div>
              ))
            ) : (
              <span className="text-base text-muted-foreground italic">None assigned</span>
            )}
          </div>
        </div>

        {/* Column 3: Special */}
        <div className="space-y-3">
          <h4 className="text-base font-bold uppercase tracking-wider text-muted-foreground border-b pb-1.5">Special</h4>
          <div className="space-y-1.5 max-h-40 overflow-auto pr-2 scrollbar-thin">
            {nonStandardWells.length > 0 ? (
              nonStandardWells.map((dev, i) => (
                <div key={i} className="flex gap-3 text-sm leading-tight">
                  <span className="font-bold shrink-0">{dev.well}:</span>
                  <span className="text-muted-foreground">{dev.details}</span>
                </div>
              ))
            ) : (
              <span className="text-base text-muted-foreground italic">None</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
