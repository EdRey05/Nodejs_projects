'use client';

import { useState, useEffect } from 'react';
import { useDatabase } from '../../_context/DatabaseContext';
import { useAppContext } from '../../_context/AppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel';
import { Dna, GitBranch } from 'lucide-react';
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
  const { updateContext } = useAppContext();
  const [groupedData, setGroupedData] = useState<GroupedLogData[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [api, setApi] = useState<CarouselApi>();

  useEffect(() => {
    const db = databases['DNA Extraction'];
    if (db && db.buffer) {
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

        const grouped = indexData.map(indexEntry => {
            if (indexEntry.id == null || indexEntry.name == null) {
              return null;
            }
            const entryId = String(indexEntry.id);
            const entryGridData = allGridData.filter(row => String(row[idColName]) === entryId);
            const entryAntibiotics = antibioticsData.filter(row => String(row[idColName]) === entryId);
            const entryTemperatures = temperaturesData.filter(row => String(row[idColName]) === entryId);
            
            const plateIds = [...new Set(entryGridData.map(row => row.plate_id))].sort();

            const plates: ParsedPlateData[] = plateIds.map(plateId => {
                const plateGridRows = entryGridData.filter(row => row.plate_id === plateId);
                const plateData = generatePlateData(8, 12); // Start with a 12-well structure for easier mapping
                
                plateGridRows.forEach(row => {
                    for(let i=1; i<=12; i++) {
                        const wellId = `${row.Row}${i}`;
                        if (row[`C${i}`] !== undefined) {
                            plateData[wellId].content = row[`C${i}`];
                        }
                    }
                });

                entryAntibiotics.filter(p => p.plate_id === plateId).forEach(p => {
                    if (plateData[p.well_id]) plateData[p.well_id].params.antibiotic = p.value;
                });
                entryTemperatures.filter(p => p.plate_id === plateId).forEach(p => {
                    if (plateData[p.well_id]) plateData[p.well_id].params.temperature = p.value;
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

  useEffect(() => {
    if (!api) return;

    const updateCarouselContext = () => {
        if (!groupedData || groupedData.length === 0) {
            updateContext(JSON.stringify({ page: "DNA Extraction Log", status: "No data loaded." }, null, 2));
            return;
        }
        
        const currentSnap = api.selectedScrollSnap();
        const currentGroup = groupedData[currentSnap];
        if (!currentGroup) return;

        const context = {
            page: "DNA Extraction Log",
            totalEntries: groupedData.length,
            viewingEntry: `${currentSnap + 1} of ${groupedData.length}`,
            currentEntryDetails: {
                code: currentGroup.code,
                plateCount: currentGroup.plates.length,
            }
        };
        updateContext(JSON.stringify(context, null, 2));
    }
    
    updateCarouselContext();
    api.on("select", updateCarouselContext);
    return () => { api.off("select", updateCarouselContext) };
  }, [api, groupedData, updateContext]);

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
        <Carousel className="w-full" setApi={setApi} opts={{ align: "start", loop: false, startIndex }}>
          <CarouselContent className="-ml-4">
            {groupedData.map((entry) => (
              <CarouselItem key={entry.id} className="pl-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <GitBranch className="w-7 h-7" /> {entry.code}
                    </CardTitle>
                    <CardDescription>
                      Displaying results for {entry.plates.length} plate(s) in this entry.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-8 flex flex-col items-center">
                     {entry.plates.map(plate => {
                       const colOffset = plate.plateId === '1' ? 0 : 6;
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
