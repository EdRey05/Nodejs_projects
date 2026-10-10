"use client";

import { useState, useCallback, useEffect } from "react";
import type { PlateData, Sample as SampleType } from "@/lib/types";
import { generatePlateData } from "@/lib/utils";
import { PlateGrid } from "./_components/plate-grid";
import { SamplePalette } from "./_components/sample-palette";
import { ControlPanel } from "./_components/control-panel";
import { ExcelManager } from "./_components/excel-manager";
import { Separator } from "@/components/ui/separator";
import { useAppContext } from "../_context/AppContext";

const initialSamples: SampleType[] = [
  { id: "s1", name: "S1", color: "bg-red-500" },
  { id: "s2", name: "S2", color: "bg-blue-500" },
  { id: "s3", name: "S3", color: "bg-green-500" },
  { id: "s4", name: "S4", color: "bg-purple-500" },
  { id: "s5", name: "CTRL", color: "bg-gray-500" },
];

export default function PlateDesignerPage() {
  const { updateContext } = useAppContext();
  const [plate96Data, setPlate96Data] = useState<PlateData>(() => generatePlateData(8, 12));
  const [plate48Data, setPlate48Data] = useState<PlateData>(() => generatePlateData(8, 6));
  const [selectedWells, setSelectedWells] = useState<Set<string>>(new Set());
  const [draggedItem, setDraggedItem] = useState<{ type: 'sample' | 'well', item: SampleType | { wellId: string, sampleId: string }} | null>(null);
  const [draggedOverWell, setDraggedOverWell] = useState<string | null>(null);

  const usedSampleIds = new Set([
      ...Object.values(plate96Data).filter(w => w.sample).map(w => w.sample!.id),
      ...Object.values(plate48Data).filter(w => w.sample).map(w => w.sample!.id)
  ]);

  useEffect(() => {
    const context = {
      page: "Plate Designer",
      selectedWells: Array.from(selectedWells),
      plate96Status: Object.values(plate96Data).filter(w => w.sample || Object.keys(w.params).length > 0),
      plate48Status: Object.values(plate48Data).filter(w => w.sample || Object.keys(w.params).length > 0),
    };
    updateContext(JSON.stringify(context, null, 2));
  }, [plate96Data, plate48Data, selectedWells, updateContext]);

  const updatePlateData = (
    plateSetter: React.Dispatch<React.SetStateAction<PlateData>>,
    wellId: string,
    updates: Partial<{ sample: SampleType | null, params: any }>
  ) => {
    plateSetter(prev => ({
      ...prev,
      [wellId]: { ...prev[wellId], ...updates },
    }));
  };

  const handleWellSelect = useCallback((wellId: string, isCtrlKey: boolean) => {
    setSelectedWells(prev => {
      const newSelection = new Set(prev);
      if (isCtrlKey) {
        newSelection.has(wellId) ? newSelection.delete(wellId) : newSelection.add(wellId);
      } else {
        if (newSelection.size === 1 && newSelection.has(wellId)) {
          return new Set();
        }
        return new Set([wellId]);
      }
      return newSelection;
    });
  }, []);

  const handleBulkSelect = (type: 'row' | 'col', key: string | number) => {
    const is96Well = (typeof key === 'number' && key > 6) || (selectedWells.values().next().value || '').includes('7');
    const rows = 8;
    const cols = is96Well ? 12 : 6;
    
    const wellsToSelect = new Set<string>();
    if(type === 'row') {
      for(let i=1; i<=cols; i++) wellsToSelect.add(`${key}${i}`);
    } else {
      for(let i=0; i<rows; i++) wellsToSelect.add(`${String.fromCharCode(65+i)}${key}`);
    }
    setSelectedWells(wellsToSelect);
  }

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, item: SampleType | { wellId: string, sampleId: string }, type: 'sample' | 'well') => {
    setDraggedItem({ type, item });
    if (type === 'sample') e.dataTransfer.setData("text/plain", (item as SampleType).id);
    else e.dataTransfer.setData("text/plain", (item as {sampleId: string}).sampleId);
  };
  
  const handleWellDrop = (e: React.DragEvent<HTMLDivElement>, targetWellId: string) => {
    e.preventDefault();
    setDraggedOverWell(null);
    if (!draggedItem) return;

    const targetPlateSetter = targetWellId.length > 2 || parseInt(targetWellId.substring(1)) > 6 ? setPlate96Data : setPlate48Data;
    const sampleToDrop = draggedItem.type === 'sample' ? draggedItem.item as SampleType : initialSamples.find(s => s.id === (draggedItem.item as any).sampleId);

    if (draggedItem.type === 'well') {
      const sourceWellId = (draggedItem.item as any).wellId;
      const sourcePlateSetter = sourceWellId.length > 2 || parseInt(sourceWellId.substring(1)) > 6 ? setPlate96Data : setPlate48Data;
      updatePlateData(sourcePlateSetter, sourceWellId, { sample: null });
    }
    
    updatePlateData(targetPlateSetter, targetWellId, { sample: sampleToDrop });
    setDraggedItem(null);
  };

  const handleDropInTrash = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (draggedItem?.type === 'well') {
        const sourceWellId = (draggedItem.item as any).wellId;
        const sourcePlateSetter = sourceWellId.length > 2 || parseInt(sourceWellId.substring(1)) > 6 ? setPlate96Data : setPlate48Data;
        updatePlateData(sourcePlateSetter, sourceWellId, { sample: null });
    }
    setDraggedItem(null);
  }

  const handleApplyParameter = (type: 'antibiotic' | 'temperature', value: string) => {
    const setters = { '96': setPlate96Data, '48': setPlate48Data };
    selectedWells.forEach(wellId => {
      const plateType = wellId.length > 2 || parseInt(wellId.substring(1)) > 6 ? '96' : '48';
      setters[plateType](prev => ({
        ...prev,
        [wellId]: { ...prev[wellId], params: { ...prev[wellId].params, [type]: value } }
      }));
    });
  };

  const handleClearParameters = () => {
    const setters = { '96': setPlate96Data, '48': setPlate48Data };
    selectedWells.forEach(wellId => {
      const plateType = wellId.length > 2 || parseInt(wellId.substring(1)) > 6 ? '96' : '48';
      setters[plateType](prev => ({
        ...prev,
        [wellId]: { ...prev[wellId], params: {} }
      }));
    });
  };

  const commonGridProps = {
    selectedWells,
    onWellSelect: handleWellSelect,
    onWellDrop: handleWellDrop,
    onBulkSelect: handleBulkSelect,
    draggedOverWell,
    onWellDragEnter: setDraggedOverWell,
    onWellDragLeave: () => setDraggedOverWell(null),
  };
  
  return (
    <div className="space-y-6">
      <ControlPanel
        onApplyParameter={handleApplyParameter}
        onClearParameters={handleClearParameters}
        hasSelection={selectedWells.size > 0}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <PlateGrid
              {...commonGridProps}
              plateData={plate96Data}
              rows={8}
              cols={12}
              title="96-Well Plate"
              onWellDragStart={(e, wellId, sampleId) => handleDragStart(e, { wellId, sampleId }, 'well')}
          />
          <PlateGrid
              {...commonGridProps}
              plateData={plate48Data}
              rows={8}
              cols={6}
              title="48-Well Plate"
              onWellDragStart={(e, wellId, sampleId) => handleDragStart(e, { wellId, sampleId }, 'well')}
          />
      </div>

      <SamplePalette
        samples={initialSamples}
        usedSampleIds={usedSampleIds}
        onDragStart={(e, sample) => handleDragStart(e, sample, 'sample')}
        onDropInTrash={handleDropInTrash}
      />
      
      <Separator />

      <ExcelManager />
    </div>
  );
}
