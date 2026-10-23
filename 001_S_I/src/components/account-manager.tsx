"use client";

import { useState, useRef } from "react";
import { Trash2, PlusCircle, Download, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAccounts } from '@/contexts/accounts-context';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetDescription } from '@/components/ui/sheet';
import { AddAccountForm } from './add-account-form';
import { formatCurrency } from '@/lib/utils';
import { calculateBalance } from '@/lib/calculations';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast";
import type { Account, Transaction } from "@/lib/types";

export function AccountManager({ children }: { children: React.ReactNode }) {
  const { accounts, transactions, deleteAccount, loadData } = useAccounts();
  const [isAddFormOpen, setAddFormOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const getAccountBalance = (accountId: string) => {
    const accountTransactions = transactions.filter(t => t.accountId === accountId);
    return calculateBalance(accountTransactions);
  };
  
  const handleExport = () => {
     if (accounts.length === 0) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "There are no accounts to export.",
      });
      return;
    }
    
    const accountsWs = XLSX.utils.json_to_sheet(accounts);

    const savingsTxns = transactions.filter(txn => {
        const account = accounts.find(acc => acc.id === txn.accountId);
        return account?.type === 'savings';
    });
    const managedInvestmentTxns = transactions.filter(txn => {
        const account = accounts.find(acc => acc.id === txn.accountId);
        return account?.type === 'investment' && account.subtype === 'managed';
    });
    const selfDirectedInvestmentTxns = transactions.filter(txn => {
        const account = accounts.find(acc => acc.id === txn.accountId);
        return account?.type === 'investment' && account.subtype === 'self-directed';
    });

    const savingsTxnsWs = XLSX.utils.json_to_sheet(savingsTxns);
    const managedTxnsWs = XLSX.utils.json_to_sheet(managedInvestmentTxns);
    const selfDirectedTxnsWs = XLSX.utils.json_to_sheet(selfDirectedInvestmentTxns);
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, accountsWs, "Accounts");
    XLSX.utils.book_append_sheet(wb, savingsTxnsWs, "S_Transactions");
    XLSX.utils.book_append_sheet(wb, managedTxnsWs, "I_M_Transactions");
    XLSX.utils.book_append_sheet(wb, selfDirectedTxnsWs, "I_SD_Transactions");
    
    XLSX.writeFile(wb, "FinancialData.xlsx");

    toast({
        title: "Export Successful!",
        description: `Data exported to FinancialData.xlsx with ${accounts.length} accounts and ${transactions.length} transactions.`,
    });
  }

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = e.target?.result;
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });

            const accountsSheet = workbook.Sheets['Accounts'];
            const savingsTxnsSheet = workbook.Sheets['S_Transactions'];
            const managedTxnsSheet = workbook.Sheets['I_M_Transactions'];
            const selfDirectedTxnsSheet = workbook.Sheets['I_SD_Transactions'];

            if (!accountsSheet) {
                throw new Error("Invalid file format. 'Accounts' sheet is required.");
            }

            const importedAccounts = XLSX.utils.sheet_to_json(accountsSheet) as Account[];
            const importedSavingsTxns = savingsTxnsSheet ? XLSX.utils.sheet_to_json(savingsTxnsSheet) as Transaction[] : [];
            const importedManagedTxns = managedTxnsSheet ? XLSX.utils.sheet_to_json(managedTxnsSheet) as Transaction[] : [];
            const importedSelfDirectedTxns = selfDirectedTxnsSheet ? XLSX.utils.sheet_to_json(selfDirectedTxnsSheet) as Transaction[] : [];
            
            const combinedTransactions = [
                ...importedSavingsTxns, 
                ...importedManagedTxns, 
                ...importedSelfDirectedTxns
            ];

            const finalTransactions = combinedTransactions.map((txn: any) => ({
                ...txn,
                date: txn.date instanceof Date ? txn.date.toISOString() : txn.date,
            }));

            const ids = new Set(importedAccounts.map(account => account.id));
            if (ids.size !== importedAccounts.length || importedAccounts.some(account =>
                typeof account.id !== 'string' || !account.id || !account.name || !account.bank ||
                !['savings', 'investment'].includes(account.type) ||
                (account.type === 'investment' && !['managed', 'self-directed'].includes(account.subtype || '')))) {
                throw new Error('Accounts must have unique IDs, names, banks and valid types/subtypes.');
            }
            if (finalTransactions.some(txn => !ids.has(txn.accountId) || typeof txn.id !== 'string' ||
                !Number.isFinite(txn.amount) || txn.amount < 0 || !Number.isFinite(Date.parse(txn.date)) ||
                !['contribution','withdrawal','interest','buy','sell','dividend','stock-lending','distribution'].includes(txn.type))) {
                throw new Error('Transactions must reference an account and contain a valid ID, amount, date and type.');
            }
            loadData({ accounts: importedAccounts, transactions: finalTransactions });

        } catch (error) {
            console.error("Failed to import data:", error);
            toast({
                variant: "destructive",
                title: "Import Failed",
                description: error instanceof Error ? error.message : "An unknown error occurred while importing the file.",
            });
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };
    reader.readAsArrayBuffer(file);
  }

  const triggerFileSelect = () => fileInputRef.current?.click();

  return (
    <>
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImport} 
        className="hidden" 
        accept=".xlsx, .xls"
      />
      <Sheet>
        <SheetTrigger asChild>{children}</SheetTrigger>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>Account Management</SheetTitle>
            <SheetDescription>
              Add, remove, and manage your accounts. Import/Export your data.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4 py-4 flex-1 overflow-y-auto">
            {accounts.map(account => (
              <div key={account.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-semibold">{account.name}</p>
                  <p className="text-sm text-muted-foreground">{account.bank} - {formatCurrency(getAccountBalance(account.id))}</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the account "{account.name}" and all of its transactions. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteAccount(account.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
            {accounts.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No accounts yet. Import a file or add an account.</p>
            )}
          </div>
          <SheetFooter className="mt-auto flex flex-col gap-4 pt-4 border-t">
            <AddAccountForm open={isAddFormOpen} onOpenChange={setAddFormOpen}>
              <Button className="w-full justify-start">
                <PlusCircle className="h-4 w-4" /> Add New Account
              </Button>
            </AddAccountForm>
            <div className="flex gap-2">
                <Button variant="outline" className="w-full justify-center" onClick={triggerFileSelect}>
                    <Upload className="h-4 w-4" /> Import
                </Button>
                <Button variant="outline" className="w-full justify-center" onClick={handleExport}>
                  <Download className="h-4 w-4" /> Export
                </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
