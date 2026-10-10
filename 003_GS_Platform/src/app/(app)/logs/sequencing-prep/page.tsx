'use client';

import { useState, useMemo } from 'react';
import { useDatabase } from '../../_context/DatabaseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel';
import { LogSearchCombobox } from '@/components/ui/log-search-combobox';
import { Dna } from 'lucide-react';

type SeqPrepIndexRow = { id?: number | null; name?: string | null; source?: string | null };

const KIND_LABEL: Record<string, string> = {
  SeqLayout: 'Layout',
  SeqOrder: 'Order form',
  SeqValid: 'Validation',
};

export default function SequencingPrepLogPage() {
  const { databases } = useDatabase();
  const [api, setApi] = useState<CarouselApi>();
  const [currentIndex, setCurrentIndex] = useState(0);

  const grouped = useMemo(() => {
    const db = databases['Sequencing Prep'];
    if (!db || !db.payload) return null;
    try {
      const indexData = (db.payload.index as SeqPrepIndexRow[]) || [];
      // group by Work No (name minus the -SeqXxx suffix)
      const byWo = new Map<string, SeqPrepIndexRow[]>();
      indexData.forEach((row) => {
        if (!row?.name) return;
        const wo = row.name.replace(/-Seq(Layout|Order|Valid)$/, '');
        byWo.set(wo, [...(byWo.get(wo) || []), row]);
      });
      return [...byWo.entries()].map(([wo, rows]) => ({ wo, rows }));
    } catch (e) {
      console.error('Failed to group sequencing prep data:', e);
      return null;
    }
  }, [databases]);

  if (grouped === null) {
    return <div className="flex flex-col items-center justify-center h-full text-center"><p>Loading database...</p></div>;
  }
  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <Dna className="h-12 w-12 text-muted-foreground" />
        <p className="font-medium">No Sequencing prep data in DuckDB.</p>
        <p className="text-xs text-muted-foreground">Run the bulk_import_sequencing_prep bridge action on the pilot 06 folder.</p>
      </div>
    );
  }

  const current = grouped[currentIndex] || null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-1 pt-1">
        <LogSearchCombobox
          items={grouped.map((g, i) => ({ label: g.wo, index: i }))}
          currentIndex={currentIndex}
          onSelect={(i) => setCurrentIndex(i)}
        />
        <span className="text-xs text-muted-foreground">{currentIndex + 1} / {grouped.length}</span>
      </div>
      <Carousel setApi={setApi} opts={{ loop: true }} className="flex-1">
        <CarouselContent>
          {grouped.map((g) => (
            <CarouselItem key={g.wo}>
              <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3 p-1">
                {g.rows.map((row) => (
                  <Card key={row.name} className="lg:col-span-1">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{KIND_LABEL[row.name?.match(/-Seq(Layout|Order|Valid)$/)?.[1] || ''] || 'File'}</CardTitle>
                      <CardDescription className="font-mono text-[11px]">{row.name}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">source: {row.source || '—'}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
}