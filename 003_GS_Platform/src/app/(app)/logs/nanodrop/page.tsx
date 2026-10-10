'use client';

import { useState, useEffect } from 'react';
import { useDatabase } from '../../_context/DatabaseContext';
import { useAppContext } from '../../_context/AppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel';
import { Hash, FlaskConical } from 'lucide-react';
import { LogSearchCombobox } from '@/components/ui/log-search-combobox';

type NanodropEntry = {
  code: string;
  id: number;
  extractionEntry: string;
  data: any[];
}

export default function NanodropLogPage() {
  const { databases } = useDatabase();
  const { updateContext } = useAppContext();
  const [entries, setEntries] = useState<NanodropEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [api, setApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const db = databases['Nanodrop'];
    if (db && db.payload) {
      try {
        const payload = db.payload;
        const indexData = payload.index as any[];
        const allData = payload.data as any[];

        if (!indexData || indexData.length === 0) {
          setEntries([]);
          setIsLoading(false);
          return;
        }

        const grouped: NanodropEntry[] = indexData.map((entry) => {
          const entryRows = (allData || [])
            .filter((row: any) => String(row.nanodrop_id) === String(entry.id))
            .sort((a: any, b: any) => a.row_number - b.row_number);

          return {
            code: entry.name,
            id: entry.id,
            extractionEntry: entry.extraction_entry || '',
            data: entryRows,
          };
        });

        setEntries(grouped);
      } catch (error) {
        console.error("Failed to parse Nanodrop data:", error);
        setEntries(null);
      }
    } else {
      setEntries(null);
    }
    setIsLoading(false);
  }, [databases]);

  useEffect(() => {
    if (!api || !entries) return;

    const updateCarouselContext = () => {
      const currentSnap = api.selectedScrollSnap();
      setCurrentIndex(currentSnap);
      const currentEntry = entries[currentSnap];
      if (!currentEntry) return;

      const context = {
        page: "Nanodrop Log",
        totalEntries: entries.length,
        viewingEntry: `${currentSnap + 1} of ${entries.length}`,
        currentEntryDetails: {
          code: currentEntry.code,
          extractionEntry: currentEntry.extractionEntry,
          rowCount: currentEntry.data.length,
        }
      };
      updateContext(JSON.stringify(context, null, 2));
    };

    updateCarouselContext();
    api.on("select", updateCarouselContext);
    return () => { api.off("select", updateCarouselContext) };
  }, [api, entries, updateContext]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <p>Loading database...</p>
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <FlaskConical className="w-12 h-12 text-primary" />
            </div>
            <CardTitle>Nanodrop Log</CardTitle>
            <CardDescription>No nanodrop data found.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Please upload a CSV file using the Log Uploader to see your entries here.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const startIndex = entries.length > 0 ? entries.length - 1 : 0;

  return (
    <div className="w-full flex justify-center p-4">
      <div className="relative w-full max-w-5xl px-12">
        <div className="flex justify-center mb-4">
          <LogSearchCombobox
            items={entries.map((e, i) => ({ label: e.code, index: i }))}
            currentIndex={currentIndex}
            onSelect={(index) => api?.scrollTo(index)}
            placeholder="Search nanodrop entries..."
          />
        </div>
        <Carousel className="w-full" setApi={setApi} opts={{ align: "start", loop: false, startIndex }}>
          <CarouselContent className="-ml-4">
            {entries.map((entry) => (
              <CarouselItem key={entry.id} className="pl-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl">
                      <FlaskConical className="w-7 h-7" /> {entry.code}
                    </CardTitle>
                    <CardDescription>
                      {entry.extractionEntry
                        ? `Linked extraction: ${entry.extractionEntry}`
                        : 'No extraction entry linked'}
                      {' · '}{entry.data.length} samples
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="relative w-full overflow-auto rounded-md border max-h-[600px]">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                          <TableRow>
                            <TableHead className="whitespace-nowrap">Row #</TableHead>
                            <TableHead className="whitespace-nowrap">Concentration (ng/µL)</TableHead>
                            <TableHead className="whitespace-nowrap">A260/A280</TableHead>
                            <TableHead className="whitespace-nowrap">A260/A230</TableHead>
                            <TableHead className="whitespace-nowrap">A260</TableHead>
                            <TableHead className="whitespace-nowrap">A280</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entry.data.map((row: any) => {
                            const a260a280 = row.a260_a280;
                            const purityOk = a260a280 !== null && a260a280 >= 1.7 && a260a280 <= 2.0;
                            return (
                              <TableRow key={row.row_number} className={a260a280 !== null && !purityOk ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}>
                                <TableCell>{row.row_number}</TableCell>
                                <TableCell>{typeof row.concentration_ng_ul === 'number' ? row.concentration_ng_ul.toFixed(3) : ''}</TableCell>
                                <TableCell className={a260a280 !== null && !purityOk ? 'text-yellow-700 dark:text-yellow-400 font-medium' : ''}>
                                  {typeof a260a280 === 'number' ? a260a280.toFixed(3) : ''}
                                </TableCell>
                                <TableCell>{typeof row.a260_a230 === 'number' ? row.a260_a230.toFixed(3) : ''}</TableCell>
                                <TableCell>{typeof row.a260 === 'number' ? row.a260.toFixed(3) : ''}</TableCell>
                                <TableCell>{typeof row.a280 === 'number' ? row.a280.toFixed(3) : ''}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
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
