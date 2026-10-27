"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Account, Transaction } from '@/lib/types';
import type { WorkbookBinding, WorkbookData } from '@/lib/workbook';
import { useToast } from './use-toast';

const empty: WorkbookData = { accounts: [], transactions: [] };
async function request(method: string, body?: unknown) {
  const response = await fetch('/api/workbook', { method, cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-SI-Request': '1' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not access the workbook.');
  return result;
}

export function useWorkbookController() {
  const [data, setData] = useState<WorkbookData>(empty);
  const dataRef = useRef(data);
  const binding = useRef<WorkbookBinding | null>(null);
  const saved = useRef(JSON.stringify(empty));
  const busy = useRef(false);
  const blocked = useRef(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { toast } = useToast();

  const install = useCallback((next: WorkbookData, selected: WorkbookBinding | null) => {
    dataRef.current = next; binding.current = selected; saved.current = JSON.stringify(next); blocked.current = false;
    setData(next); setFilePath(selected?.path || null); setDirty(false); setSaveError(null);
  }, []);

  const flush = useCallback(async () => {
    if (busy.current || blocked.current || !binding.current) return;
    busy.current = true;
    try {
      while (binding.current && saved.current !== JSON.stringify(dataRef.current)) {
        setSaving(true);
        const snapshot = JSON.stringify(dataRef.current);
        const response = await request('PUT', { binding: binding.current, data: JSON.parse(snapshot) });
        binding.current = response.binding;
        saved.current = snapshot;
      }
      setSaveError(null); setDirty(false);
    } catch (error) {
      blocked.current = true; setDirty(true);
      setSaveError(error instanceof Error ? error.message : 'Automatic saving failed. Your edits are still in this page.');
    } finally { busy.current = false; setSaving(false); }
  }, []);

  const update = useCallback((change: (previous: WorkbookData) => WorkbookData) => {
    const next = change(dataRef.current);
    dataRef.current = next; setData(next); setDirty(true);
    void flush();
  }, [flush]);

  useEffect(() => {
    let active = true;
    request('GET').then(result => {
      if (!active) return;
      if (result.data && result.binding) install(result.data, result.binding);
      else { setFilePath(result.path || null); setSaveError(result.error || null); }
    }).catch(error => { if (active) setSaveError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [install]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saved.current !== JSON.stringify(dataRef.current)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const mayReplace = () => {
    if (busy.current) throw new Error('Wait for automatic saving to finish first.');
    return saved.current === JSON.stringify(dataRef.current) || window.confirm('Discard unsaved app changes? Export a copy first if you want to keep them.');
  };
  const openWorkbook = async (path?: string) => {
    if (!mayReplace()) return;
    setLoading(true);
    try {
      const result = await request('POST', path ? { action: 'open', path } : { action: 'pick' });
      if (!result.cancelled) {
        install(result.data, result.binding);
        toast({ title: 'Workbook opened', description: 'Changes will save automatically to this file.' });
      }
    } finally { setLoading(false); }
  };
  const loadData = (next: WorkbookData) => {
    if (!mayReplace()) return;
    install(next, null);
    toast({ title: 'Temporary copy imported', description: 'Export to keep changes, or open a workbook for automatic saving.' });
  };

  return {
    ...data, filePath, loading, saving, isDirty, saveError,
    addAccount: (account: Account) => update(previous => ({ ...previous, accounts: [...previous.accounts, account] })),
    deleteAccount: (id: string) => update(previous => ({ accounts: previous.accounts.filter(account => account.id !== id), transactions: previous.transactions.filter(txn => txn.accountId !== id) })),
    addTransaction: (txn: Transaction) => update(previous => ({ ...previous, transactions: [...previous.transactions, txn] })),
    loadData, openWorkbook,
    retrySave: () => { blocked.current = false; void flush(); },
    markExported: () => { if (!binding.current) { saved.current = JSON.stringify(dataRef.current); setDirty(false); } },
    reloadWorkbook: () => filePath ? openWorkbook(filePath) : Promise.resolve(),
  };
}
