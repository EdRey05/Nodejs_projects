"use client";

import { useMemo, useState } from 'react';
import type { Account, Transaction } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { calculateBalance, calculateProjectionData, generateGrowthData } from '@/lib/calculations';
import { formatCurrency } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Label } from './ui/label';

type GrowthChartCardProps = { account: Account; transactions: Transaction[] };
type GrowthPoint = { balance: number; contributions?: number; withdrawals?: number; interest?: number; initialBalance?: number; totalContributions?: number; totalInterest?: number };

function GrowthTooltip({ active, payload, label, projection, account }: { active?: boolean; payload?: { payload: GrowthPoint }[]; label?: string | number; projection: boolean; account: Account }) {
  const data = payload?.[0]?.payload;
  if (!active || !data) return null;
  const rows = projection ? [
    ['Starting balance', data.initialBalance || 0],
    ['Total contributions', data.totalContributions || 0],
    ['Estimated growth', data.totalInterest || 0],
    ['Projected balance', data.balance],
  ] : [
    ['Ending balance', data.balance],
    ['Contributions', data.contributions || 0],
    [account.type === 'savings' ? 'Interest' : 'Income received', data.interest || 0],
    ['Withdrawals', data.withdrawals || 0],
  ];
  return <div className="rounded-lg border bg-background/95 p-3 text-sm shadow-lg backdrop-blur-sm">
    <p className="mb-1 font-semibold">{label}</p>
    {rows.map(([name, value]) => <p key={String(name)} className="flex justify-between gap-5 text-muted-foreground"><span>{name}</span><span className="font-medium text-foreground">{formatCurrency(Number(value))}</span></p>)}
  </div>;
}

export function GrowthChartCard({ account, transactions }: GrowthChartCardProps) {
  const selfDirected = account.subtype === 'self-directed';
  const [view, setView] = useState('history');
  const [monthlyContribution, setMonthlyContribution] = useState(500);
  const [annualGrowth, setAnnualGrowth] = useState(7);
  const [years, setYears] = useState(10);
  const history = useMemo(() => generateGrowthData(transactions), [transactions]);
  const balance = useMemo(() => calculateBalance(transactions), [transactions]);
  const projected = useMemo(() => selfDirected ? calculateProjectionData(balance, monthlyContribution, annualGrowth, years) : [], [selfDirected, balance, monthlyContribution, annualGrowth, years]);
  const projection = selfDirected && view === 'projection';
  const chartData = projection ? projected : history;
  const bounded = (value: string, min: number, max: number) => Math.min(max, Math.max(min, Number(value) || 0));
  return <Card className={selfDirected ? 'flex h-full min-w-0 flex-col' : ''} data-testid="account-growth-card">
    <CardHeader>
      <CardTitle>Account Growth</CardTitle>
      <CardDescription>{projection ? 'Illustrative monthly compounding from your current cash-plus-cost balance; contributions added at month end.' : `Historical balance over time for ${account.name}.`}</CardDescription>
    </CardHeader>
    <CardContent className={selfDirected ? 'flex flex-1 flex-col gap-4' : ''}>
      {selfDirected && <>
        <Tabs value={view} onValueChange={setView}><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="history">History</TabsTrigger><TabsTrigger value="projection">Projection</TabsTrigger></TabsList></Tabs>
        {projection && <div className="grid grid-cols-3 gap-3">
          <div><Label htmlFor="self-monthly-contribution" className="mb-1 block text-xs">Monthly contribution ($)</Label><Input id="self-monthly-contribution" type="number" min={0} max={1000000} step={50} value={monthlyContribution} onChange={e => setMonthlyContribution(bounded(e.target.value, 0, 1000000))} /></div>
          <div><Label htmlFor="self-annual-growth" className="mb-1 block text-xs">Annual growth (%)</Label><Input id="self-annual-growth" type="number" min={0} max={30} step={0.1} value={annualGrowth} onChange={e => setAnnualGrowth(bounded(e.target.value, 0, 30))} /></div>
          <div><Label htmlFor="self-projection-years" className="mb-1 block text-xs">Years</Label><Input id="self-projection-years" type="number" min={1} max={35} step={1} value={years} onChange={e => setYears(Math.round(bounded(e.target.value, 1, 35)))} /></div>
        </div>}
      </>}
      <div className={selfDirected ? 'relative min-h-80 w-full flex-1' : 'relative h-80 w-full'} data-testid="growth-plot">
        <div className="absolute inset-0">
          {chartData.length ? <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} minTickGap={35} />
              <YAxis width={76} stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={value => formatCurrency(value).split('.')[0]} />
              <Tooltip content={<GrowthTooltip projection={projection} account={account} />} />
              <Line type="monotone" dataKey="balance" name={projection ? 'Projected balance' : 'Balance'} stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer> : <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Add transactions to see account growth.</p>}
        </div>
      </div>
    </CardContent>
  </Card>;
}
