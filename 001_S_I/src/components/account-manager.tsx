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
import { readWorkbook, createWorkbook } from '@/lib/workbook';

export function AccountManager({ children }: { children: React.ReactNode }) {
  const { accounts, transactions, deleteAccount, loadData, openWorkbook, loading, saving, markExported } = useAccounts();
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
    
    const wb = createWorkbook({ accounts, transactions });
    XLSX.writeFile(wb, "FinancialData.xlsx");
    markExported();

    toast({
        title: "Export Successful!",
        description: `Data exported to FinancialData.xlsx with ${accounts.length} accounts and ${transactions.length} transactions.`,
    });
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { loadData(readWorkbook(await file.arrayBuffer())); }
    catch (error) { toast({ variant: 'destructive', title: 'Import failed', description: error instanceof Error ? error.message : 'Could not read the workbook.' }); }
    finally { if (fileInputRef.current) fileInputRef.current.value = ''; }
  };
  const chooseWorkbook = async (fullPath?: string) => {
    try { await openWorkbook(fullPath); }
    catch (error) { toast({ variant: 'destructive', title: 'Could not open workbook', description: error instanceof Error ? error.message : 'Choose another file.' }); }
  };

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
              Open a workbook to save changes automatically and reopen it next time. Export makes a separate copy.
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
          <SheetFooter className="mt-auto flex flex-col gap-4 pt-4 border-t sm:flex-col sm:items-stretch sm:space-x-0">
            <AddAccountForm open={isAddFormOpen} onOpenChange={setAddFormOpen}>
              <Button className="w-full justify-start">
                <PlusCircle className="h-4 w-4" /> Add New Account
              </Button>
            </AddAccountForm>
            <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="w-full justify-center" disabled={loading || saving} onClick={() => { void chooseWorkbook(); }}>
                    <Upload className="h-4 w-4" /> {loading ? 'Please wait…' : 'Open workbook'}
                </Button>
                <Button variant="outline" className="w-full justify-center" onClick={handleExport}>
                  <Download className="h-4 w-4" /> Export
                </Button>
            </div>
            <Button variant="link" size="sm" className="h-auto whitespace-normal px-0 text-xs" disabled={loading || saving} onClick={() => fileInputRef.current?.click()}>Import a temporary copy (.xlsx / .xls)</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
