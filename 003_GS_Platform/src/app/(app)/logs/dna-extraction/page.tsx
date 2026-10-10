'use client';

import { useState, useEffect } from 'react';
import { useDatabase } from '../../_context/DatabaseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel';
import { Dna, GitBranch } from 'lucide-react';
import { LogSearchCombobox } from '@/components/ui/log-search-combobox';
import { ExportLogButton } from '@/components/export-log-button';
import { useCarouselArrows } from '@/hooks/use-carousel-arrows';
import * as xlsx from 'xlsx';
import { DnaExtractionGrid } from '../uploader/_components/dna-extraction-grid';
import { DnaExtractionLegend } from '../uploader/_components/dna-extraction-legend';
import type { PlateData } from '@/lib/types';
import { generatePlateData } from '@/lib/utils';

type ParsedPlateData = {
  plateId: string;
  data: PlateData;
};

type GroupedLogData = {
  code: string;
  id: number;
  plates: ParsedPlateData[];
};

export default function DnaExtractionLogPage() {
  const { databases } = useDatabase();
  const [groupedData, setGroupedData] = useState<GroupedLogData[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [api, setApi] = useState<CarouselApi>();
  useCarouselArrows(api);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const db = databases['DNA Extraction'];
    if (db && db.payload) {
        try {
            const payload = db.payload;
            const indexData = payload.index as { name: string; id: number }[];
            const allGridData = payload.data as any[];
            const idColName = 'dna_extraction_id';

            const antibioticsData = payload.antibiotic || [];
            const temperaturesData = payload.temperature || [];
            const bacteriaData = payload.bacteria || [];
            const incubationData = payload.incubation || [];
            const prepData = payload.prep || [];

            if (!indexData || indexData.length === 0) {
                setGroupedData([]);
                setIsLoading(false);
                return;
            }

            const grouped = indexData.map(indexEntry => {
            if (indexEntry.id == null || indexEntry.name == null) {
              return null;
            }
            const entryId = String(indexEntry.id);
            const entryGridData = allGridData.filter(row => String(row[idColName]) === entryId);
            const entryAntibiotics = antibioticsData.filter(row => String(row[idColName]) === entryId);
            const entryTemperatures = temperaturesData.filter(row => String(row[idColName]) === entryId);
            const entryBacteria = bacteriaData.filter(row => String(row[idColName]) === entryId);
            const entryIncubation = incubationData.filter(row => String(row[idColName]) === entryId);
            const entryPrep = prepData.filter(row => String(row[idColName]) === entryId);

            const plateIds = [...new Set(entryGridData.map(row => row.plate_id))].sort((a, b) => Number(a) - Number(b));

            const plates: ParsedPlateData[] = plateIds.map(plateId => {
                const plateGridRows = entryGridData.filter(row => String(row.plate_id) === String(plateId));
                const plateData = generatePlateData(8, 6);

                plateGridRows.forEach(row => {
                    const isPlate1 = String(plateId) === '1';
                    const startCol = isPlate1 ? 1 : 7;
                    const endCol = isPlate1 ? 6 : 12;
                    for(let i = startCol; i <= endCol; i++) {
                        const wellColIndex = i - (isPlate1 ? 0 : 6);
                        const wellIdInGrid = `${row.Row}${wellColIndex}`;
                        const cellVal = row[`C${i}`];
                        if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
                            if (plateData[wellIdInGrid]) {
                                plateData[wellIdInGrid].content = String(cellVal).trim();
                            }
                        }
                    }
                });

                // Helper to map absolute database well IDs to relative grid IDs
                const mapWellId = (dbWellId: string) => {
                    // dbWellId might be "A1", "A7" etc.
                    const row = dbWellId.charAt(0);
                    const col = parseInt(dbWellId.substring(1));
                    const isPlate1 = String(plateId) === '1';
                    if (isPlate1 && col <= 6) return dbWellId;
                    if (!isPlate1 && col > 6) return `${row}${col - 6}`;
                    return null;
                };

                entryAntibiotics.filter(p => String(p.plate_id) === String(plateId)).forEach(p => {
                    const key = mapWellId(p.well_id);
                    if (key && plateData[key]) plateData[key].params.antibiotic = p.value;
                });
                entryTemperatures.filter(p => String(p.plate_id) === String(plateId)).forEach(p => {
                    const key = mapWellId(p.well_id);
                    if (key && plateData[key]) plateData[key].params.temperature = p.value;
                });
                entryBacteria.filter(p => String(p.plate_id) === String(plateId)).forEach(p => {
                    const key = mapWellId(p.well_id);
                    if (key && plateData[key]) plateData[key].params.bacteria = p.value;
                });
                entryIncubation.filter(p => String(p.plate_id) === String(plateId)).forEach(p => {
                    const key = mapWellId(p.well_id);
                    if (key && plateData[key]) plateData[key].params.incubationTime = p.value;
                });
                entryPrep.filter(p => String(p.plate_id) === String(plateId)).forEach(p => {
                    const key = mapWellId(p.well_id);
                    if (key && plateData[key]) plateData[key].params.prep = p.value;
                });

                return {
                    plateId: String(plateId),
                    data: plateData,
                };
            });

            return {
                code: indexEntry.name,
                id: indexEntry.id,
                plates,
            };
        }).filter((entry): entry is GroupedLogData => entry !== null);

            setGroupedData(grouped);
        } catch (error) {
            console.error("Failed to parse DNA Extraction DuckDB data:", error);
            setGroupedData(null);
        }
    } else if (db && db.buffer) {
      try {
        const workbook = xlsx.read(db.buffer, { type: 'buffer' });
        const requiredSheets = ['Index', 'Data'];
        if (requiredSheets.some(s => !workbook.Sheets[s])) {
            setGroupedData(null);
            setIsLoading(false);
            return;
        }

        const indexData = xlsx.utils.sheet_to_json<{ name: string; id: number }>(workbook.Sheets['Index']);
        if (indexData.length === 0) {
            setGroupedData([]);
            setIsLoading(false);
            return;
        }

        const allGridData = xlsx.utils.sheet_to_json<any>(workbook.Sheets['Data']);
        const idColName = 'dna_extraction_id';
        
        const antibioticsData = workbook.Sheets['Antibiotic'] ? xlsx.utils.sheet_to_json<any>(workbook.Sheets['Antibiotic']) : [];
        const temperaturesData = workbook.Sheets['Temperature'] ? xlsx.utils.sheet_to_json<any>(workbook.Sheets['Temperature']) : [];
        const bacteriaData = workbook.Sheets['Bacteria'] ? xlsx.utils.sheet_to_json<any>(workbook.Sheets['Bacteria']) : [];
        const incubationData = workbook.Sheets['Incubation'] ? xlsx.utils.sheet_to_json<any>(workbook.Sheets['Incubation']) : [];
        const prepData = workbook.Sheets['Prep'] ? xlsx.utils.sheet_to_json<any>(workbook.Sheets['Prep']) : [];

        const grouped = indexData.map(indexEntry => {
            if (indexEntry.id == null || indexEntry.name == null) {
              return null;
            }
            const entryId = String(indexEntry.id);
            const entryGridData = allGridData.filter(row => String(row[idColName]) === entryId);
            const entryAntibiotics = antibioticsData.filter(row => String(row[idColName]) === entryId);
            const entryTemperatures = temperaturesData.filter(row => String(row[idColName]) === entryId);
            const entryBacteria = bacteriaData.filter(row => String(row[idColName]) === entryId);
            const entryIncubation = incubationData.filter(row => String(row[idColName]) === entryId);
            const entryPrep = prepData.filter(row => String(row[idColName]) === entryId);
            
            const plateIds = [...new Set(entryGridData.map(row => row.plate_id))].sort((a, b) => Number(a) - Number(b));

            const plates: ParsedPlateData[] = plateIds.map(plateId => {
                const plateGridRows = entryGridData.filter(row => String(row.plate_id) === String(plateId));
                const plateData = generatePlateData(8, 6); 
                
                plateGridRows.forEach(row => {
                    const isPlate1 = String(plateId) === '1';
                    const startCol = isPlate1 ? 1 : 7;
                    const endCol = isPlate1 ? 6 : 12;
                    for(let i = startCol; i <= endCol; i++) {
                        const wellColIndex = i - (isPlate1 ? 0 : 6);
                        const wellIdInGrid = `${row.Row}${wellColIndex}`;
                        const cellVal = row[`C${i}`];
                        if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
                            if (plateData[wellIdInGrid]) {
                                plateData[wellIdInGrid].content = String(cellVal).trim();
                            }
                        }
                    }
                });

                // Helper to map absolute database well IDs to relative grid IDs
                const mapWellId = (dbWellId: string) => {
                    // dbWellId might be "A1", "A7" etc.
                    const row = dbWellId.charAt(0);
                    const col = parseInt(dbWellId.substring(1));
                    const isPlate1 = String(plateId) === '1';
                    if (isPlate1 && col <= 6) return dbWellId;
                    if (!isPlate1 && col > 6) return `${row}${col - 6}`;
                    return null;
                };

                entryAntibiotics.filter(p => String(p.plate_id) === String(plateId)).forEach(p => {
                    const key = mapWellId(p.well_id);
                    if (key && plateData[key]) plateData[key].params.antibiotic = p.value;
                });
                entryTemperatures.filter(p => String(p.plate_id) === String(plateId)).forEach(p => {
                    const key = mapWellId(p.well_id);
                    if (key && plateData[key]) plateData[key].params.temperature = p.value;
                });
                entryBacteria.filter(p => String(p.plate_id) === String(plateId)).forEach(p => {
                    const key = mapWellId(p.well_id);
                    if (key && plateData[key]) plateData[key].params.bacteria = p.value;
                });
                entryIncubation.filter(p => String(p.plate_id) === String(plateId)).forEach(p => {
                    const key = mapWellId(p.well_id);
                    if (key && plateData[key]) plateData[key].params.incubationTime = p.value;
                });
                prepData.filter(p => String(p.plate_id) === String(plateId)).forEach(p => {
                    const key = mapWellId(p.well_id);
                    if (key && plateData[key]) plateData[key].params.prep = p.value;
                });
                
                return {
                    plateId: String(plateId),
                    data: plateData,
                };
            });

            return {
                code: indexEntry.name,
                id: indexEntry.id,
                plates,
            };
        }).filter((entry): entry is GroupedLogData => entry !== null);

        setGroupedData(grouped);
      } catch (error) {
        console.error("Failed to parse DNA Extraction DB:", error);
        setGroupedData(null);
      }
    } else {
      setGroupedData(null);
    }
    setIsLoading(false);
  }, [databases]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <p>Loading database...</p>
      </div>
    );
  }

  if (!groupedData || groupedData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <Card className="w-full max-w-md">
            <CardHeader>
                <div className="flex justify-center mb-4">
                    <Dna className="w-12 h-12 text-primary" />
                </div>
                <CardTitle>DNA Extraction Log</CardTitle>
                <CardDescription>No DNA Extraction data found.</CardDescription>
            </CardHeader>
             <CardContent>
                <p className="text-muted-foreground">
                    Please upload a file using the Log Uploader tool to see your entries here.
                </p>
            </CardContent>
        </Card>
    </div>
    );
  }
  
  const startIndex = groupedData.length > 0 ? groupedData.length - 1 : 0;
  
  return (
    <div className="w-full flex justify-center p-4">
      <div className="relative w-full max-w-5xl px-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <LogSearchCombobox
            items={groupedData.map((g, i) => ({ label: g.code, index: i }))}
            currentIndex={currentIndex}
            onSelect={(index) => api?.scrollTo(index)}
            placeholder="Search extraction entries..."
          />
          <ExportLogButton logType="DNA Extraction" />
        </div>
        <Carousel className="w-full" setApi={setApi} opts={{ align: "start", loop: false, startIndex }}>
          <CarouselContent className="-ml-4">
            {groupedData.map((entry) => (
              <CarouselItem key={entry.id} className="pl-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <GitBranch className="w-7 h-7" /> {entry.code}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-8 flex flex-col items-center">
                     {entry.plates.map(plate => {
                       const colOffset = String(plate.plateId) === '1' ? 0 : 6;
                       const platePrefix = String(plate.plateId) === '1' ? 'p1' : 'p2';
                       return (
                         <div key={plate.plateId} className="w-full">
                           <Card className="w-full">
                               <CardHeader>
                                   <CardTitle className="flex items-center gap-2"><Dna className="w-6 h-6"/> Extraction Plate {plate.plateId}</CardTitle>
                               </CardHeader>
                               <CardContent className="space-y-4">
                                   <div className="rounded-md border">
                                       <DnaExtractionGrid 
                                           plateData={plate.data}
                                           platePrefix={platePrefix}
                                           colOffset={colOffset}
                                       />
                                   </div>
                                   <DnaExtractionLegend plateData={plate.data} />
                               </CardContent>
                           </Card>
                         </div>
                       );
                     })}
                  </CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious variant="default" className="h-10 w-10 -left-4" />
          <CarouselNext variant="default" className="h-10 w-10 -right-4" />
        </Carousel>
      </div>
    </div>
  );
}
