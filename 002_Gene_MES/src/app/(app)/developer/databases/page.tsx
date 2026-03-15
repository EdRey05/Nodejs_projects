'use client';
import { useState, useTransition } from 'react';
import { useDatabase } from '../../_context/DatabaseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, Loader2, Database as DbIcon, Trash2, FileArchive, Save } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LOG_TYPES, LogType } from '@/lib/types';
import { persistData, downloadDataZip } from '@/app/actions';

export default function DatabasesPage() {
  const { databases, setDatabase } = useDatabase();
  const { toast } = useToast();
  const [isUploading, startUploading] = useTransition();
  const [isPersisting, startPersisting] = useTransition();
  const [isZipping, startZipping] = useTransition();
  const [logTypeToUpload, setLogTypeToUpload] = useState<LogType | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !logTypeToUpload) {
        if(!logTypeToUpload) {
            toast({
                variant: 'destructive',
                title: 'Log Type Not Selected',
                description: 'Please select a log type to upload the database to.',
            });
        }
        return;
    };

    startUploading(() => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        setDatabase(logTypeToUpload, { buffer: buffer, name: file.name });
        toast({
          title: 'Database Loaded',
          description: `"${file.name}" has been loaded into the "${logTypeToUpload}" database slot.`,
        });
      };
      reader.onerror = () => {
        toast({
          variant: 'destructive',
          title: 'File Read Error',
          description: 'Could not read the selected file.',
        });
      };
      reader.readAsArrayBuffer(file);
    });
  };
  
  const handleDownload = (logType: LogType) => {
    const db = databases[logType];
    if (!db || !db.buffer) {
        toast({
            variant: 'destructive',
            title: 'No Database Found',
            description: 'There is no database in memory to download for this log type.',
        });
        return;
    }
    const blob = new Blob([db.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = db.name || `${logType.toLowerCase().replace(' ', '_')}_db.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast({
        title: 'Download Started',
        description: `Downloading "${db.name || 'database.xlsx'}".`,
    });
  };

  const handleSaveToServer = (logType: LogType) => {
    const db = databases[logType];
    if (!db || !db.buffer) return;

    startPersisting(async () => {
        const base64 = Buffer.from(db.buffer!).toString('base64');
        const result = await persistData(logType, base64, db.images || {});
        if (result.success) {
            toast({ title: 'Saved to Server', description: result.message });
        } else {
            toast({ variant: 'destructive', title: 'Save Failed', description: result.message });
        }
    });
  };

  const handleDownloadZip = () => {
    startZipping(async () => {
        const result = await downloadDataZip();
        if (result.success && result.data) {
            const byteCharacters = atob(result.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/zip' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `labflow_data_${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast({ title: 'ZIP Download Started', description: 'Your data folder has been zipped and download started.' });
        } else {
            toast({ variant: 'destructive', title: 'ZIP Failed', description: result.message });
        }
    });
  };
  
  const activeDatabases = Object.entries(databases).filter(([, db]) => db && db.buffer);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Database Management</CardTitle>
          <CardDescription>
            Upload an existing database from a file or download the current one from memory. In-memory databases are cleared when you close this browser tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 rounded-lg border p-4">
             <h3 className="font-medium">Upload Database</h3>
             <p className="text-sm text-muted-foreground">Load an `.xlsx` database file into memory for a specific log type.</p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Select onValueChange={(value) => setLogTypeToUpload(value as LogType)} disabled={isUploading}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="Select Log Type..." />
                    </SelectTrigger>
                    <SelectContent>
                        {LOG_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                    </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                    <Button asChild variant="outline" disabled={!logTypeToUpload || isUploading}>
                        <label htmlFor="db-upload" className="cursor-pointer flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        Select File
                        </label>
                    </Button>
                    <Input id="db-upload" type="file" className="hidden" accept=".xlsx" onChange={handleFileChange} disabled={!logTypeToUpload || isUploading} />
                    {isUploading && <Loader2 className="h-5 w-5 animate-spin" />}
                </div>
            </div>
          </div>

          <div className="space-y-4">
             <div className="flex items-center justify-between">
                <h3 className="font-medium">In-Memory Databases</h3>
                <Button onClick={handleDownloadZip} disabled={isZipping || activeDatabases.length === 0} variant="outline">
                    {isZipping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileArchive className="mr-2 h-4 w-4" />}
                    Download All (ZIP)
                </Button>
             </div>
            {activeDatabases.length > 0 ? (
                 <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {activeDatabases.map(([logType, db]) => (
                        <Card key={logType} className="flex flex-col">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{logType} DB</CardTitle>
                                <DbIcon className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent className="flex-grow">
                               <p className="text-xs text-muted-foreground truncate" title={db.name || ''}>{db.name || 'No name'}</p>
                            </CardContent>
                            <div className="flex flex-col gap-2 p-4 pt-0">
                                <Button className="w-full" onClick={() => handleDownload(logType as LogType)} variant="outline">
                                    <Download className="mr-2 h-4 w-4" />
                                    Download Excel
                                </Button>
                                <Button className="w-full" onClick={() => handleSaveToServer(logType as LogType)} disabled={isPersisting}>
                                    {isPersisting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Save to Server
                                </Button>
                            </div>
                        </Card>
                    ))}
                 </div>
            ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center">
                    <Trash2 className="h-10 w-10 text-muted-foreground" />
                    <p className="mt-4 text-sm font-medium">No databases found</p>
                    <p className="text-sm text-muted-foreground">Go to the Log Uploader to start a new database.</p>
                </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
