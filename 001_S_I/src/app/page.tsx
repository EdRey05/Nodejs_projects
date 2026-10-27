"use client";

import { AccountsProvider } from '@/contexts/accounts-context';
import { useWorkbookController } from '@/hooks/use-workbook';
import { Header } from '@/components/header';
import { Dashboard } from '@/components/dashboard';
import { Button } from '@/components/ui/button';

export default function Home() {
  const workbook = useWorkbookController();
  return <AccountsProvider value={workbook}>
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      {(workbook.accounts.length > 0 || workbook.saveError) && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-xs text-muted-foreground sm:px-8" data-testid="workbook-status" role="status">
        <span className="min-w-0 break-all">{workbook.filePath || 'Open a workbook to remember its location and save changes automatically.'}</span>
        <span className={workbook.saveError ? 'text-destructive' : ''}>{workbook.saveError || (workbook.saving ? 'Saving…' : workbook.filePath ? (workbook.isDirty ? 'Unsaved changes' : 'Saved') : workbook.accounts.length ? 'Temporary copy — export to keep changes' : '')}</span>
        {workbook.saveError && <>
          {workbook.isDirty && <Button size="sm" variant="outline" onClick={workbook.retrySave}>Retry saving</Button>}
          {workbook.filePath && <Button size="sm" variant="outline" onClick={() => { void workbook.reloadWorkbook().catch(error => window.alert(error.message)); }}>Reload file</Button>}
        </>}
      </div>}
      <main className="flex-1 p-4 sm:p-6 md:p-8"><Dashboard /></main>
    </div>
  </AccountsProvider>;
}
