"use client";

import { useMemo } from 'react';
import type { Account, Transaction } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { calculateBalance, calculateTransactionSummary } from '@/lib/calculations';
import { calculatePortfolio } from '@/lib/portfolio';
import { formatCurrency, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type AccountSummaryCardProps = {
  account: Account;
  transactions: Transaction[];
};

export function AccountSummaryCard({ account, transactions }: AccountSummaryCardProps) {
  const balance = useMemo(() => calculateBalance(transactions), [transactions]);
  const summary = useMemo(() => calculateTransactionSummary(transactions), [transactions]);
  const isSavings = account.type === 'savings';
  const portfolio = useMemo(() => account.subtype === 'self-directed' ? calculatePortfolio(transactions) : null, [account.subtype, transactions]);
  const showGainsColumn = true;
  const gainsLabel = isSavings ? 'Interest' : 'Income';

  const summaryRows = [
    { period: 'This Month', data: summary.month },
    { period: 'This Year', data: summary.year },
    { period: 'All Time', data: summary.allTime },
  ];

  return (
    <Card className="h-full" data-testid="account-summary-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Current Balance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-5">
          <div className="flex h-full min-w-0 flex-col items-center justify-center gap-2 md:col-span-2">
            <div className={cn("font-bold", portfolio ? 'text-[clamp(1.75rem,2.7vw,3rem)]' : 'text-5xl')} title={portfolio ? 'Cash plus remaining holdings at average cost' : undefined}>{formatCurrency(balance)}</div>
            {portfolio && <div className="text-sm text-muted-foreground">Cash <span className="font-semibold text-foreground">{formatCurrency(portfolio.cash)}</span></div>}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={account.type === 'savings' ? 'secondary' : 'default'} className="capitalize">{account.type}</Badge>
                {account.type === 'savings' && account.interestRate && (
                    <span>{account.interestRate}% APY</span>
                )}
            </div>
            {portfolio && <div className="w-full space-y-2 text-xs text-muted-foreground">
              {portfolio.inferredFunding > 0 && <p>Deposit history is missing; {formatCurrency(portfolio.inferredFunding)} of purchase funding is inferred.</p>}
              {portfolio.incompleteTrades && <p className="text-destructive">Some trades have missing quantities or exceed recorded holdings. Cost totals may be incomplete.</p>}
              {portfolio.cash < -0.005 && <p className="text-destructive">Recorded purchases or withdrawals exceed available cash. Check the deposit history.</p>}
            </div>}
          </div>
          
          <div className="grid min-w-0 gap-2 overflow-x-auto md:col-span-3 md:border-l md:border-border/50 md:pl-4">
              <div className={cn("grid items-center gap-2 px-2 font-semibold uppercase text-muted-foreground", portfolio ? 'text-[10px]' : 'text-xs', showGainsColumn ? "grid-cols-4" : "grid-cols-3")}>
                  <div className="col-span-1">Period</div>
                  <div className="text-right text-positive">Contributions</div>
                  {showGainsColumn && <div className="text-right text-info">{gainsLabel}</div>}
                  <div className="text-right text-destructive">Withdrawals</div>
              </div>
              {summaryRows.map(({ period, data }) => (
                  <div key={period} className={cn("grid items-center gap-2 rounded-md border p-2", showGainsColumn ? "grid-cols-4" : "grid-cols-3")}>
                      <div className="col-span-1 font-semibold text-sm">{period}</div>
                      <div className="text-right font-mono text-xs text-positive">{formatCurrency(data.contributions)}</div>
                      {showGainsColumn && <div className="text-right font-mono text-xs text-info">{formatCurrency(data.interest)}</div>}
                      <div className="text-right font-mono text-xs text-destructive">{formatCurrency(data.withdrawals)}</div>
                  </div>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
