
"use client";

import { useState, useMemo, useEffect } from 'react';
import type { Account, Transaction } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { generateAssetPerformanceData } from '@/lib/calculations';
import { formatCurrency, getChartColor } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

export function AssetPerformanceCard({ account, transactions }: { account: Account, transactions: Transaction[] }) {
  const { uniqueAssets, monthlyData } = useMemo(() => generateAssetPerformanceData(transactions), [transactions]);
  
  const [selectedAssets, setSelectedAssets] = useState<string[]>(() => uniqueAssets.map(a => a.assetCode));
  const [showDividendOnly, setShowDividendOnly] = useState(false);

  const handleAssetSelection = (assetCode: string) => {
    setSelectedAssets(prev =>
      prev.includes(assetCode)
        ? prev.filter(code => code !== assetCode)
        : [...prev, assetCode]
    );
  };
  
  useEffect(() => {
    const assetsToShow = showDividendOnly ? uniqueAssets.filter(a => a.hasDividends) : uniqueAssets;
    setSelectedAssets(assetsToShow.map(a => a.assetCode));
  }, [showDividendOnly, uniqueAssets]);

  const chartData = useMemo(() => {
    return monthlyData.map(monthEntry => {
      const flatData: { [key: string]: string | number } = { month: monthEntry.month };
      for (const assetCode of uniqueAssets.map(a => a.assetCode)) {
        const assetData = monthEntry.assets[assetCode];
        if (assetData) {
          flatData[`${assetCode}_investment`] = assetData.investment;
          flatData[`${assetCode}_realizedGains`] = assetData.realizedGains;
          flatData[`${assetCode}_dividends`] = assetData.dividends;
          flatData[`${assetCode}_shares`] = assetData.shares;
          flatData[`${assetCode}_yield`] = assetData.shares > 0 ? assetData.dividends / assetData.shares : 0;
          flatData[`${assetCode}_roi`] = assetData.investment > 0 ? assetData.dividends / assetData.investment : 0;
        }
      }
      return flatData;
    });
  }, [monthlyData, uniqueAssets]);

  const filteredAssetsForSelection = useMemo(() => {
    return showDividendOnly ? uniqueAssets.filter(a => a.hasDividends) : uniqueAssets;
  }, [uniqueAssets, showDividendOnly]);

  const metrics = [
    { key: 'investment', title: 'Holdings at Cost', currency: true, description: 'Remaining cost after purchases and average-cost sales.' },
    { key: 'dividends', title: 'Income Received', currency: true, description: 'Cumulative dividends, lending income and distributions.' },
    { key: 'shares', title: 'Share Holdings', description: 'Recorded purchases less recorded sales.' },
    { key: 'yield', title: 'Income per Current Share', description: 'Cumulative income divided by shares held at each month end.' },
    { key: 'roi', title: 'Income / Remaining Cost', percent: true, description: 'Income-to-cost ratio, not a market return or annualized yield.' },
    { key: 'realizedGains', title: 'Realized Trade Gains', currency: true, description: 'Cumulative sale proceeds minus average cost of shares sold; excludes income and unsold holdings.' },
  ];
  return (
    <section className="grid gap-6 xl:col-span-2 xl:grid-cols-2" aria-label="Asset performance">
      <Card className="xl:col-span-2">
        <CardHeader><CardTitle>Asset Performance</CardTitle><CardDescription>Select the assets to compare across the charts below.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Switch id="dividend-only" checked={showDividendOnly} onCheckedChange={setShowDividendOnly} /><Label htmlFor="dividend-only">Income-paying assets only</Label></div>
            <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setSelectedAssets(filteredAssetsForSelection.map(asset => asset.assetCode))}>Select All</Button><Button variant="outline" size="sm" onClick={() => setSelectedAssets([])}>Deselect All</Button></div>
          </div>
          <div className="flex max-h-32 flex-wrap gap-x-6 gap-y-3 overflow-y-auto">
            {filteredAssetsForSelection.map(asset => <div key={asset.assetCode} className="flex items-center gap-2">
              <Checkbox id={asset.assetCode} checked={selectedAssets.includes(asset.assetCode)} onCheckedChange={() => handleAssetSelection(asset.assetCode)} />
              <Label htmlFor={asset.assetCode} className="text-sm font-normal" title={asset.assetName}>{asset.assetCode}</Label>
            </div>)}
          </div>
        </CardContent>
      </Card>
      {metrics.map(metric => <Card key={metric.key} data-performance-metric={metric.key}>
        <CardHeader><CardTitle className="text-lg">{metric.title}</CardTitle><CardDescription>{metric.description}</CardDescription></CardHeader>
        <CardContent><div className="h-64 min-w-0">
          {selectedAssets.length ? <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 5, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} minTickGap={25} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} width={72} tickFormatter={value => metric.currency ? formatCurrency(value).split('.')[0] : metric.percent ? `${(value * 100).toFixed(1)}%` : `${Number(value).toFixed(2)}`} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="rounded-lg border bg-background/95 p-3 text-sm shadow-lg backdrop-blur-sm">
                <p className="mb-1 font-semibold">{label}</p>
                {payload.map(item => <p key={String(item.dataKey)} className="flex justify-between gap-4"><span style={{ color: item.color }}>{item.name}</span><span>{metric.currency ? formatCurrency(Number(item.value)) : metric.percent ? `${(Number(item.value) * 100).toFixed(2)}%` : Number(item.value).toFixed(4)}</span></p>)}
              </div> : null} />
              <Legend />
              {selectedAssets.map(code => <Line key={code} type="monotone" dataKey={`${code}_${metric.key}`} name={code} stroke={getChartColor(uniqueAssets.findIndex(asset => asset.assetCode === code))} dot={false} isAnimationActive={false} />)}
            </LineChart>
          </ResponsiveContainer> : <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Select one or more assets to display this chart.</p>}
        </div></CardContent>
      </Card>)}
    </section>
  );
}
