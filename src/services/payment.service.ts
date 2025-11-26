// src/services/payment.service.ts

import crypto from 'crypto';
import { Kysely, sql, SqlBool } from 'kysely';

import type { DB } from '../types/db';
import { StripeService } from './stripe.service';
import {
  computeCommission,
  type CommissionComputationInput,
  type CommissionComputationResult,
} from '../utils/commission-tiers';

export interface PaymentServiceDeps {
  stripeService?: StripeService;
  logger?: { info: (...args: any[]) => void; error: (...args: any[]) => void };
}

/**
 * Servizio centrale per:
 * - calcolo commissioni (tier + Premium)
 * - registrazione earnings
 * - integrazione high-level con Stripe (checkout Premium)
 */
export class PaymentService {
  private stripeService: StripeService;
  private logger: PaymentServiceDeps['logger'];

  constructor(deps: PaymentServiceDeps = {}) {
    this.stripeService = deps.stripeService ?? new StripeService();
    this.logger = deps.logger ?? console;
  }

  /**
   * Calcola in anteprima commissione + netto per una missione.
   * Usa il volume mensile corrente letto dalla tabella earnings.
   */
  async previewCommissionForUser(
    db: Kysely<DB>,
    userId: string,
    amountEur: number,
    referenceDate = new Date(),
    isPremium = false,
  ): Promise<CommissionComputationResult> {
    if (amountEur <= 0) {
      throw new Error('amountEur deve essere > 0');
    }

    // Somma degli earnings del mese corrente (volume mensile)
    const monthlyRows = await db
      .selectFrom('earnings')
      .select(['amount'])
      .where('user_id', '=', userId)
      .where(
        sql<SqlBool>`date_trunc('month', received_at) = date_trunc('month', ${referenceDate.toISOString()}::timestamptz)`,
      )
      .execute();

    const monthlyVolumeBefore = monthlyRows.reduce(
      (acc: number, row: { amount: number }) => acc + Number(row.amount),
      0,
    );

    const input: CommissionComputationInput = {
      amountEur,
      monthlyVolumeBefore,
      isPremium,
    };

    return computeCommission(input);
  }

  /**
   * Registra un earning legato a una missione, applicando le commissioni.
   * Salva in `earnings.amount` il NETTO per l’utente (dopo commissione).
   */
  async registerMissionEarning(
    db: Kysely<DB>,
    params: {
      userId: string;
      missionId: string;
      rewardAmountEur: number;
      referenceDate?: Date;
      isPremium?: boolean;
    },
  ): Promise<{
    earningId: string;
    commission: CommissionComputationResult;
  }> {
    const refDate = params.referenceDate ?? new Date();

    const commission = await this.previewCommissionForUser(
      db,
      params.userId,
      params.rewardAmountEur,
      refDate,
      params.isPremium ?? false,
    );

    const earningId = crypto.randomUUID();

    await db
      .insertInto('earnings')
      .values({
        id: earningId,
        user_id: params.userId,
        mission_id: params.missionId,
        amount: commission.netAmount, // netto per dashboard utente
        status: 'verified',
      })
      .execute();

    this.logger?.info?.('[PaymentService] Registered earning', {
      earningId,
      userId: params.userId,
      missionId: params.missionId,
      gross: params.rewardAmountEur,
      commissionRate: commission.rate,
      platformFee: commission.platformFee,
      netAmount: commission.netAmount,
    });

    return { earningId, commission };
  }

  /**
   * Crea una Stripe Checkout Session per l’abbonamento Premium.
   * Usa l’email dell’utente dalla tabella `users`.
   */
  async createPremiumCheckoutSession(
    db: Kysely<DB>,
    userId: string,
    successUrl: string,
    cancelUrl: string,
  ) {
    const user = await db
      .selectFrom('users')
      .select(['email'])
      .where('id', '=', userId)
      .executeTakeFirst();

    if (!user || !user.email) {
      throw new Error(
        `Impossibile creare checkout Premium: utente ${userId} senza email.`,
      );
    }

    const session = await this.stripeService.createPremiumCheckoutSession({
      customerEmail: user.email,
      successUrl,
      cancelUrl,
      metadata: {
        userId,
        type: 'premium_subscription',
      },
    });

    return session;
  }
}
