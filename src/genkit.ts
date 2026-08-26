import { googleAI } from '@genkit-ai/google-genai';
import { Genkit, genkit, z } from 'genkit';

export const ai: Genkit = genkit({
  plugins: [googleAI()], // Fallback to geting the apikey from environment variable
  model: googleAI.model('gemma-4-26b-a4b-it', {
    temperature: 0.2,
  }),
});

// Define response schema
// const UploadTypeSchema = z.object({
//   type: z.enum(['receipt', 'transaction']),
// });


// const ReceiptSchema = z.object({
//   name: z.string().describe('Item name or description'),
//   price: z.number().describe('Item price'),
// });

// const ReceiptResponseSchema = z.object({
//   type: z.literal('receipt'),
//   items: z.array(ReceiptSchema).describe('List of items from receipt'),
//   biller: z.string().describe("Company/Biller'sname "),
//   currency: z.string().describe('Currency code (USD, EUR, etc)'),
//   total_amount: z.number().describe('Total amount'),
//   date: z.string().optional().describe('Transaction date (YYYY-MM-DD)'),
//   time: z.string().optional().describe('Transaction time (HH:MM:SS)'),
// });

// const TransactionResponseSchema = z.object({
//   type: z.literal('transaction'),
//   senderName: z.string().describe('Name of sender/payer'),
//   merchantName: z.string().describe('Name of merchant/receiver'),
//   amount: z.number().describe('Transaction amount'),
//   currency: z.string().describe('Currency code (USD, EUR, etc)'),
//   date: z.string().optional().describe('Transaction date (YYYY-MM-DD)'),
//   time: z.string().optional().describe('Transaction time (HH:MM:SS)'),
//   transactionId: z.string().optional().describe('Transaction/reference ID'),
//   paymentMethod: z.string().optional().describe('Payment method (Card, Bank Transfer, Wallet, etc)'),
//   status: z.string().optional().describe('Transaction status (Success, Pending, Failed)'),
// });

// const ScanResultSchema = z.discriminatedUnion('type', [
//   ReceiptResponseSchema,
//   TransactionResponseSchema,
// ]);
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

// const defineItem = ai.defineFlow(
//   {
//     name: 'DefineUpload',
//     inputSchema: z.string(),
//     outputSchema: UploadTypeSchema,
//   },

//   async (imageBase64) => {
//     const result = await ai.generate({
//       prompt: `
//         Analyze this image.

//         Determine:
//         1. Is this a receipt/invoice?
//         2. Is this a payment/transaction slip?

//         Return ONLY valid JSON in this format:

//         {
//           "type": "receipt"
//         }

//         OR

//         {
//           "type": "transaction"
//         }

//         Image (Base64): ${imageBase64}
//       `,
//       output: { schema: UploadTypeSchema },
//     });

//     if (!result.output) {
//       throw new Error('Failed to generate structured output');
//     }
//     return result.output;
//   }
// );

// const ScanTransaction = ai.defineFlow(
//   {
//     name: "ScanTransaction",
//     inputSchema: z.string(),
//     outputSchema: TransactionResponseSchema
//   },
//   async (imageBase64) => {
//     const result = await ai.generate({
//       prompt: `Analyze this payment/transaction screenshot and extract:
//         1. Type
//         2. Sender/Payer name
//         3. Merchant/Receiver name
//         4. Transaction amount
//         5. Currency
//         6. Date and time
//         7. Transaction ID
//         8. Payment method
//         9. Status
        
//         Return ONLY valid JSON in this format:
//         { 
//           type: "transaction"
//           senderName: string, 
//           merchantName: string, 
//           amount: number, 
//           currency: string,
//           date: string,
//           time: string,
//           transactionId: string,
//           paymentMethod: string,
//           status: string
//         }

//         Image (Base64): ${imageBase64}`,
//       output: { schema: TransactionResponseSchema }
//     });
//     if (!result.output) {
//       throw new Error('Failed to generate structured output');
//     }

//     return result.output;
//   }
// );

// const ScanReceipt = ai.defineFlow(
//   {
//     name: "ScanReceipt",
//     inputSchema: z.string(),
//     outputSchema: ReceiptResponseSchema
//   },
//   async (imageBase64) => {
//     const result = await ai.generate({
//       prompt: `Analyze this receipt/invoice image and extract:
//         1. Type
//         2. Item name/description
//         3. Biller
//         4. Price/amount for each item
//         5. Currency
//         6. Total amount
//         7. Date and time
        
//         Return ONLY valid JSON in this format:
//         { 
//           type: "receipt"
//           items: [{ name: string, price: number }], 
//           biller: string,
//           currency: string, 
//           total_amount: number,
//           date: string,
//           time: string
//         }
        
//         Image (Base64): ${imageBase64}`,
//       output: { schema: ReceiptResponseSchema }
//     });

//     if (!result.output) {
//       throw new Error('Failed to generate structured output');
//     }
//     return result.output;
//   }
// );

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
