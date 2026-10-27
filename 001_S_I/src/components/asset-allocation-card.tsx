"use client";

import { useMemo } from 'react';
import type { Transaction } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { calculateAssetAllocation } from '@/lib/calculations';
import { formatCurrency, getChartColor } from '@/lib/utils';

type Slice = { name: string; value: number; color: string };
function AllocationTooltip({ active, payload, total }: { active?: boolean; payload?: { payload: Slice }[]; total: number }) {
  const slice = payload?.[0]?.payload;
  if (!active || !slice) return null;
  return <div className="rounded-lg border bg-background/95 p-3 text-sm shadow-lg backdrop-blur-sm">
    <p className="font-semibold">{slice.name}</p>
    <p className="text-muted-foreground">{formatCurrency(slice.value)} <span className="text-foreground">({(slice.value / total * 100).toFixed(1)}%)</span></p>
  </div>;
}

export function AssetAllocationCard({ transactions }: { transactions: Transaction[] }) {
  const allocation = useMemo(() => calculateAssetAllocation(transactions), [transactions]);
  const categories = Object.keys(allocation.investment) as (keyof typeof allocation.investment)[];
  const legend = categories.map((name, index) => ({ name, color: getChartColor(index) }))
    .filter(item => allocation.investment[item.name] > .005 || allocation.gains[item.name] > .005);
  return <Card className="h-full" data-testid="asset-allocation-card">
    <CardHeader className="pb-1 pt-4"><CardTitle className="text-lg">Asset Allocation</CardTitle></CardHeader>
    <CardContent className="space-y-2 pb-4">
      <div className="grid grid-cols-2 gap-3">
        {([{ key: 'investment', title: 'Holdings at cost' }, { key: 'gains', title: 'Income received' }] as const).map(view => {
          const data = categories.map((name, index) => ({ name, value: allocation[view.key][name], color: getChartColor(index) })).filter(item => item.value > .005);
          const total = data.reduce((sum, item) => sum + item.value, 0);
          return <div key={view.key} className="min-w-0 text-center" data-allocation-view={view.key}>
            <p className="text-xs font-medium text-muted-foreground">{view.title}</p>
            <div className="h-36" aria-label={`${view.title} allocation chart`}>
              {data.length ? <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={36} outerRadius={60} isAnimationActive={false}>
                  {data.map(item => <Cell key={item.name} fill={item.color} />)}
                </Pie><Tooltip content={<AllocationTooltip total={total} />} /></PieChart>
              </ResponsiveContainer> : <p className="flex h-full items-center justify-center text-xs text-muted-foreground">{view.key === 'investment' ? 'No holdings recorded' : 'No asset income recorded'}</p>}
            </div>
          </div>;
        })}
      </div>
      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs" aria-label="Allocation categories">
        {legend.map(item => <li key={item.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</li>)}
      </ul>
    </CardContent>
  </Card>;
}
