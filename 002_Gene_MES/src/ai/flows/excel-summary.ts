// ExcelSummary Flow
'use server';

/**
 * @fileOverview Provides a summary of the data in a given Excel file.
 *
 * - `getExcelSummary` - A function that takes the excel data and returns a summary.
 * - `ExcelSummaryInput` - The input type for the getExcelSummary function.
 * - `ExcelSummaryOutput` - The return type for the getExcelSummary function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExcelSummaryInputSchema = z.object({
  excelData: z
    .string()
    .describe(
      'The Excel file data, as a data URI that must include a MIME type and use Base64 encoding. Expected format: \'data:<mimetype>;base64,<encoded_data>\'.' // Ensure correct escaping
    ),
});

export type ExcelSummaryInput = z.infer<typeof ExcelSummaryInputSchema>;

const ExcelSummaryOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the Excel data.'),
});

export type ExcelSummaryOutput = z.infer<typeof ExcelSummaryOutputSchema>;

export async function getExcelSummary(input: ExcelSummaryInput): Promise<ExcelSummaryOutput> {
  return excelSummaryFlow(input);
}

const excelSummaryPrompt = ai.definePrompt({
  name: 'excelSummaryPrompt',
  input: {schema: ExcelSummaryInputSchema},
  output: {schema: ExcelSummaryOutputSchema},
  prompt: `You are an expert at summarizing data from Excel files.

  Please provide a concise summary of the data contained in the following Excel file.
  
  Excel Data: {{media url=excelData}}
  `,
});

const excelSummaryFlow = ai.defineFlow(
  {
    name: 'excelSummaryFlow',
    inputSchema: ExcelSummaryInputSchema,
    outputSchema: ExcelSummaryOutputSchema,
  },
  async input => {
    const {output} = await excelSummaryPrompt(input);
    return output!;
  }
);
