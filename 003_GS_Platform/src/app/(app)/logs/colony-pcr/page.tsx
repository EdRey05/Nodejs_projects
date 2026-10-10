'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { useDatabase } from '../../_context/DatabaseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Microscope, Dna, ImageUp, GitBranch, X } from 'lucide-react';
import type { PlateData, WellData } from '@/lib/types';
import { ColonyPcrGrid } from '../uploader/_components/colony-pcr-grid';
import { Button } from '@/components/ui/button';
import { LogSearchCombobox } from '@/components/ui/log-search-combobox';
import { ExportLogButton } from '@/components/export-log-button';
import { useCarouselArrows } from '@/hooks/use-carousel-arrows';

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

// Stable no-op for read-only grids — avoids re-renders from new function refs
const NOOP = () => {};

export default function ColonyPcrLogPage() {
  const { databases } = useDatabase();
  const [isLoading, setIsLoading] = useState(true);
  const [api, setApi] = useState<CarouselApi>();
  useCarouselArrows(api);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Memoize the heavy data transformation so it only runs when databases change
  const groupedData = useMemo<GroupedLogData[] | null>(() => {
    const db = databases['Colony PCR'];
    if (!db || !db.payload) return null;

    try {
      const payload = db.payload;
      const indexData = payload.index as { name: string; id: number }[];
      const allGridData = payload.data as any[];
      const allSamplesData = payload.samples as any[];
      const allPositivesData = payload.positives as any[];
      const idColName = 'colony_pcr_id';

      if (!indexData || indexData.length === 0) return [];

      return indexData.map(indexEntry => {
        if (indexEntry.id == null || indexEntry.name == null) return null;

        const entryGridData = allGridData.filter(row => String(row[idColName]) === String(indexEntry.id));
        const entrySamplesData = allSamplesData.filter(row => String(row[idColName]) === String(indexEntry.id));
        const entryPositivesData = allPositivesData.filter(row => String(row[idColName]) === String(indexEntry.id));
        const plateIds = [...new Set(entryGridData.map(row => row.plate_id))];

        const plates: ParsedPlateData[] = plateIds.map(plateId => {
          const plateGridRows = entryGridData.filter(row => row.plate_id === plateId);
          const plateData: PlateData = {};
          const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

          plateGridRows.forEach(row => {
            const rowIndex = rowLabels.indexOf(row.Row);
            if (rowIndex !== -1) {
              for (let i = 1; i <= 12; i++) {
                const colKey = `C${i}`;
                const wellId = `${row.Row}${i}`;
                if (!plateData[wellId]) {
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

          const positiveWells = new Set<string>(
            entryPositivesData.filter(row => row.plate_id === plateId).map(row => row.well)
          );

          const samplesData = entrySamplesData.filter(row => row.plate_id === plateId);
          const samplesHeaders = samplesData.length > 0
            ? Object.keys(samplesData[0]).filter(h => h !== idColName && h !== 'plate_id')
            : [];

          const imageKey = `${indexEntry.name}_P${plateId}`;
          const images = db.images?.[imageKey] || [];

          return { plateId: String(plateId), gridData: plateData, positiveWells, samplesData, samplesHeaders, images };
        });

        return { code: indexEntry.name, id: indexEntry.id, plates };
      }).filter((entry): entry is GroupedLogData => entry !== null);
    } catch (error) {
      console.error("Failed to parse Colony PCR DuckDB data:", error);
      return null;
    }
  }, [databases]);

  useEffect(() => {
    setIsLoading(false);
  }, [groupedData]);

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
    <div className="w-full flex justify-center p-4">
      <Dialog open={!!selectedImage} onOpenChange={(isOpen) => !isOpen && setSelectedImage(null)}>
        <DialogContent className="max-w-4xl p-0">
           <DialogHeader className="p-2">
             <DialogTitle className="sr-only">Enlarged Result Image</DialogTitle>
           </DialogHeader>
           {selectedImage && <Image src={selectedImage} alt="Enlarged result" width={1000} height={1000} className="w-full h-auto rounded-md" />}
           <Button variant="ghost" size="icon" className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white" onClick={() => setSelectedImage(null)}><X className="h-5 w-5" /></Button>
        </DialogContent>
      </Dialog>
      <div className="relative w-full max-w-5xl px-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <LogSearchCombobox
            items={groupedData.map((g, i) => ({ label: g.code, index: i }))}
            currentIndex={currentIndex}
            onSelect={(index) => api?.scrollTo(index)}
            placeholder="Search colony PCR entries..."
          />
          <ExportLogButton logType="Colony PCR" />
        </div>
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
                                   <h3 className="text-lg font-semibold mb-2 text-center">Plate Map</h3>
                                   <div className="rounded-md border">
                                       <ColonyPcrGrid
                                           plateData={plate.gridData}
                                           positiveWells={plate.positiveWells}
                                           onTogglePositive={NOOP}
                                       />
                                   </div>
                               </div>

                               <div className="grid md:grid-cols-10 gap-6">
                                  <div className="md:col-span-7">
                                      <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><Dna className="w-5 h-5"/>Samples</h3>
                                      <div className="relative w-full overflow-auto rounded-md border">
                                          {plate.samplesData.length > 0 ? (
                                              <Table>
                                                  <TableHeader className="sticky top-0 z-10">
                                                      <TableRow className="bg-sidebar-accent hover:bg-sidebar-accent">
                                                          {plate.samplesHeaders.map((header: string) => <TableHead key={header} className="whitespace-nowrap text-sidebar-foreground">{header}</TableHead>)}
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
          <CarouselPrevious variant="default" className="h-10 w-10 -left-4" />
          <CarouselNext variant="default" className="h-10 w-10 -right-4" />
        </Carousel>
      </div>
    </div>
  );
}
