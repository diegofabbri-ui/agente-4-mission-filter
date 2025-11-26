// src/services/stripe.service.ts

import Stripe from 'stripe';

// Usare undefined evita errori con le versioni aggiornate delle API Stripe
const STRIPE_API_VERSION = undefined;

export class StripeService {
  private stripe: Stripe;

  constructor(secretKey = process.env.STRIPE_SECRET_KEY) {
    if (!secretKey) {
      throw new Error(
        '[StripeService] STRIPE_SECRET_KEY non trovata. Configura la variabile ambiente.',
      );
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION,
    });
  }

  /**
   * Checkout per abbonamento Premium (€9.99/mese).
   * Richiede un price Stripe (esposto come STRIPE_PREMIUM_PRICE_ID o passato a mano).
   */
  async createPremiumCheckoutSession(params: {
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
    priceId?: string;
    metadata?: Stripe.MetadataParam;
  }): Promise<Stripe.Checkout.Session> {
    const priceId =
      params.priceId || process.env.STRIPE_PREMIUM_PRICE_ID || undefined;

    if (!priceId) {
      throw new Error(
        '[StripeService] Nessun priceId fornito e STRIPE_PREMIUM_PRICE_ID non configurato.',
      );
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: params.customerEmail,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
    });

    return session;
  }

  /**
   * Checkout one-off (pagamento singolo) – nel caso volessi usarlo
   * per altri servizi / add-on.
   */
  async createOneOffCheckoutSession(params: {
    amountCents: number;
    successUrl: string;
    cancelUrl: string;
    currency?: string;
    customerEmail?: string;
    metadata?: Stripe.MetadataParam;
  }): Promise<Stripe.Checkout.Session> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: params.customerEmail,
      line_items: [
        {
          price_data: {
            currency: params.currency ?? 'eur',
            product_data: {
              name: 'Agente AI – pagamento una tantum',
            },
            unit_amount: params.amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
    });

    return session;
  }

  /**
   * PaymentIntent grezzo – se in futuro vuoi payout più custom.
   */
  async createPaymentIntent(params: {
    amountCents: number;
    currency?: string;
    customerId?: string;
    metadata?: Stripe.MetadataParam;
  }): Promise<Stripe.PaymentIntent> {
    const intent = await this.stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: params.currency ?? 'eur',
      customer: params.customerId,
      metadata: params.metadata,
    });

    return intent;
  }

  /**
   * Helper per verificare le firme dei webhook Stripe.
   * ATTENZIONE: per funzionare serve il raw body sull’endpoint webhook.
   */
  verifyWebhookSignature(params: {
    payload: string | Buffer;
    signatureHeader?: string;
    webhookSecret?: string;
  }): Stripe.Event {
    const { payload, signatureHeader, webhookSecret } = params;

    if (!signatureHeader) {
      throw new Error('[StripeService] Header Stripe-Signature mancante.');
    }

    const secret =
      webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || undefined;

    if (!secret) {
      throw new Error(
        '[StripeService] STRIPE_WEBHOOK_SECRET non configurato per la verifica dei webhook.',
      );
    }

    return this.stripe.webhooks.constructEvent(payload, signatureHeader, secret);
  }
}
