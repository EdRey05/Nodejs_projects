
"use client";

import type { Account, Transaction } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { GrowthChartCard } from './growth-chart-card';
import { ProjectionChartCard } from './projection-chart-card';
import { TransactionsCard } from './transactions-card';
import { AccountSummaryCard } from './account-summary-card';
import { SelfDirectedTransactionsCard } from './self-directed-transactions-card';
import { AssetPerformanceCard } from './asset-performance-card';
import { AssetAllocationCard } from './asset-allocation-card';

type InvestmentDashboardProps = {
  account: Account;
  transactions: Transaction[];
};

export function InvestmentDashboard({ account, transactions }: InvestmentDashboardProps) {

  if (account.subtype === 'managed') {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <AccountSummaryCard account={account} transactions={transactions} />
          <GrowthChartCard account={account} transactions={transactions} />
          <ProjectionChartCard account={account} transactions={transactions} />
        </div>
        <div className="lg:col-span-2">
          <TransactionsCard account={account} transactions={transactions} />
        </div>
      </div>
    );
  }

  if (account.subtype === 'self-directed') {
    return (
      <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-2" data-testid="self-directed-dashboard">
        <AccountSummaryCard account={account} transactions={transactions} />
        <AssetAllocationCard transactions={transactions} />
        <GrowthChartCard account={account} transactions={transactions} />
        <SelfDirectedTransactionsCard account={account} transactions={transactions} mode="entry" />
        <div className="xl:col-span-2"><SelfDirectedTransactionsCard account={account} transactions={transactions} /></div>
        <AssetPerformanceCard account={account} transactions={transactions} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Investment Dashboard for {account.name}</CardTitle>
          <CardDescription>
            This is a placeholder for the investment account dashboard. More features coming soon!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center h-96">
            <h2 className="text-xl font-bold">Investment Dashboard Under Construction</h2>
            <p className="mt-2 text-muted-foreground">Detailed investment tracking and analysis will be available here.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
