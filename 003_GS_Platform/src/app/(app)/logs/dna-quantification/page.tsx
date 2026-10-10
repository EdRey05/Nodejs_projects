'use client';

import { useState, useEffect } from 'react';
import { useDatabase } from '../../_context/DatabaseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel';
import { Hash, GitBranch } from 'lucide-react';
import { LogSearchCombobox } from '@/components/ui/log-search-combobox';
import { ExportLogButton } from '@/components/export-log-button';
import { useCarouselArrows } from '@/hooks/use-carousel-arrows';
import * as xlsx from 'xlsx';

type GroupedQuantData = {
  code: string;
  id: number;
  source: string;
  sourceDetails: string;
  headers: string[];
  data: any[];
}

export default function DnaQuantificationLogPage() {
  const { databases } = useDatabase();
  const [groupedData, setGroupedData] = useState<GroupedQuantData[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [api, setApi] = useState<CarouselApi>();
  useCarouselArrows(api);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const db = databases['DNA Quantification'];
    if (db && db.payload) {
        try {
            const payload = db.payload;
            const indexData = payload.index as any[];
            const grouped: GroupedQuantData[] = [];

            if (!indexData || indexData.length === 0) {
                setGroupedData([]);
                setIsLoading(false);
                return;
            }

            for (const entry of indexData) {
                const entryId = entry.id;
                const modeKey = entry.source === 'Extraction Plate' ? 'extraction_plate' :
                             entry.source === 'Fragments' ? 'fragments' :
                             entry.source === 'Nanodrop CSV' ? 'nanodrop' : 'other';

                const modeData = payload[modeKey];
                if (!modeData) continue;

                const entryRows = modeData.filter((row: any) => String(row.quantification_id) === String(entryId));

                if (entryRows.length > 0) {
                    const headers = Object.keys(entryRows[0]).filter(h => h !== 'quantification_id');
                    grouped.push({
                        code: entry.name,
                        id: entryId,
                        source: entry.source,
                        sourceDetails: entry.source_details,
                        headers,
                        data: entryRows
                    });
                }
            }
            setGroupedData(grouped);
        } catch (error) {
            console.error("Failed to parse DNA Quantification DuckDB data:", error);
            setGroupedData(null);
        }
    } else if (db && db.buffer) {
      try {
        const workbook = xlsx.read(db.buffer, { type: 'buffer' });
        const indexSheet = workbook.Sheets['Index'];
        if (!indexSheet) {
          setGroupedData([]);
          setIsLoading(false);
          return;
        }

        const indexData = xlsx.utils.sheet_to_json<any>(indexSheet);
        const grouped: GroupedQuantData[] = [];

        for (const entry of indexData) {
            const entryId = entry.id;
            const mode = entry.source === 'Extraction Plate' ? 'ExtractionPlate' :
                         entry.source === 'Fragments' ? 'Fragments' :
                         entry.source === 'Nanodrop CSV' ? 'Nanodrop' : 'Other';
            
            const modeSheet = workbook.Sheets[mode];
            if (!modeSheet) continue;

            const allData = xlsx.utils.sheet_to_json<any>(modeSheet);
            const entryRows = allData.filter(row => String(row.quantification_id) === String(entryId));
            
            if (entryRows.length > 0) {
                const headers = Object.keys(entryRows[0]).filter(h => h !== 'quantification_id');
                grouped.push({
                    code: entry.name,
                    id: entryId,
                    source: entry.source,
                    sourceDetails: entry.source_details,
                    headers,
                    data: entryRows
                });
            }
        }

        setGroupedData(grouped);
      } catch (error) {
        console.error("Failed to parse DNA Quantification DB:", error);
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
                    <Hash className="w-12 h-12 text-primary" />
                </div>
                <CardTitle>DNA Quantification Log</CardTitle>
                <CardDescription>No quantification data found.</CardDescription>
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
            placeholder="Search quantification entries..."
          />
          <ExportLogButton logType="DNA Quantification" />
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
                    <CardDescription>
                      Source: {entry.source}
                      {entry.source === 'Extraction Plate' && ` - ${JSON.parse(entry.sourceDetails).extractionEntry}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                      <div className="relative w-full overflow-auto rounded-md border max-h-[600px]">
                        <Table>
                            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                                <TableRow>
                                    {entry.headers.map((h, i) => (
                                        <TableHead key={i} className="whitespace-nowrap">{h}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {entry.data.map((row, i) => (
                                    <TableRow key={i}>
                                        {entry.headers.map((h, j) => (
                                            <TableCell key={j} className="whitespace-nowrap">{row[h]}</TableCell>
                                        ))}
                                    </TableRow>
                                ))}
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
