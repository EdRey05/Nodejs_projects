"use client";

import { createContext, useContext } from 'react';
import type { Account, Transaction } from '@/lib/types';

interface AccountsContextType {
  accounts: Account[];
  transactions: Transaction[];
  addAccount: (account: Account) => void;
  deleteAccount: (accountId: string) => void;
  addTransaction: (transaction: Transaction) => void;
  loadData: (data: { accounts: Account[], transactions: Transaction[] }) => void;
  filePath: string | null;
  loading: boolean;
  saving: boolean;
  isDirty: boolean;
  saveError: string | null;
  openWorkbook: (path?: string) => Promise<void>;
  retrySave: () => void;
  reloadWorkbook: () => Promise<void>;
  markExported: () => void;
}

const AccountsContext = createContext<AccountsContextType | undefined>(undefined);

export const AccountsProvider = AccountsContext.Provider;

export const useAccounts = () => {
  const context = useContext(AccountsContext);
  if (context === undefined) {
    throw new Error('useAccounts must be used within an AccountsProvider');
  }
  return context;
};
