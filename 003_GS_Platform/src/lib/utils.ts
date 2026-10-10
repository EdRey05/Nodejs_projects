import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { PlateData, WellData } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generatePlateData(rows: number, cols: number): PlateData {
  const data: PlateData = {};
  for (let i = 0; i < rows; i++) {
    const rowChar = String.fromCharCode(65 + i);
    for (let j = 1; j <= cols; j++) {
      const wellId = `${rowChar}${j}`;
      data[wellId] = {
        id: wellId,
        sample: null,
        params: {},
      };
    }
  }
  return data;
}
