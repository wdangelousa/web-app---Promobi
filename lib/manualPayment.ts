export type FinancialStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overpaid';

export type ProductionReleasePolicy = 'allow_partial_payment' | 'full_payment_required';

export interface ManualPaymentEntry {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string | null;
  notes: string | null;
  registeredBy: string | null;
  registeredByUserId: string | null;
  registeredAt: string;
  resultingAmountReceived: number;
  resultingRemainingBalance: number;
  resultingFinancialStatus: FinancialStatus;
  resultingOperationalStatus: string | null;
}

export interface FinancialLedgerSnapshot {
  orderTotal: number;
  amountReceived: number;
  remainingBalance: number;
  status: FinancialStatus;
  payments: ManualPaymentEntry[];
  updatedAt: string | null;
}

interface ApplyManualPaymentInput {
  amount: number;
  paymentDate: string;
  paymentMethod?: string | null;
  notes?: string | null;
  registeredBy?: string | null;
  registeredByUserId?: string | null;
  registeredAt?: string;
  resultingOperationalStatus?: string | null;
}

type JsonObject = Record<string, unknown>;

export const FINANCIAL_LEDGER_KEY = 'financialLedgerV1';

const EPSILON = 0.00001;

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.').trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function deriveFinancialStatus(orderTotal: number, amountReceived: number): FinancialStatus {
  const total = roundMoney(Math.max(orderTotal, 0));
  const received = roundMoney(Math.max(amountReceived, 0));

  if (received <= EPSILON) return 'unpaid';
  if (received + EPSILON < total) return 'partially_paid';
  if (Math.abs(received - total) <= EPSILON) return 'paid';
  return 'overpaid';
}

function sanitizePaymentEntry(input: unknown): ManualPaymentEntry | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as JsonObject;

  const amount = normalizeNumber(row.amount);
  const paymentDate = normalizeOptionalString(row.paymentDate);
  const registeredAt = normalizeOptionalString(row.registeredAt);
  const resultingAmountReceived = normalizeNumber(row.resultingAmountReceived);
  const resultingRemainingBalance = normalizeNumber(row.resultingRemainingBalance);
  const resultingStatusRaw = normalizeOptionalString(row.resultingFinancialStatus);

  if (
    amount === null ||
    amount < 0 ||
    !paymentDate ||
    !registeredAt ||
    resultingAmountReceived === null ||
    resultingRemainingBalance === null
  ) {
    return null;
  }

  const resultingFinancialStatus: FinancialStatus =
    resultingStatusRaw === 'unpaid' ||
    resultingStatusRaw === 'partially_paid' ||
    resultingStatusRaw === 'paid' ||
    resultingStatusRaw === 'overpaid'
      ? resultingStatusRaw
      : deriveFinancialStatus(resultingAmountReceived + resultingRemainingBalance, resultingAmountReceived);

  return {
    id: normalizeOptionalString(row.id) ?? `${registeredAt}-${Math.random().toString(36).slice(2, 8)}`,
    amount: roundMoney(amount),
    paymentDate,
    paymentMethod: normalizeOptionalString(row.paymentMethod),
    notes: normalizeOptionalString(row.notes),
    registeredBy: normalizeOptionalString(row.registeredBy),
    registeredByUserId: normalizeOptionalString(row.registeredByUserId),
    registeredAt,
    resultingAmountReceived: roundMoney(Math.max(resultingAmountReceived, 0)),
    resultingRemainingBalance: roundMoney(Math.max(resultingRemainingBalance, 0)),
    resultingFinancialStatus,
    resultingOperationalStatus: normalizeOptionalString(row.resultingOperationalStatus),
  };
}

function readRawPayments(metadata: JsonObject): ManualPaymentEntry[] {
  const container = metadata[FINANCIAL_LEDGER_KEY];
  if (!container || typeof container !== 'object') return [];

  const paymentsRaw = (container as JsonObject).payments;
  if (!Array.isArray(paymentsRaw)) return [];

  return paymentsRaw
    .map((entry) => sanitizePaymentEntry(entry))
    .filter((entry): entry is ManualPaymentEntry => Boolean(entry));
}

function sortPaymentsChronologically(entries: ManualPaymentEntry[]): ManualPaymentEntry[] {
  return [...entries].sort((a, b) => {
    const aTs = Date.parse(a.registeredAt);
    const bTs = Date.parse(b.registeredAt);
    if (Number.isFinite(aTs) && Number.isFinite(bTs) && aTs !== bTs) return aTs - bTs;
    return a.id.localeCompare(b.id);
  });
}

