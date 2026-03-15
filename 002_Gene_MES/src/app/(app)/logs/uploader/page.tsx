'use client';
import { useState, useTransition, useCallback } from 'react';
import Image from 'next/image';
import { useDatabase } from '../../_context/DatabaseContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, X, FileUp, Microscope, Dna, ImageUp } from 'lucide-react';
import { previewFile, processFile } from '@/app/actions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { LOG_TYPES, LogType, PlateData } from '@/lib/types';
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
  
  const [logType, setLogType] = useState<LogType | null>(null);
  const [entryCode, setEntryCode] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [ligationPreviewData, setLigationPreviewData] = useState<any[] | null>(null);
  const [ligationPreviewHeaders, setLigationPreviewHeaders] = useState<string[] | null>(null);
  const [colonyPcrPreviewData, setColonyPcrPreviewData] = useState<any[] | null>(null);
  const [dnaExtractionPlates, setDnaExtractionPlates] = useState<DnaExtractionPlate[] | null>(null);
  const [selectedWells, setSelectedWells] = useState<Set<string>>(new Set());
  
  const [positiveWells, setPositiveWells] = useState<Record<string, Set<string>>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [plateImages, setPlateImages] = useState<Record<string, string[]>>({});
  const [isDraggingImage, setIsDraggingImage] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const clearState = () => {
    setFile(null);
    setLigationPreviewData(null);
    setLigationPreviewHeaders(null);
    setColonyPcrPreviewData(null);
    setDnaExtractionPlates(null);
    setPositiveWells({});
    setSelectedWells(new Set());
    setPlateImages({});
    setEntryCode('');
    const fileInput = document.getElementById('log-file') as HTMLInputElement;
    if(fileInput) fileInput.value = '';
  };

  const handleFile = (selectedFile: File | null) => {
    if (!selectedFile) {
        clearState();
        return;
    }
    if (!logType) {
        toast({ variant: 'destructive', title: 'Log Type Not Selected', description: 'Please select a log type before uploading a file.' });
        return;
    }

    setFile(selectedFile);
    setLigationPreviewData(null);
    setLigationPreviewHeaders(null);
    setColonyPcrPreviewData(null);
    setDnaExtractionPlates(null);
    setPositiveWells({});
    setSelectedWells(new Set());
    setPlateImages({});

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
                }
                toast({
                    title: 'File Ready for Review',
                    description: result.message,
                });
            } else {
                toast({
                    variant: 'destructive',
                    title: 'File Parsing Failed',
                    description: result.message,
                });
                clearState();
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'An Error Occurred',
                description: error.message || 'Could not process the file.',
            });
            clearState();
        }
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0] || null);
  };
  
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      handleFile(event.dataTransfer.files[0]);
      event.dataTransfer.clearData();
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };
  
  const handleTogglePositive = (plateId: string, wellId: string) => {
    setPositiveWells(prev => {
        const newPlatePositives = new Set(prev[plateId] || []);
        if (newPlatePositives.has(wellId)) {
            newPlatePositives.delete(wellId);
        } else {
            newPlatePositives.add(wellId);
        }
        return {
            ...prev,
            [plateId]: newPlatePositives,
        };
    });
  };
  
  const handleWellSelect = useCallback((prefixedWellId: string, isCtrlKey: boolean) => {
    setSelectedWells(prev => {
      const newSelection = new Set(prev);
      if (isCtrlKey) {
        newSelection.has(prefixedWellId) ? newSelection.delete(prefixedWellId) : newSelection.add(prefixedWellId);
      } else {
        if (newSelection.size === 1 && newSelection.has(prefixedWellId)) {
          return new Set();
        }
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
          if (plate.data[wellId]?.content?.trim()) { // Check if well is not empty
            wellsToSelect.add(`${platePrefix}-${wellId}`);
          }
      }
    } else { // type === 'col'
      for (let i = 0; i < rows; i++) {
        const rowLabel = String.fromCharCode(65 + i);
        // key is the column label (e.g. 7). We need the inner well ID (e.g. A1 for plate 2's grid).
        const gridCol = (Number(key) - 1) % 6 + 1;
        const wellId = `${rowLabel}${gridCol}`;
        if (plate.data[wellId]?.content?.trim()) { // Check if well is not empty
            wellsToSelect.add(`${platePrefix}-${wellId}`);
        }
      }
    }
    
    const allSelected = Array.from(wellsToSelect).every(well => selectedWells.has(well));
    
    if (allSelected && wellsToSelect.size > 0) { // Check size > 0 in case the whole row/col is empty
       setSelectedWells(prev => {
            const newSelection = new Set(prev);
            wellsToSelect.forEach(well => newSelection.delete(well));
            return newSelection;
       });
    } else {
        setSelectedWells(prev => new Set([...prev, ...wellsToSelect]));
    }
  }
  
  const handleApplyParameter = (type: 'antibiotic' | 'temperature', value: string) => {
    if (logType !== 'DNA Extraction' || !dnaExtractionPlates) return;

    setDnaExtractionPlates(prevPlates => {
        if (!prevPlates) return null;
        
        const newPlates = JSON.parse(JSON.stringify(prevPlates));

        selectedWells.forEach(prefixedWellId => {
            const [platePrefix, wellId] = prefixedWellId.split('-');
            const targetPlateId = platePrefix === 'p1' ? 1 : 2;

            const plateToUpdate = newPlates.find((p: DnaExtractionPlate) => p.plateId === targetPlateId);
            if (plateToUpdate && plateToUpdate.data[wellId]) {
                plateToUpdate.data[wellId].params[type] = value;
            }
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
            if (plateToUpdate && plateToUpdate.data[wellId]) {
                plateToUpdate.data[wellId].params = {};
            }
        });
        return newPlates;
    });
    setSelectedWells(new Set());
  };

  const handleImageFiles = (files: FileList | null, imageKey: string) => {
    if (!files || files.length === 0) {
      return;
    }

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) {
        toast({
          variant: 'destructive',
          title: 'Invalid File Type',
          description: `File "${file.name}" is not an image and was skipped.`,
        });
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
      reader.onerror = () => {
        toast({
          variant: 'destructive',
          title: 'File Read Error',
          description: `Could not read the image file "${file.name}".`,
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveImage = (imageKey: string, imageIndex: number) => {
    setPlateImages(prev => {
        const newImages = (prev[imageKey] || []).filter((_, index) => index !== imageIndex);
        return {
            ...prev,
            [imageKey]: newImages,
        };
    });
  };

  const transformGridDataToPlateData = (gridData: any[]): PlateData => {
    const plateData: PlateData = {};
    const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    gridData.forEach((row, rowIndex) => {
        const rowLabel = rowLabels[rowIndex];
        for (let i = 1; i <= 12; i++) {
            const colKey = `C${i}`;
            const wellId = `${rowLabel}${i}`;
            plateData[wellId] = {
                id: wellId,
                sample: null,
                params: {},
                content: row[colKey] || ''
            };
        }
    });
    return plateData;
  };

  const runProcessFile = () => {
    if (!logType || !entryCode.trim() || !file) {
      toast({ variant: 'destructive', title: 'Missing Information', description: 'Please ensure log type, entry code, and a file are provided.' });
      return;
    }
    
    const db = databases[logType]?.buffer || null;

    startAdding(async () => {
      try {
        const fileBuffer = await file.arrayBuffer();
        
        const additionalData: any = {};
        if (logType === 'Colony PCR') {
            const wellsData: Record<string, string[]> = {};
            for(const plateId in positiveWells) {
                wellsData[plateId] = Array.from(positiveWells[plateId]);
            }
            additionalData.positiveWells = wellsData;
        } else if (logType === 'DNA Extraction' && dnaExtractionPlates) {
            const parameters: { plate_id: number; well_id: string; type: 'antibiotic' | 'temperature'; value: string }[] = [];
            dnaExtractionPlates.forEach(plate => {
                Object.entries(plate.data).forEach(([wellId, wellData]) => {
                    if (wellData.params.antibiotic) {
                        parameters.push({ plate_id: plate.plateId, well_id: wellId, type: 'antibiotic', value: wellData.params.antibiotic });
                    }
                    if (wellData.params.temperature) {
                        parameters.push({ plate_id: plate.plateId, well_id: wellId, type: 'temperature', value: wellData.params.temperature });
                    }
                });
            });
            additionalData.parameters = parameters;
        }

        const result = await processFile(logType, db, fileBuffer, entryCode, additionalData);

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
          const currentDb = databases[logType];
          const newDbName = currentDb?.name || `${logType.toLowerCase().replace(/ /g, '_')}_db.xlsx`;
          
          const newImages = { ...(currentDb?.images || {}) };
          if (logType === 'Colony PCR') {
              Object.keys(plateImages).forEach(plateId => {
                  const key = `${entryCode}_${plateId}`;
                  if (plateImages[plateId]?.length > 0) {
                    newImages[key] = plateImages[plateId];
                  }
              });
          } else if (logType === 'Ligation') {
              const entryImages = plateImages['ligation_entry'];
              if (entryImages?.length > 0) {
                  const key = `${entryCode}`;
                  newImages[key] = entryImages;
              }
          }
          const imagesToSave = newImages;

          setDatabase(logType, { 
              buffer: byteArray.buffer, 
              name: newDbName,
              images: imagesToSave
          });

          clearState();
        } else {
          toast({
            variant: 'destructive',
            title: 'Adding to Log Failed',
            description: result.message,
          });
        }
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'An Error Occurred',
          description: error.message || 'Could not add data to the log.',
        });
      }
    });
  }

  const handleAddToLog = async () => {
    if (!logType || !entryCode.trim() || !file) return;

    if (logType === 'Colony PCR') {
        const totalPositives = Object.values(positiveWells).reduce((acc, set) => acc + set.size, 0);
        if (totalPositives === 0) {
            setShowConfirmDialog(true);
            return;
        }
    }

    runProcessFile();
  };
  
  const isBusy = isProcessing || isAdding;
  const showLigationPreview = logType === 'Ligation' && ligationPreviewData && ligationPreviewHeaders;
  const showColonyPcrPreview = logType === 'Colony PCR' && colonyPcrPreviewData;
  const showDnaExtractionPreview = logType === 'DNA Extraction' && dnaExtractionPlates;

  const imageUploaderComponent = (imageKey: string, title: string) => (
    <div className="space-y-2">
      {plateImages[imageKey] && plateImages[imageKey].length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
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
          e.stopPropagation();
          setIsDraggingImage(null);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleImageFiles(e.dataTransfer.files, imageKey);
            e.dataTransfer.clearData();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingImage(imageKey);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingImage(null);
        }}
        className={cn(
          "relative flex h-40 w-full items-center justify-center rounded-md border-2 border-dashed transition-colors",
          isDraggingImage === imageKey ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
        )}
      >
        <div className="text-center text-muted-foreground p-2">
          <ImageUp className="w-8 h-8 mx-auto mb-2" />
          <label htmlFor={`image-upload-${imageKey}`} className="text-sm font-semibold text-primary cursor-pointer hover:underline">
            Upload Image(s)
          </label>
          <p className="text-xs mt-1">or drag and drop</p>
          <Input id={`image-upload-${imageKey}`} type="file" className="hidden" accept="image/png, image/jpeg" multiple onChange={(e) => handleImageFiles(e.target.files, imageKey)} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center space-y-6">
       <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm No Positives</AlertDialogTitle>
            <AlertDialogDescription>
              You have not marked any wells as positive. Are you sure you want to proceed and add this entry to the log with no positive results?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShowConfirmDialog(false);
              runProcessFile();
            }}>
              Confirm & Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="w-full max-w-5xl">
        <Card>
          <CardHeader>
            <CardTitle>Log Uploader</CardTitle>
            <CardDescription>
              Select a log type, provide a unique code, and upload an Excel file. Review the data and if it's correct, click Add to log.
            </CardDescription>
          </CardHeader>
          <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <div className="space-y-4">
                  <div className="space-y-2">
                      <Label htmlFor="log-type">Log Type</Label>
                      <Select onValueChange={(value) => {
                        clearState();
                        setLogType(value as LogType);
                      }} value={logType || ''} disabled={isBusy}>
                          <SelectTrigger id="log-type">
                              <SelectValue placeholder="Select a log type..." />
                          </SelectTrigger>
                          <SelectContent>
                              {LOG_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                          </SelectContent>
                      </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="entry-code">Entry Code</Label>
                    <Input 
                      id="entry-code"
                      placeholder="e.g., U0127-Ligation-FL"
                      value={entryCode}
                      onChange={(e) => setEntryCode(e.target.value)}
                      disabled={isBusy}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <Button onClick={handleAddToLog} disabled={isBusy || (!showLigationPreview && !showColonyPcrPreview && !showDnaExtractionPreview) || !entryCode.trim()}>
                      {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Add to Log
                    </Button>
                    <Button variant="secondary" onClick={clearState} disabled={isBusy || (!file && !entryCode)}>
                      <X className="mr-2 h-4 w-4"/>
                      Clear
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2 h-full flex flex-col">
                    <Label htmlFor="log-file">Log Excel File</Label>
                    <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        className={cn(
                            "flex flex-1 flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
                            isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                            file && !isProcessing && "border-primary"
                        )}
                    >
                        <FileUp className="w-10 h-10 text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">
                            <label htmlFor="log-file" className={cn("font-semibold text-primary cursor-pointer hover:underline", !logType && "cursor-not-allowed text-muted-foreground")}>
                                Click to upload
                            </label>
                            {' '}or drag and drop
                        </p>
                        <p className="text-xs text-muted-foreground">.xlsx or .xls file</p>
                        <Input id="log-file" type="file" className="hidden" accept=".xlsx, .xls" onChange={handleFileChange} disabled={isBusy || !logType}/>
                        {file && !isBusy && <p className="mt-4 text-sm font-medium text-center">Selected: {file.name}</p>}
                    </div>
                </div>
              </div>
          </CardContent>
        </Card>
      </div>
      
      {isProcessing && (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          <Loader2 className="mr-3 h-6 w-6 animate-spin" />
          <span className="text-lg">Processing file...</span>
        </div>
      )}

      {showLigationPreview && (
        <div className='w-full max-w-5xl space-y-6'>
            <Card>
                <CardHeader>
                    <CardTitle>Preview Data</CardTitle>
                    <CardDescription>{ligationPreviewData.length} rows will be added to the database.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="relative w-full overflow-auto rounded-md border">
                        <Table>
                            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                                <TableRow>
                                    {ligationPreviewHeaders.map((header, index) => (
                                    <TableHead key={`${header}-${index}`} className="whitespace-nowrap">{header}</TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {ligationPreviewData.map((row, rowIndex) => (
                                    <TableRow key={rowIndex} className="hover:bg-secondary">
                                        {ligationPreviewHeaders.map((header, headerIndex) => (
                                            <TableCell key={`${rowIndex}-${header}-${headerIndex}`} className="whitespace-nowrap">
                                            {String(row[header] ?? '')}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><ImageUp className="w-5 h-5"/>Result Image(s)</CardTitle>
                    <CardDescription>Upload images for the "{entryCode}" entry.</CardDescription>
                </CardHeader>
                <CardContent>
                    {imageUploaderComponent('ligation_entry', `Ligation entry ${entryCode}`)}
                </CardContent>
            </Card>
        </div>
      )}

      {showColonyPcrPreview && (
        <div className="w-full max-w-5xl space-y-8">
            {colonyPcrPreviewData.map((plate, plateIndex) => {
              const plateIdString = String(plate.plateId);
              const transformedGridData = transformGridDataToPlateData(plate.gridData);
              return (
                <Card key={plate.plateId}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Microscope className="w-6 h-6"/> {entryCode} - {plate.sheetName}</CardTitle>
                        <CardDescription>Previewing data for plate {plate.plateId}. Click wells to mark as positive.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className='max-w-4xl mx-auto'>
                            <h3 className="text-lg font-semibold mb-2">Plate Map</h3>
                             <div className="rounded-md border">
                                <ColonyPcrGrid 
                                    plateData={transformedGridData}
                                    positiveWells={positiveWells[plateIdString] || new Set()}
                                    onTogglePositive={(wellId) => handleTogglePositive(plateIdString, wellId)}
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
                                {imageUploaderComponent(plateIdString, `Plate ${plate.plateId}`)}
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                       <p className="text-xs text-muted-foreground">
                         Marked {positiveWells[plateIdString]?.size || 0} wells as positive.
                       </p>
                    </CardFooter>
                </Card>
              );
            })}
        </div>
      )}

      {showDnaExtractionPreview && (
        <div className="w-full max-w-5xl mx-auto space-y-8">
            <DnaExtractionControlPanel 
              onApplyParameter={handleApplyParameter}
              onClearParameters={handleClearParameters}
              hasSelection={selectedWells.size > 0}
            />
            {dnaExtractionPlates.map((plate) => {
                const platePrefix = plate.plateId === 1 ? 'p1' : 'p2';
                const colOffset = plate.plateId === 1 ? 0 : 6;
                return (
                    <div key={plate.plateId}>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><Dna className="w-6 h-6"/> Extraction Plate {plate.plateId}</CardTitle>
                                <CardDescription>Previewing data for plate {plate.plateId}.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className='mx-auto'>
                                    <div className="rounded-md border">
                                        <DnaExtractionGrid
                                          plateData={plate.data}
                                          platePrefix={platePrefix}
                                          colOffset={colOffset}
                                          selectedWells={selectedWells}
                                          onWellSelect={handleWellSelect}
                                          onBulkSelect={handleBulkSelect}
                                        />
                                    </div>
                                    <DnaExtractionLegend plateData={plate.data} />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                );
            })}
        </div>
      )}

    </div>
  );
}
