"use client";

import { useState, useCallback, useEffect } from "react";
import type { PlateData, Sample as SampleType } from "@/lib/types";
import { generatePlateData } from "@/lib/utils";
import { PlateGrid } from "./_components/plate-grid";
import { SamplePalette } from "./_components/sample-palette";
import { ControlPanel } from "./_components/control-panel";
import { ExcelManager } from "./_components/excel-manager";
import { Separator } from "@/components/ui/separator";
import { useAppContext } from "../../_context/AppContext";

const initialSamples: SampleType[] = [
  { id: "s1", name: "S1", color: "bg-red-500" },
  { id: "s2", name: "S2", color: "bg-blue-500" },
  { id: "s3", name: "S3", color: "bg-green-500" },
  { id: "s4", name: "S4", color: "bg-purple-500" },
  { id: "s5", name: "CTRL", color: "bg-gray-500" },
];

type DraggedItem = { type: 'sample', item: SampleType } | { type: 'well', item: { wellId: string, sampleId: string, plateId: 'plate96' | 'plate48' } };

export default function WidgetPlaygroundPage() {
  const { updateContext } = useAppContext();
  const [plate96Data, setPlate96Data] = useState<PlateData>(() => generatePlateData(8, 12));
  const [plate48Data, setPlate48Data] = useState<PlateData>(() => generatePlateData(8, 6));
  const [selectedWells, setSelectedWells] = useState<Set<string>>(new Set());
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);
  const [draggedOverWell, setDraggedOverWell] = useState<string | null>(null);

  const usedSampleIds = new Set([
      ...Object.values(plate96Data).filter(w => w.sample).map(w => w.sample!.id),
      ...Object.values(plate48Data).filter(w => w.sample).map(w => w.sample!.id)
  ]);

  useEffect(() => {
    const context = {
      page: "Widget Playground",
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
    const plateData = (typeof key === 'number' && key > 6) || (selectedWells.values().next().value || '').includes('7') ? plate96Data : plate48Data;
    const rows = 8;
    const cols = Object.keys(plateData).length / rows;
    
    const wellsToSelect = new Set<string>();
    if(type === 'row') {
      for(let i=1; i<=cols; i++) wellsToSelect.add(`${key}${i}`);
    } else {
      for(let i=0; i<rows; i++) wellsToSelect.add(`${String.fromCharCode(65+i)}${key}`);
    }
    setSelectedWells(wellsToSelect);
  }

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, item: SampleType | { wellId: string, sampleId: string, plateId: 'plate96' | 'plate48' }, type: 'sample' | 'well') => {
    setDraggedItem({ type, item } as DraggedItem);
    if (type === 'sample') e.dataTransfer.setData("text/plain", (item as SampleType).id);
    else e.dataTransfer.setData("text/plain", (item as {sampleId: string}).sampleId);
  };
  
  const handleWellDrop = (e: React.DragEvent<HTMLDivElement>, targetWellId: string, targetPlateId: 'plate96' | 'plate48') => {
    e.preventDefault();
    setDraggedOverWell(null);
    if (!draggedItem) return;

    const targetPlateSetter = targetPlateId === 'plate96' ? setPlate96Data : setPlate48Data;
    let sampleToDrop: SampleType | undefined;

    if (draggedItem.type === 'sample') {
        sampleToDrop = draggedItem.item;
    } else { // type === 'well'
        sampleToDrop = initialSamples.find(s => s.id === draggedItem.item.sampleId);
        const { wellId: sourceWellId, plateId: sourcePlateId } = draggedItem.item;
        const sourcePlateSetter = sourcePlateId === 'plate96' ? setPlate96Data : setPlate48Data;
        updatePlateData(sourcePlateSetter, sourceWellId, { sample: null });
    }
    
    if(sampleToDrop) {
      updatePlateData(targetPlateSetter, targetWellId, { sample: sampleToDrop });
    }
    setDraggedItem(null);
  };

  const handleDropInTrash = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (draggedItem?.type === 'well') {
        const { wellId, plateId } = draggedItem.item;
        const sourcePlateSetter = plateId === 'plate96' ? setPlate96Data : setPlate48Data;
        updatePlateData(sourcePlateSetter, wellId, { sample: null });
    }
    setDraggedItem(null);
  }

  const handleApplyParameter = (type: 'antibiotic' | 'temperature', value: string) => {
    selectedWells.forEach(wellId => {
        const plateSetter = (wellId.length > 2 || parseInt(wellId.substring(1)) > 6) ? setPlate96Data : setPlate48Data;
        plateSetter(prev => ({
            ...prev,
            [wellId]: { ...prev[wellId], params: { ...prev[wellId].params, [type]: value } }
        }));
    });
  };

  const handleClearParameters = () => {
    selectedWells.forEach(wellId => {
        const plateSetter = (wellId.length > 2 || parseInt(wellId.substring(1)) > 6) ? setPlate96Data : setPlate48Data;
        plateSetter(prev => ({
            ...prev,
            [wellId]: { ...prev[wellId], params: {} }
        }));
    });
  };

  const commonGridProps = {
    selectedWells,
    onWellSelect: handleWellSelect,
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
              plateId="plate96"
              wellShape="circle"
              onWellDragStart={(e, wellId, sampleId, plateId) => handleDragStart(e, { wellId, sampleId, plateId }, 'well')}
              onWellDrop={handleWellDrop}
          />
          <PlateGrid
              {...commonGridProps}
              plateData={plate48Data}
              rows={8}
              cols={6}
              title="48-Well Plate"
              plateId="plate48"
              wellShape="rect"
              onWellDragStart={(e, wellId, sampleId, plateId) => handleDragStart(e, { wellId, sampleId, plateId }, 'well')}
              onWellDrop={handleWellDrop}
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
