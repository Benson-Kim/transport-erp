/**
 * Billing and Invoicing Service
 * 
 * Spanish fiscal compliance layer. Integrates with Holded/Stripe for
 * IVA-compliant invoicing, SEPA for B2B mandates, and Bizum for instant payments.
 */



import Stripe from 'stripe';
import { fetchWithRetry } from '@/lib/utils/fetch-with-retry';

export interface InvoiceData {
  clientId: string;
  amount: number;
  ivaRate: number; // usually 21%
  concept: string;
}

export interface InvoiceResult {
  success: boolean;
  invoiceNumber?: string;
  subtotal?: number;
  ivaAmount?: number;
  totalAmount?: number;
  pdfUrl?: string;
  documentId?: string;
  error?: string;
}

export class BillingService {
  /**
   * Generates an AEAT (Tax Authority) compliant invoice via Holded or Stripe Billing.
   */
  static async generateSpanishInvoice(data: InvoiceData): Promise<InvoiceResult> {
    console.log(`Generating IVA-compliant invoice for client ${data.clientId}`);

    // Calculate totals
    const ivaAmount = data.amount * (data.ivaRate / 100);
    const totalAmount = data.amount + ivaAmount;

    const apiKey = process.env.HOLDED_API_KEY;
    if (!apiKey) {
      console.warn('[BillingService] Holded API key missing — cannot generate invoice.');
      return {
        success: false,
        error: 'Holded API key not configured. Set HOLDED_API_KEY environment variable.',
      };
    }

    try {
      const response = await fetchWithRetry('https://api.holded.com/api/invoicing/v1/documents/invoice', {
        method: 'POST',
        headers: {
          'key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          contactId: data.clientId, // Assuming the clientId maps to a Holded Contact ID
          items: [
            {
              name: data.concept,
              subtotal: data.amount,
              taxes: ['iva' + data.ivaRate]
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Holded returned HTTP ${response.status}`);
      }

      const json = await response.json();

      return {
        success: true,
        invoiceNumber: json.docNumber ?? `INV-${new Date().getFullYear()}-${json.id.substring(0, 5)}`,
        subtotal: data.amount,
        ivaAmount,
        totalAmount,
        pdfUrl: `https://app.holded.com/portaldoc/${json.id}`, // Placeholder portal URL
        documentId: json.id,
      };
    } catch (err: any) {
      console.error('[BillingService] Holded invoice generation failed:', err?.message);
      return {
        success: false,
        error: `Failed to generate Spanish Invoice: ${err?.message ?? 'Unknown error'}`,
      };
    }
  }

  /**
   * Initiates a B2B SEPA direct debit charge using Stripe.
   */
  static async chargeSepa(clientId: string, amount: number, invoiceNumber: string) {
    console.log(`Initiating SEPA charge for ${amount} EUR against client ${clientId} for ${invoiceNumber}`);

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      console.warn('[BillingService] Stripe Secret Key missing - skipping SEPA charge');
      return { success: false, error: 'Stripe configuration missing' };
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' });

    try {
      // In a real application, the clientId would map to a Stripe Customer ID with an attached SEPA mandate
      // For this implementation, we assume the clientId is the Stripe Customer ID or we look it up
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Stripe expects cents
        currency: 'eur',
        customer: clientId, // Assumed to be Stripe Customer ID
        payment_method_types: ['sepa_debit'],
        metadata: {
          invoiceNumber,
        },
        confirm: true, // Attempt to confirm immediately
        off_session: true, // This is a merchant-initiated B2B transaction
      });

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      };
    } catch (err: any) {
      console.error('[BillingService] SEPA charge failed:', err?.message);
      return { success: false, error: err?.message };
    }
  }

  /**
   * Generates a signed Bizum payment request for instant mobile payment.
   *
   * Uses the Redsys HMAC-SHA256 signing protocol:
   * 1. Build Ds_MerchantParameters as base64-encoded JSON
   * 2. Diversify the merchant secret key using 3DES with the order number
   * 3. Sign the base64 parameters with HMAC-SHA256 using the diversified key
   *
   * Requires env vars:
   * - BIZUM_MERCHANT_ID
   * - BIZUM_MERCHANT_SECRET (base64-encoded 3DES key from Redsys admin panel)
   * - BIZUM_ENDPOINT (optional, defaults to Redsys test environment)
   * - BIZUM_TERMINAL (optional, defaults to '1')
   */
  static async createBizumPayment(amount: number, reference: string) {
    const merchantId = process.env.BIZUM_MERCHANT_ID;
    const merchantSecret = process.env.BIZUM_MERCHANT_SECRET;

    if (!merchantId || !merchantSecret) {
      console.warn('[BillingService] Bizum credentials not configured.');
      return {
        success: false,
        error: 'Bizum merchant credentials not configured. Set BIZUM_MERCHANT_ID and BIZUM_MERCHANT_SECRET.',
      };
    }

    // Validate 3DES key length (must be exactly 24 bytes after base64 decode)
    const secretKeyBuffer = Buffer.from(merchantSecret, 'base64');
    if (secretKeyBuffer.length !== 24) {
      console.error(`[BillingService] BIZUM_MERCHANT_SECRET decodes to ${secretKeyBuffer.length} bytes (expected 24).`);
      return {
        success: false,
        error: 'Invalid BIZUM_MERCHANT_SECRET: must be a base64-encoded 24-byte 3DES key.',
      };
    }

    const bizumEndpoint = process.env.BIZUM_ENDPOINT ?? 'https://sis-t.redsys.es:25443/sis/realizarPago';
    const terminal = process.env.BIZUM_TERMINAL ?? '1';

    // Build Redsys merchant parameters
    const merchantParameters = {
      Ds_Merchant_Amount: Math.round(amount * 100).toString(),
      Ds_Merchant_Order: reference,
      Ds_Merchant_MerchantCode: merchantId,
      Ds_Merchant_Terminal: terminal,
      Ds_Merchant_TransactionType: '0',
      Ds_Merchant_Currency: '978', // EUR
      Ds_Merchant_PayMethods: 'z', // 'z' is Bizum in Redsys
    };

    // Step 1: Base64-encode the merchant parameters JSON
    const merchantParamsB64 = Buffer.from(JSON.stringify(merchantParameters)).toString('base64');

    // Step 2: Diversify the merchant secret key using 3DES-CBC with the order number
    const { createCipheriv, createHmac } = await import('crypto');
    // secretKeyBuffer already decoded and validated above

    // Pad the order to 8 bytes (3DES block size)
    const orderBuffer = Buffer.alloc(8, 0);
    Buffer.from(reference).copy(orderBuffer);

    // 3DES-CBC encrypt the order number with the merchant secret (IV = 0)
    const iv = Buffer.alloc(8, 0);
    const cipher = createCipheriv('des-ede3-cbc', secretKeyBuffer, iv);
    cipher.setAutoPadding(false);
    const diversifiedKey = Buffer.concat([cipher.update(orderBuffer), cipher.final()]);

    // Step 3: HMAC-SHA256 sign the base64-encoded parameters with the diversified key
    const signature = createHmac('sha256', diversifiedKey)
      .update(merchantParamsB64)
      .digest('base64');

    return {
      success: true,
      paymentUrl: bizumEndpoint,
      formFields: {
        Ds_SignatureVersion: 'HMAC_SHA256_V1',
        Ds_MerchantParameters: merchantParamsB64,
        Ds_Signature: signature,
      },
      expiresIn: '10m',
    };
  }
}
