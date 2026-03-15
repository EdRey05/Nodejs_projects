'use client';

import { useState, useEffect } from 'react';
import { useDatabase } from '../../_context/DatabaseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import { GitBranch } from 'lucide-react';
import * as xlsx from 'xlsx';

type GroupedLogData = {
  code: string;
  headers: string[];
  data: any[];
}

export default function LigationLogTempViewerPage() {
  const { databases } = useDatabase();
  const [groupedData, setGroupedData] = useState<GroupedLogData[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        const allData = xlsx.utils.sheet_to_json<any>(dataSheet);
        
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
              return String(dataId) === String(indexId);
            });

            if (entryData.length === 0) return null;
            
            const headers = Object.keys(entryData[0]).filter(h => h !== idColName);
            
            return {
                code: indexEntry.name,
                headers: headers,
                data: entryData,
            };
        }).filter((item): item is GroupedLogData => item !== null);
        
        setGroupedData(grouped.reverse()); // Show latest first

      } catch (error) {
        console.error("Failed to parse Ligation DB:", error);
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

  return (
    <div className="w-full">
      <Carousel className="w-full" opts={{ align: "start", loop: true }}>
        <CarouselContent>
          {groupedData.map((group, index) => (
            <CarouselItem key={index} className="md:basis-1/1 lg:basis-1/1">
              <div className="p-1">
                <Card>
                  <CardHeader>
                      <CardTitle>{group.code}</CardTitle>
                      <CardDescription>{group.data.length} rows in this entry.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <div className="relative h-96 w-full overflow-auto rounded-md border">
                          <Table>
                              <TableHeader className="sticky top-0 z-10">
                                  <TableRow className="bg-sidebar-accent/80 hover:bg-sidebar-accent/90">
                                      {group.headers.map((header, hIndex) => (
                                        <TableHead key={`${header}-${hIndex}`} className="whitespace-nowrap text-sidebar-foreground">{header}</TableHead>
                                      ))}
                                  </TableRow>
                              </TableHeader>
                              <TableBody>
                                  {group.data.map((row, rowIndex) => (
                                      <TableRow key={rowIndex} className="hover:bg-secondary/60">
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
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  );
}
