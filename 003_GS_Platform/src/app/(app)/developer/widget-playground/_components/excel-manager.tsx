"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileUp, Loader2, FileText, Download } from "lucide-react";
import { summarizeExcel } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";

export function ExcelManager() {
  const [summary, setSummary] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setSummary(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUri = e.target?.result as string;
      if (dataUri) {
        startTransition(async () => {
          const result = await summarizeExcel(dataUri);
          if (result.startsWith("Sorry")) {
            toast({
              variant: "destructive",
              title: "Summarization Failed",
              description: result,
            });
            setSummary(null);
          } else {
            setSummary(result);
          }
        });
      }
    };
    reader.onerror = () => {
        toast({
            variant: "destructive",
            title: "File Read Error",
            description: "Could not read the selected file.",
        });
    };
    reader.readAsDataURL(file);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Excel Integration</CardTitle>
        <CardDescription>
          Import data by uploading an Excel file or export your current plate layout.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
            <h3 className="font-medium">Import & Summarize</h3>
            <div className="flex items-center gap-2">
            <Button asChild variant="outline">
                <label htmlFor="excel-upload" className="cursor-pointer flex items-center gap-2">
                    <FileUp className="h-4 w-4" />
                    Upload Excel
                </label>
            </Button>
            <Input id="excel-upload" type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileChange} />
            {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
            </div>
        </div>

        {isPending && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Generating summary...</span>
          </div>
        )}

        {summary && (
          <Card className="bg-muted/50">
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> AI Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{summary}</p>
            </CardContent>
          </Card>
        )}
        
        <div className="space-y-2">
            <h3 className="font-medium">Export Layout</h3>
            <Button variant="outline" disabled>
                <Download className="h-4 w-4" />
                Export to Excel (Coming soon)
            </Button>
        </div>

      </CardContent>
    </Card>
  );
}
