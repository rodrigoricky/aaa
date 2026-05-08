import { unprocessable } from '../errors/http-errors.js';

export function toNumber(value: unknown, fallback = 0) {
  if (value == null) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseRequiredQuantity(value: unknown, itemcode: string): number {
  if (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    throw unprocessable(
      `Item ${itemcode} has no valid current quantity in POS database. Please verify stock before saving/posting.`
    );
  }

  if (
    typeof value !== 'number' &&
    typeof value !== 'string' &&
    typeof value !== 'bigint'
  ) {
    throw unprocessable(
      `Item ${itemcode} has no valid current quantity in POS database. Please verify stock before saving/posting.`
    );
  }

  const quantity = Number(value);
  if (!Number.isFinite(quantity)) {
    throw unprocessable(
      `Item ${itemcode} has no valid current quantity in POS database. Please verify stock before saving/posting.`
    );
  }

  return quantity;
}

export function toIsoString(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
