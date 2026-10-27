"use client";

import { useState, useMemo } from 'react';
import { useAccounts } from '@/contexts/accounts-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AccountManager } from './account-manager';
import { Button } from '@/components/ui/button';
import { Landmark } from 'lucide-react';
import { SavingsDashboard } from './savings-dashboard';
import { InvestmentDashboard } from './investment-dashboard';

export function Dashboard() {
  const { accounts, transactions } = useAccounts();
  const [requestedAccountId, setSelectedAccountId] = useState<string | undefined>();
  // Resolve a valid account in the same render as a workbook arrives, avoiding
  // an empty dashboard frame while waiting for a selection effect.
  const selectedAccountId = accounts.some(account => account.id === requestedAccountId)
    ? requestedAccountId : accounts[0]?.id;
  
  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
  };
  
  const selectedAccount = useMemo(() => {
    return accounts.find(acc => acc.id === selectedAccountId);
  }, [accounts, selectedAccountId]);

  const selectedAccountTransactions = useMemo(() => {
    if (!selectedAccountId) return [];
    return transactions.filter(txn => txn.accountId === selectedAccountId);
  }, [transactions, selectedAccountId]);

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
        <h2 className="text-2xl font-bold">Welcome to Personal Savings & Investing Tracker!</h2>
        <p className="mt-2 text-muted-foreground">Get started by importing your financial data file.</p>
         <div className="mt-4">
          <AccountManager>
            <Button>
              <Landmark className="mr-2 h-4 w-4" />
              Manage & Import
            </Button>
          </AccountManager>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-3xl font-bold tracking-tight">
           {selectedAccount?.type === 'savings' ? 'Savings Dashboard' : 'Investment Dashboard'}
        </h2>
        <div className="flex items-center gap-4">
          <Select onValueChange={handleAccountChange} value={selectedAccountId}>
            <SelectTrigger id="account-select" className="w-[280px] bg-card">
              <SelectValue placeholder="Select an account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map(account => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} ({account.bank})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AccountManager>
            <Button variant="outline" className="bg-card">
              <Landmark className="mr-2 h-4 w-4" />
              Manage Accounts
            </Button>
          </AccountManager>
        </div>
      </div>
      
      {selectedAccount && selectedAccount.type === 'savings' && (
        <SavingsDashboard account={selectedAccount} transactions={selectedAccountTransactions} />
      )}
      {selectedAccount && selectedAccount.type === 'investment' && (
        <InvestmentDashboard account={selectedAccount} transactions={selectedAccountTransactions} />
      )}
    </div>
  );
}
