'use client';
import { useState, useTransition, useCallback, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { useDatabase } from '../../_context/DatabaseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, X, FileUp, Microscope, Dna, Hash, ArrowDownToLine, Info, ImageUp } from 'lucide-react';
import { previewFile, processAndPersist, fetchExtractionWells } from '@/app/actions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { LOG_TYPES, LogType, PlateData, DNA_QUANTIFICATION_SOURCES, DnaQuantificationSource } from '@/lib/types';
import { ColonyPcrGrid } from './_components/colony-pcr-grid';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DnaExtractionGrid } from './_components/dna-extraction-grid';
import { DnaExtractionControlPanel } from './_components/dna-extraction-control-panel';
import { DnaExtractionLegend } from './_components/dna-extraction-legend';
type DnaExtractionPlate = {
  plateId: number;
  data: PlateData;
};

export default function LogUploaderPage() {
  const { databases, setDatabase } = useDatabase();
  const { toast } = useToast();
  const [isProcessing, startProcessing] = useTransition();
  const [isAdding, startAdding] = useTransition();
  const [isFetchingWells, startFetchingWells] = useTransition();
  
  const [logType, setLogType] = useState<LogType | null>(null);
  const [entryCode, setEntryCode] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [ligationPreviewData, setLigationPreviewData] = useState<any[] | null>(null);
  const [ligationPreviewHeaders, setLigationPreviewHeaders] = useState<string[] | null>(null);
  const [colonyPcrPreviewData, setColonyPcrPreviewData] = useState<any[] | null>(null);
  const [dnaExtractionPlates, setDnaExtractionPlates] = useState<DnaExtractionPlate[] | null>(null);
  const [dnaQuantificationPreview, setDnaQuantificationPreview] = useState<{ data: any[], headers: string[] } | null>(null);

  // Quantification states
  const [quantSource, setQuantSource] = useState<DnaQuantificationSource | null>(null);
  const [sourceExtractionEntry, setSourceExtractionEntry] = useState<string>('');
  const [quantStartingRow, setQuantStartingRow] = useState<number>(1);
  const [includePooledReplicates, setIncludePooledReplicates] = useState<boolean>(false);
  const [preparedQuantTable, setPreparedQuantTable] = useState<any[] | null>(null);

  const [selectedWells, setSelectedWells] = useState<Set<string>>(new Set());
  const [positiveWells, setPositiveWells] = useState<Record<string, Set<string>>>({});
  const [plateImages, setPlateImages] = useState<Record<string, string[]>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Helper to transform grid data for Colony PCR preview
  const transformColonyPcrData = useCallback((gridData: any[]) => {
    const plateData: PlateData = {};
    const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    gridData.forEach((row, rowIndex) => {
      const rowLabel = rowLabels[rowIndex];
      if (!rowLabel) return;
      for (let i = 1; i <= 12; i++) {
        const wellId = `${rowLabel}${i}`;
        plateData[wellId] = {
          id: wellId,
          sample: null,
          params: {},
          content: row[`C${i}`] || ''
        };
      }
    });
    return plateData;
  }, []);

  // Get available extraction entries
  const extractionEntries = useMemo(() => {
    const db = databases['DNA Extraction'];
    if (!db?.payload?.index) return [];
    return db.payload.index as { name: string; id: number }[];
  }, [databases]);

  const clearState = () => {
    setFile(null);
    setLigationPreviewData(null);
    setLigationPreviewHeaders(null);
    setColonyPcrPreviewData(null);
    setDnaExtractionPlates(null);
    setDnaQuantificationPreview(null);
    setPositiveWells({});
    setPlateImages({});
    setSelectedWells(new Set());
    setEntryCode('');
    setQuantSource(null);
    setSourceExtractionEntry('');
    setPreparedQuantTable(null);
    const fileInput = document.getElementById('log-file') as HTMLInputElement;
    if(fileInput) fileInput.value = '';
  };

  const handleFetchExtractionWells = useCallback(async (entryName: string) => {
    startFetchingWells(async () => {
        const result = await fetchExtractionWells(entryName);
        if (result.success && result.wells) {
            const table = result.wells.map(w => ({
                'Well': w.well,
                'Sample Name': w.sample,
                'Concentration (ng/ul)': '',
                '260/280': '',
                '260/230': '',
                'A260': '',
                'A280': '',
                'A230': ''
            }));
            setPreparedQuantTable(table);
            setEntryCode(entryName); 
        } else {
            toast({ variant: 'destructive', title: 'Fetch Error', description: result.message });
        }
    });
  }, [toast]);

  useEffect(() => {
    if (logType === 'DNA Quantification' && quantSource === 'Extraction Plate' && sourceExtractionEntry) {
        handleFetchExtractionWells(sourceExtractionEntry);
    } else if (logType === 'DNA Quantification' && quantSource && quantSource !== 'Extraction Plate') {
        setPreparedQuantTable([]);
    }
  }, [logType, quantSource, sourceExtractionEntry, handleFetchExtractionWells]);

  const handleFile = (selectedFile: File | null) => {
    if (!selectedFile) {
        setFile(null);
        return;
    }
    if (!logType) {
        toast({ variant: 'destructive', title: 'Log Type Not Selected', description: 'Please select a log type before uploading a file.' });
        return;
    }

    if (logType === 'DNA Quantification' && !quantSource) {
        toast({ variant: 'destructive', title: 'Source Not Set', description: 'Please select a sample source before uploading the quantification file.' });
        return;
    }

    setFile(selectedFile);
    startProcessing(async () => {
        try {
            const fileBuffer = await selectedFile.arrayBuffer();
            const result = await previewFile(logType, fileBuffer);
            if (result.success) {
                if (logType === 'Ligation') {
                    setLigationPreviewData(result.data);
                    setLigationPreviewHeaders(result.headers || null);
                } else if (logType === 'Colony PCR') {
                    setColonyPcrPreviewData(result.data);
                } else if (logType === 'DNA Extraction') {
                    setDnaExtractionPlates(result.data);
                } else if (logType === 'DNA Quantification') {
                    setDnaQuantificationPreview({ data: result.data, headers: result.headers || [] });
                }
                toast({ title: 'File Ready for Review', description: result.message });
            } else {
                toast({ variant: 'destructive', title: 'File Parsing Failed', description: result.message });
                setFile(null);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'An Error Occurred', description: error.message || 'Could not process the file.' });
            setFile(null);
        }
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0] || null);
  };
  
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      handleFile(event.dataTransfer.files[0]);
    }
  };

  const handleTogglePositive = (plateId: string, wellId: string) => {
    setPositiveWells(prev => {
        const newPlatePositives = new Set(prev[plateId] || []);
        newPlatePositives.has(wellId) ? newPlatePositives.delete(wellId) : newPlatePositives.add(wellId);
        return { ...prev, [plateId]: newPlatePositives };
    });
  };
  
  const handleImageFiles = (files: FileList | null, imageKey: string) => {
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) {
        toast({ variant: 'destructive', title: 'Invalid File Type', description: `File "${file.name}" is not an image.` });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUri = e.target?.result as string;
        setPlateImages(prev => ({
          ...prev,
          [imageKey]: [...(prev[imageKey] || []), dataUri],
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveImage = (imageKey: string, imageIndex: number) => {
    setPlateImages(prev => {
      const newImages = (prev[imageKey] || []).filter((_, index) => index !== imageIndex);
      return { ...prev, [imageKey]: newImages };
    });
  };

  const handleWellSelect = useCallback((prefixedWellId: string, isCtrlKey: boolean) => {
    setSelectedWells(prev => {
      const newSelection = new Set(prev);
      if (isCtrlKey) {
        newSelection.has(prefixedWellId) ? newSelection.delete(prefixedWellId) : newSelection.add(prefixedWellId);
      } else {
        if (newSelection.size === 1 && newSelection.has(prefixedWellId)) return new Set();
        return new Set([prefixedWellId]);
      }
      return newSelection;
    });
  }, []);

  const handleBulkSelect = (platePrefix: string, type: 'row' | 'col', key: string | number) => {
    if (!dnaExtractionPlates) return;
    const wellsToSelect = new Set<string>();
    const rows = 8;
    const cols = 6;
    const targetPlateId = platePrefix === 'p1' ? 1 : 2;
    const plate = dnaExtractionPlates.find(p => p.plateId === targetPlateId);
    if (!plate) return;
    
    if (type === 'row') {
      for (let i = 1; i <= cols; i++) {
          const wellId = `${key}${i}`;
          if (plate.data[wellId]?.content?.trim()) wellsToSelect.add(`${platePrefix}-${wellId}`);
      }
    } else {
      for (let i = 0; i < rows; i++) {
        const rowLabel = String.fromCharCode(65 + i);
        const gridCol = (Number(key) - 1) % 6 + 1;
        const wellId = `${rowLabel}${gridCol}`;
        if (plate.data[wellId]?.content?.trim()) wellsToSelect.add(`${platePrefix}-${wellId}`);
      }
    }
    
    const allSelected = Array.from(wellsToSelect).every(well => selectedWells.has(well));
    setSelectedWells(prev => {
        const newSelection = new Set(prev);
        if (allSelected && wellsToSelect.size > 0) {
            wellsToSelect.forEach(well => newSelection.delete(well));
        } else {
            wellsToSelect.forEach(well => newSelection.add(well));
        }
        return newSelection;
    });
  }
  
  const handleApplyParameter = (type: 'antibiotic' | 'temperature' | 'bacteria' | 'incubationTime' | 'prep', value: string) => {
    if (logType !== 'DNA Extraction' || !dnaExtractionPlates) return;
    setDnaExtractionPlates(prevPlates => {
        if (!prevPlates) return null;
        const newPlates = JSON.parse(JSON.stringify(prevPlates));
        selectedWells.forEach(prefixedWellId => {
            const [platePrefix, wellId] = prefixedWellId.split('-');
            const targetPlateId = platePrefix === 'p1' ? 1 : 2;
            const plateToUpdate = newPlates.find((p: DnaExtractionPlate) => p.plateId === targetPlateId);
            if (plateToUpdate && plateToUpdate.data[wellId]) plateToUpdate.data[wellId].params[type] = value;
        });
        return newPlates;
    });
    setSelectedWells(new Set());
  };

  const handleClearParameters = () => {
    if (logType !== 'DNA Extraction' || !dnaExtractionPlates) return;
     setDnaExtractionPlates(prevPlates => {
        if (!prevPlates) return null;
        const newPlates = JSON.parse(JSON.stringify(prevPlates));
        selectedWells.forEach(prefixedWellId => {
            const [platePrefix, wellId] = prefixedWellId.split('-');
            const targetPlateId = platePrefix === 'p1' ? 1 : 2;
            const plateToUpdate = newPlates.find((p: DnaExtractionPlate) => p.plateId === targetPlateId);
            if (plateToUpdate && plateToUpdate.data[wellId]) plateToUpdate.data[wellId].params = {};
        });
        return newPlates;
    });
    setSelectedWells(new Set());
  };

  const runProcessFile = () => {
    if (!logType || !entryCode.trim() || !file) return;
    startAdding(async () => {
      try {
        const fileBuffer = await file.arrayBuffer();
        const additionalData: any = {};
        if (logType === 'Colony PCR') {
            additionalData.positiveWells = Object.fromEntries(Object.entries(positiveWells).map(([k,v]) => [k, Array.from(v)]));
        } else if (logType === 'DNA Extraction' && dnaExtractionPlates) {
            const parameters: any[] = [];
            dnaExtractionPlates.forEach(plate => {
                Object.entries(plate.data).forEach(([wellId, wellData]) => {
                    if (wellData.params.antibiotic) parameters.push({ plate_id: plate.plateId, well_id: wellId, type: 'antibiotic', value: wellData.params.antibiotic });
                    if (wellData.params.temperature) parameters.push({ plate_id: plate.plateId, well_id: wellId, type: 'temperature', value: wellData.params.temperature });
                    if (wellData.params.bacteria) parameters.push({ plate_id: plate.plateId, well_id: wellId, type: 'bacteria', value: wellData.params.bacteria });
                    if (wellData.params.incubationTime) parameters.push({ plate_id: plate.plateId, well_id: wellId, type: 'incubationTime', value: wellData.params.incubationTime });
                    if (wellData.params.prep) parameters.push({ plate_id: plate.plateId, well_id: wellId, type: 'prep', value: wellData.params.prep });
                });
            });
            additionalData.parameters = parameters;
        } else if (logType === 'DNA Quantification') {
            additionalData.sourceMode = quantSource;
            additionalData.sourceDetails = { extractionEntry: sourceExtractionEntry };
        }

        // Build images map with entry code keys for Colony PCR
        const imagesToSave: Record<string, string[]> = {};
        if (logType === 'Colony PCR') {
          Object.keys(plateImages).forEach(plateId => {
            const key = `${entryCode}_${plateId}`;
            if (plateImages[plateId]?.length > 0) imagesToSave[key] = plateImages[plateId];
          });
        }

        const result = await processAndPersist(logType, fileBuffer, entryCode, additionalData, imagesToSave);
        if (result.success && result.payload) {
          setDatabase(logType, {
            buffer: null,
            name: `DuckDB: ${logType}`,
            payload: result.payload,
            images: result.images || {}
          });

          toast({ title: 'Processing Successful', description: `Entry "${entryCode}" has been added and saved.` });
          clearState();
        } else {
          toast({ variant: 'destructive', title: 'Adding to Log Failed', description: result.message });
        }
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'An Error Occurred', description: error.message });
      }
    });
  }

  const handleAddToLog = async () => {
    if (!logType || !entryCode.trim() || !file) return;
    if (logType === 'Colony PCR' && Object.values(positiveWells).every(s => s.size === 0)) {
        setShowConfirmDialog(true);
        return;
    }
    runProcessFile();
  };
  
  const imageUploaderComponent = (imageKey: string, title: string) => (
    <div className="space-y-2">
      {plateImages[imageKey] && plateImages[imageKey].length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-2">
          {plateImages[imageKey].map((imgSrc, index) => (
            <div key={index} className="relative aspect-square">
              <Image src={imgSrc} alt={`${title} ${index + 1}`} fill style={{ objectFit: 'cover' }} className="rounded-md" />
              <Button
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6 z-10 rounded-full"
                onClick={() => handleRemoveImage(imageKey, index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingImage(null);
          if (e.dataTransfer.files) handleImageFiles(e.dataTransfer.files, imageKey);
        }}
        onDragOver={(e) => { e.preventDefault(); setIsDraggingImage(imageKey); }}
        onDragLeave={() => setIsDraggingImage(null)}
        className={cn(
          "flex h-40 w-full items-center justify-center rounded-md border-2 border-dashed transition-colors",
          isDraggingImage === imageKey ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
        )}
      >
        <div className="text-center text-muted-foreground p-2">
          <ImageUp className="w-8 h-8 mx-auto mb-2" />
          <label htmlFor={`image-upload-${imageKey}`} className="text-sm font-semibold text-primary cursor-pointer hover:underline">
            Upload Image(s)
          </label>
          <Input id={`image-upload-${imageKey}`} type="file" className="hidden" accept="image/*" multiple onChange={(e) => handleImageFiles(e.target.files, imageKey)} />
          <p className="text-xs mt-1">or drag and drop</p>
        </div>
      </div>
    </div>
  );

  const isBusy = isProcessing || isAdding || isFetchingWells;
  const showLigationPreview = logType === 'Ligation' && ligationPreviewData && ligationPreviewHeaders;
  const showColonyPcrPreview = logType === 'Colony PCR' && colonyPcrPreviewData;
  const showDnaExtractionPreview = logType === 'DNA Extraction' && dnaExtractionPlates;
  const showDnaQuantificationPreview = logType === 'DNA Quantification' && dnaQuantificationPreview && preparedQuantTable;

  return (
    <div className="flex flex-col items-center space-y-6">
       <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm No Positives</AlertDialogTitle>
            <AlertDialogDescription>You have not marked any wells as positive. Proceed with no positive results?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowConfirmDialog(false); runProcessFile(); }}>Confirm & Proceed</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="w-full max-w-5xl">
        <Card>
          <CardHeader>
            <CardTitle>Log Uploader</CardTitle>
            <CardDescription>Select log type, review data, and click Add to log.</CardDescription>
          </CardHeader>
          <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <div className="space-y-4">
                  <div className="space-y-2">
                      <Label htmlFor="log-type">Log Type</Label>
                      <Select onValueChange={(value) => { clearState(); setLogType(value as LogType); }} value={logType || ''} disabled={isBusy}>
                          <SelectTrigger id="log-type"><SelectValue placeholder="Select a log type..." /></SelectTrigger>
                          <SelectContent>{LOG_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                      </Select>
                  </div>

                  {logType && logType !== 'DNA Quantification' && (
                    <div className="space-y-2">
                        <Label htmlFor="entry-code">Entry Code</Label>
                        <Input id="entry-code" placeholder="e.g., U0127-Ligation-FL" value={entryCode} onChange={(e) => setEntryCode(e.target.value)} disabled={isBusy} />
                    </div>
                  )}

                  {logType === 'DNA Quantification' && (
                    <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                        <div className="space-y-2">
                            <Label>Sample Source</Label>
                            <Select onValueChange={(v) => { setQuantSource(v as DnaQuantificationSource); setPreparedQuantTable(null); }} value={quantSource || ''}>
                                <SelectTrigger><SelectValue placeholder="Select source..." /></SelectTrigger>
                                <SelectContent>{DNA_QUANTIFICATION_SOURCES.map(src => <SelectItem key={src} value={src}>{src}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        {quantSource === 'Extraction Plate' && (
                            <div className="space-y-2">
                                <Label>Extraction Entry</Label>
                                <Select onValueChange={setSourceExtractionEntry} value={sourceExtractionEntry}>
                                    <SelectTrigger><SelectValue placeholder="Select entry..." /></SelectTrigger>
                                    <SelectContent>{extractionEntries.map(entry => <SelectItem key={entry.id} value={entry.name}>{entry.name}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <Button onClick={handleAddToLog} disabled={isBusy || (!showLigationPreview && !showColonyPcrPreview && !showDnaExtractionPreview && !showDnaQuantificationPreview) || !entryCode.trim()}>
                      {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Add to Log
                    </Button>
                    <Button variant="secondary" onClick={clearState} disabled={isBusy || (!file && !entryCode)}>
                      <X className="mr-2 h-4 w-4"/>Clear
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2 h-full flex flex-col">
                    <Label htmlFor="log-file">Log Excel File</Label>
                    <div
                        onDrop={handleDrop}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        className={cn(
                            "flex flex-1 flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
                            isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                            file && !isProcessing && "border-primary",
                            (!logType || (logType === 'DNA Quantification' && !quantSource)) && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <FileUp className="w-10 h-10 text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">
                            <label htmlFor="log-file" className={cn("font-semibold text-primary cursor-pointer hover:underline", (!logType || (logType === 'DNA Quantification' && !quantSource)) && "pointer-events-none")}>
                                Click to upload
                            </label> or drag and drop
                        </p>
                        <p className="text-xs text-muted-foreground">.xlsx or .xls file</p>
                        <Input id="log-file" type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileChange} disabled={isBusy || !logType || (logType === 'DNA Quantification' && !quantSource)}/>
                        {file && !isBusy && <p className="mt-4 text-sm font-medium text-center">Selected: {file.name}</p>}
                        {logType === 'DNA Quantification' && !quantSource && <p className="mt-2 text-xs text-destructive flex items-center gap-1"><Info className="w-3 h-3" /> Select source first</p>}
                    </div>
                </div>
              </div>
          </CardContent>
        </Card>
      </div>
      
      {isBusy && <div className="flex items-center justify-center p-8 text-muted-foreground"><Loader2 className="mr-3 h-6 w-6 animate-spin" /><span className="text-lg">Working...</span></div>}

      {showDnaQuantificationPreview && (
        <div className="w-full max-w-5xl space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">Quantification Configuration</CardTitle>
                    <CardDescription>Adjust rows and pooling before merging with spectrophotometer data.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-end gap-6">
                    <div className="space-y-2">
                        <Label>Starting Row in Excel</Label>
                        <div className="flex gap-2">
                            <Input type="number" min={1} value={quantStartingRow} onChange={(e) => setQuantStartingRow(Number(e.target.value))} className="w-24" />
                            <Button variant="outline" size="sm" onClick={() => toast({ title: 'Row Set', description: `Data will be read starting from row ${quantStartingRow}.` })}>
                                <ArrowDownToLine className="w-4 h-4 mr-2" /> Set Row
                            </Button>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2 pb-2">
                        <Checkbox id="pooled" checked={includePooledReplicates} onCheckedChange={(v) => setIncludePooledReplicates(!!v)} />
                        <label htmlFor="pooled" className="text-sm font-medium leading-none">Include pooled replicates</label>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Hash className="w-6 h-6"/> Merged Reference Table</CardTitle>
                    <CardDescription>Source: {quantSource} {sourceExtractionEntry && `(${sourceExtractionEntry})`}. Ready to map results.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="relative w-full overflow-auto rounded-md border max-h-[600px]">
                        <Table>
                            <TableHeader className="sticky top-0 z-20 bg-muted/80 backdrop-blur-sm">
                                <TableRow>
                                    {Object.keys(preparedQuantTable[0]).map((h, i) => (
                                        <TableHead key={i} className="whitespace-nowrap">{h}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {preparedQuantTable.map((row, i) => (
                                    <TableRow key={i}>
                                        {Object.keys(row).map((h, j) => (
                                            <TableCell key={j} className="whitespace-nowrap">
                                                {row[h] || <span className="text-muted-foreground italic text-xs">pending parse...</span>}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
      )}

      {showLigationPreview && (
        <div className='w-full max-w-5xl space-y-6'>
            <Card><CardHeader><CardTitle>Preview Data</CardTitle></CardHeader><CardContent><div className="relative w-full overflow-auto rounded-md border">
                <Table><TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm"><TableRow>{ligationPreviewHeaders.map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{ligationPreviewData.map((row, i) => <TableRow key={i}>{ligationPreviewHeaders.map((h, j) => <TableCell key={j}>{String(row[h] ?? '')}</TableCell>)}</TableRow>)}</TableBody></Table>
            </div></CardContent></Card>
        </div>
      )}

      {showColonyPcrPreview && (
        <div className="w-full max-w-5xl space-y-8">
            {colonyPcrPreviewData.map((plate) => {
              const pId = String(plate.plateId);
              return (
                <Card key={pId}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Microscope className="w-6 h-6"/> {entryCode} - {plate.sheetName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className='max-w-4xl mx-auto'>
                      <div className="rounded-md border">
                        <ColonyPcrGrid 
                          plateData={transformColonyPcrData(plate.gridData)} 
                          positiveWells={positiveWells[pId] || new Set()} 
                          onTogglePositive={(id) => handleTogglePositive(pId, id)} 
                        />
                      </div>
                    </div>
                    <div className="grid md:grid-cols-10 gap-6">
                      <div className="md:col-span-7">
                        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><Dna className="w-5 h-5"/>Samples</h3>
                        <div className="relative w-full overflow-auto rounded-md border">
                            {plate.samplesData.length > 0 ? (
                                <Table>
                                    <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                                        <TableRow>
                                            {plate.samplesHeaders.map((header: string) => <TableHead key={header}>{header}</TableHead>)}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {plate.samplesData.map((row: any, rowIndex: number) => (
                                            <TableRow key={rowIndex}>
                                                {plate.samplesHeaders.map((header: string) => <TableCell key={`${rowIndex}-${header}`}>{row[header]}</TableCell>)}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground">No sample data found.</div>
                            )}
                        </div>
                      </div>
                      <div className="md:col-span-3">
                        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><ImageUp className="w-5 h-5"/>Result Image(s)</h3>
                        {imageUploaderComponent(pId, `Plate ${plate.plateId}`)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}

      {showDnaExtractionPreview && (
        <div className="w-full max-w-5xl mx-auto space-y-8">
            <DnaExtractionControlPanel onApplyParameter={handleApplyParameter} onClearParameters={handleClearParameters} hasSelection={selectedWells.size > 0} />
            {dnaExtractionPlates.map((plate) => (
                <Card key={plate.plateId}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Dna className="w-6 h-6"/> Extraction Plate {plate.plateId}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-md border">
                      <DnaExtractionGrid 
                        plateData={plate.data} 
                        platePrefix={plate.plateId === 1 ? 'p1' : 'p2'} 
                        colOffset={plate.plateId === 1 ? 0 : 6} 
                        selectedWells={selectedWells} 
                        onWellSelect={handleWellSelect} 
                        onBulkSelect={handleBulkSelect} 
                      />
                    </div>
                    <DnaExtractionLegend plateData={plate.data} />
                  </CardContent>
                </Card>
            ))}
        </div>
      )}
    </div>
  );
}
