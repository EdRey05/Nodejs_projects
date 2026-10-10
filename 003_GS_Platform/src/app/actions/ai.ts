"use server";

import { getContextAwareHelp } from "@/ai/flows/context-aware-help";
import { getExcelSummary } from "@/ai/flows/excel-summary";

export async function getHelp(
  query: string,
  context: string
): Promise<string> {
  try {
    const result = await getContextAwareHelp({ query, appContext: context });
    return result.helpMessage;
  } catch (error) {
    console.error(error);
    return "Sorry, I encountered an error while trying to help. Please check the server logs.";
  }
}

export async function summarizeExcel(excelData: string): Promise<string> {
  try {
    if (!excelData.startsWith('data:')) {
        throw new Error("Invalid data URI format for Excel file.");
    }
    const result = await getExcelSummary({ excelData });
    return result.summary;
  } catch (error) {
    console.error(error);
    return "Sorry, I was unable to summarize the Excel file. Please ensure it is a valid .xlsx file.";
  }
}
