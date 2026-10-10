'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useDatabase } from '../../_context/DatabaseContext';
import { useAppContext } from '../../_context/AppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Microscope, Dna, ImageUp, GitBranch, X } from 'lucide-react';
import * as xlsx from 'xlsx';
import type { PlateData, WellData } from '@/lib/types';
import { ColonyPcrGrid } from '../log-uploader/_components/colony-pcr-grid';
import { Button } from '@/components/ui/button';

type ParsedPlateData = {
  plateId: string;
  gridData: PlateData;
  positiveWells: Set<string>;
  samplesData: any[];
  samplesHeaders: string[];
  images: string[];
};

type GroupedLogData = {
  code: string;
  id: number;
  plates: ParsedPlateData[];
};

export default function ColonyPcrLogPage() {
  const { databases } = useDatabase();
  const { updateContext } = useAppContext();
  const [groupedData, setGroupedData] = useState<GroupedLogData[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [api, setApi] = useState<CarouselApi>();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);


  useEffect(() => {
    const db = databases['Colony PCR'];
    if (db && db.buffer) {
      try {
        const workbook = xlsx.read(db.buffer, { type: 'buffer' });
        const requiredSheets = ['Index', 'Data', 'Samples', 'Positives'];
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
        const allSamplesData = xlsx.utils.sheet_to_json<any>(workbook.Sheets['Samples']);
        const allPositivesData = xlsx.utils.sheet_to_json<any>(workbook.Sheets['Positives']);
        const idColName = 'colony_pcr_id';

        const grouped = indexData.map(indexEntry => {
            if (indexEntry.id == null || indexEntry.name == null) {
              return null;
            }
            const entryGridData = allGridData.filter(row => String(row[idColName]) === String(indexEntry.id));
            const entrySamplesData = allSamplesData.filter(row => String(row[idColName]) === String(indexEntry.id));
            const entryPositivesData = allPositivesData.filter(row => String(row[idColName]) === String(indexEntry.id));
            
            const plateIds = [...new Set(entryGridData.map(row => row.plate_id))];

            const plates: ParsedPlateData[] = plateIds.map(plateId => {
                // 1. Grid Data
                const plateGridRows = entryGridData.filter(row => row.plate_id === plateId);
                const plateData: PlateData = {};
                const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
                plateGridRows.forEach(row => {
                    const rowIndex = rowLabels.indexOf(row.Row);
                    if (rowIndex !== -1) {
                         for (let i = 1; i <= 12; i++) {
                            const colKey = `C${i}`;
                            const wellId = `${row.Row}${i}`;
                            if(!plateData[wellId]) {
                                plateData[wellId] = {
                                    id: wellId,
                                    sample: null,
                                    params: {},
                                    content: row[colKey] || ''
                                };
                            }
                        }
                    }
                });

                // 2. Positives Data
                const positiveWells = new Set<string>(
                    entryPositivesData.filter(row => row.plate_id === plateId).map(row => row.well)
                );

                // 3. Samples Data
                const samplesData = entrySamplesData.filter(row => row.plate_id === plateId);
                const samplesHeaders = samplesData.length > 0 ? Object.keys(samplesData[0]).filter(h => h !== idColName && h !== 'plate_id') : [];

                // 4. Images
                const imageKey = `${indexEntry.name}_${plateId}`;
                const images = db.images?.[imageKey] || [];
                
                return {
                    plateId: String(plateId),
                    gridData: plateData,
                    positiveWells,
                    samplesData,
                    samplesHeaders,
                    images,
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
        console.error("Failed to parse Colony PCR DB:", error);
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
            updateContext(JSON.stringify({ page: "Colony PCR Log", status: "No data loaded." }, null, 2));
            return;
        }
        
        const currentSnap = api.selectedScrollSnap();
        const totalSnaps = api.scrollSnapList().length;
        const currentGroup = groupedData[currentSnap];
        
        if (!currentGroup) return;

        const context = {
            page: "Colony PCR Log",
            totalEntries: totalSnaps,
            viewingEntry: `${currentSnap + 1} of ${totalSnaps}`,
            currentEntryDetails: {
                code: currentGroup.code,
                plateCount: currentGroup.plates.length,
                plates: currentGroup.plates.map(p => ({
                    plateId: p.plateId,
                    positiveCount: p.positiveWells.size,
                    sampleCount: p.samplesData.length,
                    imageCount: p.images.length,
                }))
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
                    <Microscope className="w-12 h-12 text-primary" />
                </div>
                <CardTitle>Colony PCR Log</CardTitle>
                <CardDescription>No Colony PCR data found.</CardDescription>
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
    <div className="w-full flex justify-center p-4 md:px-20">
      <Dialog open={!!selectedImage} onOpenChange={(isOpen) => !isOpen && setSelectedImage(null)}>
        <DialogContent className="max-w-4xl p-0">
           <DialogHeader className="p-2">
             <DialogTitle className="sr-only">Enlarged Result Image</DialogTitle>
           </DialogHeader>
           {selectedImage && <Image src={selectedImage} alt="Enlarged result" width={1000} height={1000} className="w-full h-auto rounded-md" />}
           <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white" onClick={() => setSelectedImage(null)}><X className="h-5 w-5" /></Button>
        </DialogContent>
      </Dialog>
      <div className="relative w-full max-w-[82rem]">
        <Carousel className="w-full" setApi={setApi} opts={{ align: "start", loop: false, startIndex }}>
          <CarouselContent className="-ml-4">
            {groupedData.map((entry) => (
              <CarouselItem key={entry.id} className="pl-4">
                <Card className="min-h-[60rem]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <GitBranch className="w-7 h-7" /> {entry.code}
                    </CardTitle>
                    <CardDescription>
                      Displaying results for {entry.plates.length} plate(s) in this entry.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-8">
                     {entry.plates.map(plate => (
                       <Card key={plate.plateId} className="overflow-hidden">
                           <CardHeader>
                               <CardTitle className="flex items-center gap-2"><Microscope className="w-6 h-6"/> Plate {plate.plateId}</CardTitle>
                               <CardDescription>Found {plate.positiveWells.size} positive wells, {plate.samplesData.length} samples, and {plate.images.length} images.</CardDescription>
                           </CardHeader>
                           <CardContent className="space-y-6">
                               <div className='max-w-4xl mx-auto'>
                                   <h3 className="text-lg font-semibold mb-2">Plate Map (Read-only)</h3>
                                   <div className="rounded-md border">
                                       <ColonyPcrGrid 
                                           plateData={plate.gridData}
                                           positiveWells={plate.positiveWells}
                                           onTogglePositive={() => {}} // Read-only
                                       />
                                   </div>
                               </div>

                               <div className="grid md:grid-cols-10 gap-6">
                                  <div className="md:col-span-7">
                                      <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><Dna className="w-5 h-5"/>Samples</h3>
                                      <div className="relative w-full overflow-auto rounded-md border">
                                          {plate.samplesData.length > 0 ? (
                                              <Table>
                                                  <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                                                      <TableRow>
                                                          {plate.samplesHeaders.map((header: string) => <TableHead key={header}>{header}</TableHead>)}
                                                      </TableRow>
                                                  </TableHeader>
                                                  <TableBody>
                                                      {plate.samplesData.map((row: any, rowIndex: number) => (
                                                          <TableRow key={rowIndex}>
                                                              {plate.samplesHeaders.map((header: string) => <TableCell key={`${rowIndex}-${header}`}>{row[header]}</TableCell>)}
                                                          </TableRow>
                                                      ))}
                                                  </TableBody>
                                              </Table>
                                          ) : (
                                              <div className="flex items-center justify-center h-full text-muted-foreground">No sample data found.</div>
                                          )}
                                      </div>
                                  </div>
                                  <div className="md:col-span-3">
                                      <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><ImageUp className="w-5 h-5"/>Result Image(s)</h3>
                                      {plate.images.length > 0 ? (
                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                                          {plate.images.map((imgSrc, index) => (
                                            <div key={index} className="relative aspect-square cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setSelectedImage(imgSrc)}>
                                                <Image src={imgSrc} alt={`Result ${index + 1} for plate ${plate.plateId}`} fill style={{ objectFit: 'cover' }} className="rounded-md" />
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="flex flex-col items-center justify-center h-40 w-full rounded-md border-2 border-dashed">
                                            <ImageUp className="w-8 h-8 text-muted-foreground mb-2"/>
                                            <p className="text-sm text-muted-foreground">No images uploaded.</p>
                                        </div>
                                      )}
                                  </div>
                               </div>
                           </CardContent>
                       </Card>
                     ))}
                  </CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious variant="default" className="h-10 w-10 -left-16" />
          <CarouselNext variant="default" className="h-10 w-10 -right-16" />
        </Carousel>
      </div>
    </div>
  );
}
