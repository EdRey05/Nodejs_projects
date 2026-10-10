'use client';
import { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Upload, Loader2, Send } from 'lucide-react';
import { processFile } from '@/app/actions';
import { useDatabase } from '../../_context/DatabaseContext';

export default function LigationLogPage() {
  const { databases, setDatabase } = useDatabase();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [ligationName, setLigationName] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleSubmit = async () => {
    if (!ligationName.trim()) {
      toast({ variant: 'destructive', title: 'Missing Ligation Code', description: 'Please provide a code for the ligation.' });
      return;
    }
    if (!file) {
      toast({ variant: 'destructive', title: 'Missing File', description: 'Please select an Excel file to process.' });
      return;
    }

    startTransition(async () => {
      try {
        const ligationFileBuffer = await file.arrayBuffer();
        const dbBuffer = databases['Ligation']?.buffer || null;
        const result = await processFile('Ligation', dbBuffer, ligationFileBuffer, ligationName);

        if (result.success && result.data) {
          toast({
            title: 'Processing Successful',
            description: result.message,
          });
          const byteCharacters = atob(result.data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const currentDb = databases['Ligation'];
          setDatabase('Ligation', {
              buffer: byteArray.buffer,
              name: currentDb?.name || 'ligation_db.xlsx'
          });
          setLigationName('');
          setFile(null);
          // Reset file input
          const fileInput = document.getElementById('ligation-file') as HTMLInputElement;
          if(fileInput) fileInput.value = '';

        } else {
          toast({
            variant: 'destructive',
            title: 'Processing Failed',
            description: result.message,
          });
        }
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'An Error Occurred',
          description: error.message || 'Could not process the file.',
        });
      }
    });
  };
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ligation Log</CardTitle>
          <CardDescription>
            Upload an Excel file with ligation data and a unique code. The data will be added to an in-memory database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ligation-code">Ligation Code</Label>
            <Input 
              id="ligation-code"
              placeholder="e.g., U0127-Ligation-FL"
              value={ligationName}
              onChange={(e) => setLigationName(e.target.value)}
              disabled={isPending}
            />
          </div>

           <div className="space-y-2">
            <Label htmlFor="ligation-file">Ligation Excel File</Label>
            <div className="flex items-center gap-2">
                 <Button asChild variant="outline">
                    <label htmlFor="ligation-file" className="cursor-pointer flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Select File
                    </label>
                  </Button>
                <Input id="ligation-file" type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileChange} disabled={isPending}/>
                {file && <span className="text-sm text-muted-foreground">{file.name}</span>}
            </div>
          </div>
          
          <Button onClick={handleSubmit} disabled={isPending || !ligationName || !file}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Process & Add to Log
          </Button>

        </CardContent>
      </Card>
    </div>
  );
}
