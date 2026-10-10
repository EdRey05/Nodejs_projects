'use client';

import { useState, useEffect } from 'react';
import { useDatabase } from '../../_context/DatabaseContext';
import { useAppContext } from '../../_context/AppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel';
import { GitBranch } from 'lucide-react';
import * as xlsx from 'xlsx';

type GroupedLogData = {
  code: string;
  headers: string[];
  data: any[];
}

export default function LigationLogPage() {
  const { databases } = useDatabase();
  const { updateContext } = useAppContext();
  const [groupedData, setGroupedData] = useState<GroupedLogData[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [api, setApi] = useState<CarouselApi>();

  useEffect(() => {
    const db = databases['Ligation'];
    if (db && db.buffer) {
      try {
        const workbook = xlsx.read(db.buffer, { type: 'buffer' });
        const indexSheet = workbook.Sheets['Index'];
        const dataSheet = workbook.Sheets['Data'];
        
        if (!indexSheet || !dataSheet) {
          setGroupedData(null);
          setIsLoading(false);
          return;
        }

        const indexData = xlsx.utils.sheet_to_json<{ name: string; id: number }>(indexSheet);
        const allData = xlsx.utils.sheet_to_json<any>(dataSheet, { defval: "" });
        
        if (indexData.length === 0 || allData.length === 0) {
            setGroupedData([]);
            setIsLoading(false);
            return;
        }

        const idColName = `ligation_id`;

        const grouped = indexData.map(indexEntry => {
            const entryData = allData.filter(row => {
              const dataId = row[idColName];
              const indexId = indexEntry.id;
              return dataId !== undefined && dataId !== null && String(dataId) === String(indexId);
            });

            if (entryData.length === 0) return null;
            
            const headers = Object.keys(entryData[0]).filter(h => h !== idColName);
            
            return {
                code: indexEntry.name,
                headers: headers,
                data: entryData,
            };
        }).filter((item): item is GroupedLogData => item !== null);
        
        setGroupedData(grouped);

      } catch (error) {
        console.error("Failed to parse Ligation DB:", error);
        setGroupedData(null);
      }
    } else {
      setGroupedData(null);
    }
    setIsLoading(false);
  }, [databases]);

  useEffect(() => {
    if (!api) {
        return;
    }

    const updateCarouselContext = () => {
        if (!groupedData || groupedData.length === 0) {
            updateContext(JSON.stringify({ page: "Ligation Log", status: "No data loaded." }, null, 2));
            return;
        }
        
        const currentSnap = api.selectedScrollSnap();
        const totalSnaps = api.scrollSnapList().length;
        const currentGroup = groupedData[currentSnap];
        
        if (!currentGroup) return;

        const context = {
            page: "Ligation Log",
            totalEntries: totalSnaps,
            viewingEntry: `${currentSnap + 1} of ${totalSnaps}`,
            currentEntryDetails: {
                code: currentGroup.code,
                rowCount: currentGroup.data.length,
                columnCount: currentGroup.headers.length,
            }
        };
        updateContext(JSON.stringify(context, null, 2));
    }
    
    updateCarouselContext();
    api.on("select", updateCarouselContext);

    return () => {
        api.off("select", updateCarouselContext);
    }
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
                    <GitBranch className="w-12 h-12 text-primary" />
                </div>
                <CardTitle>Ligation Log</CardTitle>
                <CardDescription>No Ligation data found.</CardDescription>
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
        <div className="relative w-full max-w-[88rem]">
          <Carousel className="w-full" setApi={setApi} opts={{ align: "start", loop: false, startIndex }}>
            <CarouselContent>
              {groupedData.map((group, index) => (
                <CarouselItem key={index}>
                  <div className="p-1">
                     <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <GitBranch className="w-6 h-6" /> {group.code}
                          </CardTitle>
                          <CardDescription>
                            Displaying a table with {group.data.length} rows and {group.headers.length} columns.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="relative z-0 h-[42rem] w-full overflow-auto rounded-md border">
                            <Table>
                              <TableHeader className="sticky top-0 z-10">
                                <TableRow className="bg-sidebar-accent hover:bg-sidebar-accent">
                                  {group.headers.map((header, hIndex) => (
                                    <TableHead key={`${header}-${hIndex}`} className="whitespace-nowrap text-sidebar-foreground">
                                      {header}
                                    </TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {group.data.map((row, rowIndex) => (
                                  <TableRow key={rowIndex} className="hover:bg-secondary">
                                    {group.headers.map((header, headerIndex) => (
                                      <TableCell key={`${rowIndex}-${header}-${headerIndex}`} className="whitespace-nowrap">
                                        {String(row[header] ?? '')}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      </Card>
                  </div>
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
