// src/utils/commission-tiers.ts

export type CommissionTier = 'LOW' | 'MID' | 'HIGH' | 'PREMIUM';

export interface CommissionComputationInput {
  /**
   * Importo della singola missione (in EUR, lato business logic).
   */
  amountEur: number;
  /**
   * Volume mensile già maturato PRIMA di questa missione (in EUR).
   * Di default puoi usare la somma degli earnings del mese corrente.
   */
  monthlyVolumeBefore: number;
  /**
   * Se l’utente ha il piano Premium attivo (9,99€/mese → 0% commissioni).
   */
  isPremium: boolean;
}

export interface CommissionComputationResult {
  tier: CommissionTier;
  /**
   * Aliquota di commissione applicata (0–1, es: 0.15 = 15%).
   */
  rate: number;
  /**
   * Quota trattenuta dalla piattaforma (in EUR, arrotondata a 2 decimali).
   */
  platformFee: number;
  /**
   * Netto che va all’utente (in EUR, arrotondato a 2 decimali).
   */
  netAmount: number;
  monthlyVolumeBefore: number;
  monthlyVolumeAfter: number;
}

/**
 * Ritorna il tier di commissione in base al volume mensile e allo stato Premium.
 *
 * Commission tiers (mensili):
 * - < 100€   → 10%
 * - 100–300€ → 15%
 * - > 300€   → 20%
 * - Premium  → 0%
 */
export function getCommissionTier(
  monthlyVolume: number,
  isPremium: boolean,
): CommissionTier {
  if (isPremium) return 'PREMIUM';
  if (monthlyVolume < 100) return 'LOW';
  if (monthlyVolume < 300) return 'MID';
  return 'HIGH';
}

/**
 * Ritorna solo l’aliquota (0–1) per un dato volume mensile.
 */
export function getCommissionRate(
  monthlyVolume: number,
  isPremium: boolean,
): number {
  const tier = getCommissionTier(monthlyVolume, isPremium);

  switch (tier) {
    case 'PREMIUM':
      return 0;
    case 'LOW':
      return 0.1; // 10%
    case 'MID':
      return 0.15; // 15%
    case 'HIGH':
    default:
      return 0.2; // 20%
  }
}

/**
 * Calcola commissione piattaforma + netto che va all’utente
 * per una singola missione, dato il volume mensile corrente.
 */
export function computeCommission(
  input: CommissionComputationInput,
): CommissionComputationResult {
  const { amountEur, monthlyVolumeBefore, isPremium } = input;

  if (amountEur <= 0) {
    throw new Error('amountEur must be > 0');
  }

  // Consideriamo il volume dopo aver aggiunto questa missione
  const monthlyVolumeAfter = monthlyVolumeBefore + amountEur;
  const rate = getCommissionRate(monthlyVolumeAfter, isPremium);

  const platformFee = roundToCents(amountEur * rate);
  const netAmount = roundToCents(amountEur - platformFee);
  const tier = getCommissionTier(monthlyVolumeAfter, isPremium);

  return {
    tier,
    rate,
    platformFee,
    netAmount,
    monthlyVolumeBefore,
    monthlyVolumeAfter,
  };
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
