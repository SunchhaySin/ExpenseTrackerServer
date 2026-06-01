import { googleAI } from '@genkit-ai/google-genai';
import { Genkit, genkit, z } from 'genkit';

export const ai: Genkit = genkit({
  plugins: [googleAI()],
  model: googleAI.model('gemma-4-26b-a4b-it', {
    temperature: 0.2,
  }),
});

// Define response schema
const UploadTypeSchema = z.object({
  type: z.enum(['receipt', 'transaction']),
});


const ReceiptSchema = z.object({
  name: z.string().describe('Item name or description'),
  price: z.number().describe('Item price'),
});

const ReceiptResponseSchema = z.object({
  type: z.literal('receipt'),
  items: z.array(ReceiptSchema).describe('List of items from receipt'),
  biller: z.string().describe("Company/Biller'sname "),
  currency: z.string().describe('Currency code (USD, EUR, etc)'),
  total_amount: z.number().describe('Total amount'),
  date: z.string().optional().describe('Transaction date (YYYY-MM-DD)'),
  time: z.string().optional().describe('Transaction time (HH:MM:SS)'),
});

const TransactionResponseSchema = z.object({
  type: z.literal('transaction'),
  senderName: z.string().describe('Name of sender/payer'),
  merchantName: z.string().describe('Name of merchant/receiver'),
  amount: z.number().describe('Transaction amount'),
  currency: z.string().describe('Currency code (USD, EUR, etc)'),
  date: z.string().optional().describe('Transaction date (YYYY-MM-DD)'),
  time: z.string().optional().describe('Transaction time (HH:MM:SS)'),
  transactionId: z.string().optional().describe('Transaction/reference ID'),
  paymentMethod: z.string().optional().describe('Payment method (Card, Bank Transfer, Wallet, etc)'),
  status: z.string().optional().describe('Transaction status (Success, Pending, Failed)'),
});

const ScanResultSchema = z.discriminatedUnion('type', [
  ReceiptResponseSchema,
  TransactionResponseSchema,
]);

const defineItem = ai.defineFlow(
  {
    name: 'DefineUpload',
    inputSchema: z.string(),
    outputSchema: UploadTypeSchema,
  },

  async (imageBase64) => {
    const result = await ai.generate({
      prompt: `
        Analyze this image.

        Determine:
        1. Is this a receipt/invoice?
        2. Is this a payment/transaction slip?

        Return ONLY valid JSON in this format:

        {
          "type": "receipt"
        }

        OR

        {
          "type": "transaction"
        }

        Image (Base64): ${imageBase64}
      `,
      output: { schema: UploadTypeSchema },
    });

    if (!result.output) {
      throw new Error('Failed to generate structured output');
    }
    return result.output;
  }
);

const ScanTransaction = ai.defineFlow(
  {
    name: "ScanTransaction",
    inputSchema: z.string(),
    outputSchema: TransactionResponseSchema
  },
  async (imageBase64) => {
    const result = await ai.generate({
      prompt: `Analyze this payment/transaction screenshot and extract:
        1. Type
        2. Sender/Payer name
        3. Merchant/Receiver name
        4. Transaction amount
        5. Currency
        6. Date and time
        7. Transaction ID
        8. Payment method
        9. Status
        
        Return ONLY valid JSON in this format:
        { 
          type: "transaction"
          senderName: string, 
          merchantName: string, 
          amount: number, 
          currency: string,
          date: string,
          time: string,
          transactionId: string,
          paymentMethod: string,
          status: string
        }

        Image (Base64): ${imageBase64}`,
      output: { schema: TransactionResponseSchema }
    });
    if (!result.output) {
      throw new Error('Failed to generate structured output');
    }

    return result.output;
  }
);

const ScanReceipt = ai.defineFlow(
  {
    name: "ScanReceipt",
    inputSchema: z.string(),
    outputSchema: ReceiptResponseSchema
  },
  async (imageBase64) => {
    const result = await ai.generate({
      prompt: `Analyze this receipt/invoice image and extract:
        1. Type
        2. Item name/description
        3. Biller
        4. Price/amount for each item
        5. Currency
        6. Total amount
        7. Date and time
        
        Return ONLY valid JSON in this format:
        { 
          type: "receipt"
          items: [{ name: string, price: number }], 
          biller: string,
          currency: string, 
          total_amount: number,
          date: string,
          time: string
        }
        
        Image (Base64): ${imageBase64}`,
      output: { schema: ReceiptResponseSchema }
    });

    if (!result.output) {
      throw new Error('Failed to generate structured output');
    }
    return result.output;
  }
);

type ScanResult = z.infer<typeof ScanResultSchema>;
export const ScanUpload: (imageBase64: string) => Promise<ScanResult> = ai.defineFlow(
  {
    name: 'ScanUpload',
    inputSchema: z.string(),
    outputSchema: ScanResultSchema,
  },

  async (imageBase64) => {
    const uploadType = await defineItem(imageBase64);

    switch (uploadType.type) {
      case 'receipt':
        return await ScanReceipt(imageBase64);

      case 'transaction':
        return await ScanTransaction(imageBase64);
      
      default:
        throw new Error('Unsupported upload type');
    }
  }
);