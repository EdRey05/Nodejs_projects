export type Sample = {
  id: string;
  name: string;
  color: string;
};

export type WellParams = {
  antibiotic?: string | null;
  temperature?: string | null;
  bacteria?: string | null;
  incubationTime?: string | null;
  prep?: string | null;
};

export type WellData = {
  id: string;
  sample: Sample | null;
  params: WellParams;
  content?: string;
};

export type PlateData = {
  [wellId: string]: WellData;
};

export const ANTIBIOTICS = ["Amp", "Kan", "Spec", "Chlor"];
export const TEMPERATURES = ["16°C", "30°C", "37°C"];

export const DNA_EXTRACTION_ANTIBIOTICS = ["Amp", "Kan", "Cm", "Tc", "Sm"];
export const DNA_EXTRACTION_ANTIBIOTIC_NAMES: { [key: string]: string } = {
  "Amp": "Amp - Ampicillin",
  "Kan": "Kan - Kanamycin",
  "Cm": "Cm - Chloramphenicol",
  "Tc": "Tc - Tetracycline",
  "Sm": "Sm - Spectinomycin"
};
export const DNA_EXTRACTION_TEMPERATURES = ["16-20°C", "30°C", "37°C"];

export const DNA_EXTRACTION_BACTERIA = ["TOP10 (E. coli)", "Stable (E. coli)", "DH5a (E. coli)", "Other"];
export const DNA_EXTRACTION_INCUBATION_TIMES = ["<12h", "12-16h", "24h", "48h", "72h", "96h", "Other"];
export const DNA_EXTRACTION_PREPS = ["Standard", "MAXI"];

export const STANDARD_CONDITIONS = {
  bacteria: "TOP10 (E. coli)",
  temperature: "37°C",
  incubationTime: "12-16h",
  prep: "Standard"
};

export const ANTIBIOTIC_COLORS: { [key: string]: string } = {
  Amp: "bg-yellow-400/50",
  Kan: "bg-blue-400/50",
  Spec: "bg-purple-400/50",
  Chlor: "bg-green-400/50",
};

export const DNA_EXTRACTION_ANTIBIOTIC_COLORS: { [key: string]: string } = {
  "Amp": "bg-yellow-100",
  "Kan": "bg-orange-100",
  "Cm": "bg-blue-100",
  "Tc": "bg-pink-100",
  "Sm": "bg-slate-200",
};

export const DNA_EXTRACTION_ANTIBIOTIC_BORDERS: { [key: string]: string } = {
  "Amp": "border-yellow-600",
  "Kan": "border-orange-600",
  "Cm": "border-blue-600",
  "Tc": "border-pink-600",
  "Sm": "border-slate-700",
};


export const TEMPERATURE_COLORS: { [key: string]: string } = {
  "16°C": "bg-blue-200/50",
  "30°C": "bg-orange-300/50",
  "37°C": "bg-red-400/50",
};

export const DNA_EXTRACTION_TEMPERATURE_BORDERS: { [key: string]: string } = {
    "37°C": "border-solid",
    "30°C": "border-dashed",
    "16-20°C": "border-dotted",
};

export const LOG_TYPES = ["Ligation", "Colony PCR", "DNA Extraction", "DNA Quantification"] as const;
export type LogType = typeof LOG_TYPES[number];

export const DNA_QUANTIFICATION_SOURCES = [
    "Extraction Plate",
    "Fragments",
    "Other (for SEQ/QC)",
    "Nanodrop CSV"
] as const;
export type DnaQuantificationSource = typeof DNA_QUANTIFICATION_SOURCES[number];

export type ParseResult = {
    success: boolean;
    message: string;
    data?: any;
    headers?: string[];
};

export type FetchResult =
  | { success: true; isJson: true; payload: Record<string, any[]>; images: Record<string, string[]> }
  | { success: false; message: string };
