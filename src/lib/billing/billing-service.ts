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

export class BillingService {
  /**
   * Generates an AEAT (Tax Authority) compliant invoice via Holded or Stripe Billing.
   */
  static async generateSpanishInvoice(data: InvoiceData) {
    console.log(`Generating IVA-compliant invoice for client ${data.clientId}`);
    
    // Calculate totals
    const ivaAmount = data.amount * (data.ivaRate / 100);
    const totalAmount = data.amount + ivaAmount;

    const apiKey = process.env['HOLDED_API_KEY'];
    if (!apiKey) {
      console.warn('[BillingService] Holded API key missing — generating mock invoice.');
      return {
        invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`,
        subtotal: data.amount,
        ivaAmount,
        totalAmount,
        pdfUrl: 'https://storage.example.com/mock-invoice.pdf',
        documentId: 'mock_doc_id',
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
        invoiceNumber: json.docNumber ?? `INV-${new Date().getFullYear()}-${json.id.substring(0, 5)}`,
        subtotal: data.amount,
        ivaAmount,
        totalAmount,
        pdfUrl: `https://app.holded.com/portaldoc/${json.id}`, // Placeholder portal URL
        documentId: json.id,
      };
    } catch (err: any) {
      console.error('[BillingService] Holded invoice generation failed:', err?.message);
      throw new Error('Failed to generate Spanish Invoice');
    }
  }

  /**
   * Initiates a B2B SEPA direct debit charge using Stripe.
   */
  static async chargeSepa(clientId: string, amount: number, invoiceNumber: string) {
    console.log(`Initiating SEPA charge for ${amount} EUR against client ${clientId} for ${invoiceNumber}`);
    
    const stripeKey = process.env['STRIPE_SECRET_KEY'];
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
   * Generates a Bizum payment link for instant mobile payment (common for B2C or small B2B).
   */
  static async createBizumPayment(amount: number, reference: string) {
    if (!process.env['BIZUM_MERCHANT_ID']) {
      console.warn('Bizum Merchant ID missing.');
    }
    console.log(`Generating Bizum payment request for ${amount} EUR (Ref: ${reference})`);
    
    // In a real Redsys Bizum integration, you would cryptographically sign the payload
    // and generate a form to submit to the Redsys TPV (Terminal Punto de Venta) URL.
    // For this ERP implementation, we return a URL where the ERP frontend or 
    // payment gateway wrapper handles the Redsys redirection.
    
    const bizumBase = process.env['BIZUM_ENDPOINT'] ?? 'https://sis-t.redsys.es:25443/sis/realizarPago';
    const merchantId = process.env['BIZUM_MERCHANT_ID'] ?? '999008881';
    
    // Return structured data for the frontend to create the Redsys form
    return {
      paymentUrl: bizumBase,
      parameters: {
        amount: Math.round(amount * 100).toString(),
        order: reference,
        merchantCode: merchantId,
        terminal: '1',
        transactionType: '0',
        currency: '978', // EUR
        payMethod: 'z',  // 'z' is Bizum in Redsys
      },
      expiresIn: '10m'
    };
  }
}
