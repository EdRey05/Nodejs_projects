'use server';

/**
 * @fileOverview Implements an AI chatbot that provides context-aware help based on the current application state.
 *
 * - `getContextAwareHelp` -  A function that generates help messages based on the current application context.
 * - `ContextAwareHelpInput` - The input type for the `getContextAwareHelp` function, defining the user query and application context.
 * - `ContextAwareHelpOutput` - The output type for the `getContextAwareHelp` function, providing the AI-generated help message.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ContextAwareHelpInputSchema = z.object({
  query: z.string().describe('The user query or question.'),
  appContext: z
    .string()
    .describe(
      'The current context of the application, including the active module, loaded data, and any relevant state information.'
    ),
});
export type ContextAwareHelpInput = z.infer<typeof ContextAwareHelpInputSchema>;

const ContextAwareHelpOutputSchema = z.object({
  helpMessage: z.string().describe('The AI-generated help message.'),
});
export type ContextAwareHelpOutput = z.infer<typeof ContextAwareHelpOutputSchema>;

export async function getContextAwareHelp(
  input: ContextAwareHelpInput
): Promise<ContextAwareHelpOutput> {
  return contextAwareHelpFlow(input);
}

const prompt = ai.definePrompt({
  name: 'contextAwareHelpPrompt',
  input: {schema: ContextAwareHelpInputSchema},
  output: {schema: ContextAwareHelpOutputSchema},
  prompt: `You are an AI chatbot that provides helpful information to the user based on the current application context.

  The current application context is: {{{appContext}}}

  The user is asking the following question: {{{query}}}

  Please provide a concise and informative answer to the user's question, taking into account the application context.
  If you do not know the answer, respond politely without making up an answer.
  `,
});

const contextAwareHelpFlow = ai.defineFlow(
  {
    name: 'contextAwareHelpFlow',
    inputSchema: ContextAwareHelpInputSchema,
    outputSchema: ContextAwareHelpOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
