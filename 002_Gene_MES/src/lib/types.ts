export type Sample = {
  id: string;
  name: string;
  color: string;
};

export type WellParams = {
  antibiotic?: string | null;
  temperature?: string | null;
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

export const ANTIBIOTIC_COLORS: { [key: string]: string } = {
  Amp: "bg-yellow-400/50",
  Kan: "bg-blue-400/50",
  Spec: "bg-purple-400/50",
  Chlor: "bg-green-400/50",
};

export const DNA_EXTRACTION_ANTIBIOTIC_COLORS: { [key: string]: string } = {
  "Amp": "bg-yellow-200",
  "Kan": "bg-orange-200",
  "Cm": "bg-blue-200",
  "Tc": "bg-pink-200",
  "Sm": "bg-gray-300",
};

export const DNA_EXTRACTION_ANTIBIOTIC_BORDERS: { [key: string]: string } = {
  "Amp": "border-yellow-600",
  "Kan": "border-orange-600",
  "Cm": "border-blue-600",
  "Tc": "border-pink-600",
  "Sm": "border-gray-700",
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

export const LOG_TYPES = ["Ligation", "Colony PCR", "DNA Extraction"] as const;
export type LogType = typeof LOG_TYPES[number];