export function readFinancialLedger(
  metadata: JsonObject | null | undefined,
  orderTotal: number,
  fallbackAmountReceived?: number | null,
): FinancialLedgerSnapshot {
  const safeMeta: JsonObject = metadata && typeof metadata === 'object' ? metadata : {};
  const total = roundMoney(Math.max(orderTotal, 0));
  const payments = sortPaymentsChronologically(readRawPayments(safeMeta));

  const ledgerContainer =
    safeMeta[FINANCIAL_LEDGER_KEY] && typeof safeMeta[FINANCIAL_LEDGER_KEY] === 'object'
      ? (safeMeta[FINANCIAL_LEDGER_KEY] as JsonObject)
      : null;

  const storedAmountReceived = normalizeNumber(ledgerContainer?.amountReceived);
  const fallback = normalizeNumber(fallbackAmountReceived);

  const derivedFromPayments =
    payments.length > 0 ? payments[payments.length - 1].resultingAmountReceived : null;
  const amountReceived = roundMoney(
    Math.max(derivedFromPayments ?? storedAmountReceived ?? fallback ?? 0, 0),
  );
  const remainingBalance = roundMoney(Math.max(total - amountReceived, 0));
  const status = deriveFinancialStatus(total, amountReceived);

  const updatedAt =
    normalizeOptionalString(ledgerContainer?.updatedAt) ??
    (payments.length > 0 ? payments[payments.length - 1].registeredAt : null);

  return {
    orderTotal: total,
    amountReceived,
    remainingBalance,
    status,
    payments,
    updatedAt,
  };
}

export function upsertFinancialLedger(
  metadata: JsonObject,
  ledger: FinancialLedgerSnapshot,
): JsonObject {
  const next = { ...metadata };
  next[FINANCIAL_LEDGER_KEY] = {
    orderTotal: ledger.orderTotal,
    amountReceived: ledger.amountReceived,
    remainingBalance: ledger.remainingBalance,
    status: ledger.status,
    updatedAt: ledger.updatedAt ?? new Date().toISOString(),
    payments: ledger.payments,
  };
  return next;
}

export function resolveProductionReleasePolicy(metadata: JsonObject | null | undefined): ProductionReleasePolicy {
  const safeMeta: JsonObject = metadata && typeof metadata === 'object' ? metadata : {};
  const metadataPolicy =
    safeMeta.paymentPolicy && typeof safeMeta.paymentPolicy === 'object'
      ? normalizeOptionalString((safeMeta.paymentPolicy as JsonObject).productionReleasePolicy)
      : null;

  if (metadataPolicy === 'allow_partial_payment' || metadataPolicy === 'full_payment_required') {
    return metadataPolicy;
  }

  const envPolicyRaw = (process.env.PROMOBI_MANUAL_PAYMENT_RELEASE_POLICY ?? '').trim().toLowerCase();
  if (envPolicyRaw === 'full_payment_required' || envPolicyRaw === 'full') {
    return 'full_payment_required';
  }
  if (envPolicyRaw === 'allow_partial_payment' || envPolicyRaw === 'partial') {
    return 'allow_partial_payment';
  }

  // Default keeps current operational behavior: first valid payment can release production.
  return 'allow_partial_payment';
}

export function shouldReleaseOperationalWorkflow(input: {
  policy: ProductionReleasePolicy;
  orderTotal: number;
  amountReceived: number;
}): boolean {
  const total = roundMoney(Math.max(input.orderTotal, 0));
  const received = roundMoney(Math.max(input.amountReceived, 0));

  if (received <= EPSILON) return false;
  if (input.policy === 'allow_partial_payment') return true;
  return received + EPSILON >= total;
}

export function isPreProductionOperationalStatus(status: string): boolean {
  return (
    status === 'PENDING' ||
    status === 'PENDING_PAYMENT' ||
    status === 'AWAITING_VERIFICATION' ||
    status === 'PAID'
  );
}

export function applyManualPayment(
  snapshot: FinancialLedgerSnapshot,
  input: ApplyManualPaymentInput,
): { nextSnapshot: FinancialLedgerSnapshot; entry: ManualPaymentEntry } {
  const nowIso = input.registeredAt ?? new Date().toISOString();
  const amount = roundMoney(Math.max(input.amount, 0));
  const paymentDate = normalizeOptionalString(input.paymentDate) ?? nowIso;
  const paymentMethod = normalizeOptionalString(input.paymentMethod);
  const notes = normalizeOptionalString(input.notes);
  const nextAmountReceived = roundMoney(snapshot.amountReceived + amount);
  const nextRemainingBalance = roundMoney(Math.max(snapshot.orderTotal - nextAmountReceived, 0));
  const nextStatus = deriveFinancialStatus(snapshot.orderTotal, nextAmountReceived);

  const entry: ManualPaymentEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    amount,
    paymentDate,
    paymentMethod,
    notes,
    registeredBy: normalizeOptionalString(input.registeredBy),
    registeredByUserId: normalizeOptionalString(input.registeredByUserId),
    registeredAt: nowIso,
    resultingAmountReceived: nextAmountReceived,
    resultingRemainingBalance: nextRemainingBalance,
    resultingFinancialStatus: nextStatus,
    resultingOperationalStatus: normalizeOptionalString(input.resultingOperationalStatus),
  };

  const nextSnapshot: FinancialLedgerSnapshot = {
    ...snapshot,
    amountReceived: nextAmountReceived,
    remainingBalance: nextRemainingBalance,
    status: nextStatus,
    payments: [...snapshot.payments, entry],
    updatedAt: nowIso,
  };

  return { nextSnapshot, entry };
}
