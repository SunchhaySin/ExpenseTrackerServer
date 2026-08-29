import { googleAI } from '@genkit-ai/google-genai';
import { Genkit, genkit, z } from 'genkit';

export const ai: Genkit = genkit({
  plugins: [googleAI()], // Fallback to geting the apikey from environment variable
  model: googleAI.model('gemma-4-26b-a4b-it', {
    temperature: 0.2,
  }),
});

const LineItemSchema = z.object({
  name: z.string().describe('Item name or description'),
  price: z.number().describe('Item price'),
});

const ScanResultSchema = z.object({
  name: z.string().describe('The primary name on the document — biller, merchant, or payee'),
  amount: z.number().describe('Total or transaction amount'),
  currency: z.string().describe(
    'Currency of the amount, as a 3-letter ISO 4217 code (e.g. USD, THB, EUR, JPY, GBP, SGD, INR). ' +
    'Infer from symbols ($, ฿, €, ¥, £, ₹), labels, or locale context. Use "UNKNOWN" if truly indeterminable.'
  ),
  date: z.string().optional().describe('Date shown on the document (YYYY-MM-DD)'),
  time: z.string().optional().describe('Time shown on the document (HH:MM:SS)'),
  items: z.array(LineItemSchema).optional().describe('Individual line items, if any are listed'),
  senderName: z.string().optional().describe('Sender/payer name, if this is a payment confirmation'),
  paymentMethod: z.string().optional().describe('Payment method (Card, Bank Transfer, Wallet, etc), if present'),
});

type ScanResult = z.infer<typeof ScanResultSchema>;

export const ScanUpload: (imageBase64: string) => Promise<ScanResult> = ai.defineFlow(
  {
    name: 'ScanUpload',
    inputSchema: z.string(),
    outputSchema: ScanResultSchema,
  },
  async (imageBase64) => {
    const result = await ai.generate({
      prompt: `Analyze this image of a receipt, invoice, or payment/transaction record and extract
        whatever information is present. Not every field applies to every document — only fill in
        fields that are actually shown; leave the rest out.

        Extract:
        1. The primary name on the document (biller, merchant, or payee)
        2. Total or transaction amount
        3. Currency — use the 3-letter ISO 4217 code, inferred from symbols, labels, or context.
           Do not assume USD or THB. Use "UNKNOWN" only if truly indeterminable.
        4. Date and time, if shown
        5. Individual line items (name + price), if this is an itemized receipt
        6. Sender/payer name, if this is a payment confirmation
        7. Transaction/reference ID, if present
        8. Payment method, if present
        9. Status, if present

        Return ONLY valid JSON matching the schema. Omit fields that aren't present in the image.

        Image (Base64): ${imageBase64}`,
      output: { schema: ScanResultSchema },
    });

    if (!result.output) {
      throw new Error('Failed to generate structured output');
    }
    return result.output;
  }
);
