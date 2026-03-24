type PricedPage = {
  price?: number | null;
  included?: boolean | null;
};

type PricedAnalysis = {
  pages?: PricedPage[] | null;
};

type PricedDocument = {
  count?: number | null;
  notarized?: boolean | null;
  handwritten?: boolean | null;
  analysis?: PricedAnalysis | null;
};

export type ProposalServiceType = 'translation' | 'notarization';
export type ProposalPaymentPlan = 'upfront_discount' | 'upfront' | 'split';

export interface ProposalPricingBreakdown {
  basePrice: number;
  fullBasePrice: number;
  urgencyFee: number;
  notaryFee: number;
  totalDocs: number;
  totalCount: number;
  minOrderApplied: boolean;
  totalMinimumAdjustment: number;
  totalDiscountApplied: number;
  totalSavings: number;
  excludedPages: number;
  volumeDiscountPercentage: number;
  volumeDiscountAmount: number;
  manualDiscountAmount?: number;
}

interface CalculateProposalBreakdownInput {
  documents: PricedDocument[];
  serviceType: ProposalServiceType;
  urgency: string;
  basePricePerPage: number;
  notaryFeePerDoc: number;
  urgencyMultiplier: number;
  paymentPlan?: ProposalPaymentPlan;
}

interface DeriveProposalFinancialSummaryInput {
  totalAmount?: number | null;
  extraDiscount?: number | null;
  metadata?: unknown;
}

export interface ProposalFinancialSummary {
  fullBasePrice: number;
  billableBasePrice: number;
  totalSavings: number;
  urgencyFee: number;
  notaryFee: number;
  volumeDiscountPercentage: number;
  volumeDiscountAmount: number;
  paymentDiscountAmount: number;
  operationalAdjustmentAmount: number;
  manualDiscountAmount: number;
  totalPayable: number;
}

type ProposalBreakdownLike = Record<string, any>;

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asCount(value: unknown, fallback = 1): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function safeMetadata(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? (raw as Record<string, any>) : {};
}

export function sanitizeProposalBreakdown(rawBreakdown: unknown): ProposalBreakdownLike {
  const breakdown = safeMetadata(rawBreakdown);

  return {
    ...breakdown,
    manualDiscountAmount: 0,
  };
}

export function calculateCanonicalProposalTotal(input: {
  breakdown?: unknown;
  operationalAdjustmentAmount?: number | null;
}): number {
  const breakdown = sanitizeProposalBreakdown(input.breakdown);
  const basePrice = roundCurrency(asNumber(breakdown.basePrice));
  const urgencyFee = roundCurrency(asNumber(breakdown.urgencyFee));
  const notaryFee = roundCurrency(asNumber(breakdown.notaryFee));
  const volumeDiscountAmount = roundCurrency(asNumber(breakdown.volumeDiscountAmount));
  const paymentDiscountAmount = roundCurrency(asNumber(breakdown.totalDiscountApplied));
  const operationalAdjustmentAmount = roundCurrency(asNumber(input.operationalAdjustmentAmount));

  return roundCurrency(
    basePrice +
      urgencyFee +
      notaryFee -
      volumeDiscountAmount -
      paymentDiscountAmount -
      operationalAdjustmentAmount,
  );
}

function summarizeDocument(doc: PricedDocument, basePricePerPage: number) {
  const pages = doc.analysis?.pages ?? [];
  const multiplier = doc.handwritten ? 1.25 : 1;

  if (pages.length === 0) {
    const count = asCount(doc.count, 1);
    const price = roundCurrency(count * basePricePerPage * multiplier);
    return {
      billableBasePrice: price,
      fullBasePrice: price,
      billablePages: count,
      excludedPages: 0,
    };
  }

  const billablePages = pages.filter((page) => page.included !== false);
  const fullBasePrice = pages.reduce((sum, page) => sum + asNumber(page.price), 0) * multiplier;
  const billableBasePrice = billablePages.reduce(
    (sum, page) => sum + asNumber(page.price),
    0,
  ) * multiplier;

  return {
    billableBasePrice: roundCurrency(billableBasePrice),
    fullBasePrice: roundCurrency(fullBasePrice),
    billablePages: billablePages.length,
    excludedPages: pages.length - billablePages.length,
  };
}

function deriveSavingsFromDocuments(documents: any[]): number {
  return roundCurrency(
    documents.reduce((sum, doc) => {
      const pages = doc?.analysis?.pages ?? [];
      if (pages.length === 0) return sum;
      const full = pages.reduce((acc: number, page: any) => acc + asNumber(page?.price), 0);
      const billable = pages
        .filter((page: any) => page?.included !== false)
        .reduce((acc: number, page: any) => acc + asNumber(page?.price), 0);
      const multiplier = doc?.handwritten ? 1.25 : 1;
      return sum + (full - billable) * multiplier;
    }, 0),
  );
}

export function calculateProposalBreakdown(
  input: CalculateProposalBreakdownInput,
): { breakdown: ProposalPricingBreakdown; total: number } {
  const selectedDocuments = input.documents ?? [];
  let basePrice = 0;
  let fullBasePrice = 0;
  let totalCount = 0;
  let excludedPages = 0;
  let notaryFee = 0;

  if (input.serviceType === 'translation') {
    for (const doc of selectedDocuments) {
      const summary = summarizeDocument(doc, input.basePricePerPage);
      basePrice += summary.billableBasePrice;
      fullBasePrice += summary.fullBasePrice;
      totalCount += summary.billablePages;
      excludedPages += summary.excludedPages;
      notaryFee += doc.notarized ? input.notaryFeePerDoc : 0;
    }
  } else {
    totalCount = selectedDocuments.length;
    notaryFee = selectedDocuments.length * input.notaryFeePerDoc;
  }

  basePrice = roundCurrency(basePrice);
  fullBasePrice = roundCurrency(fullBasePrice);

  const baseWithUrgency =
    input.serviceType === 'translation'
      ? roundCurrency(basePrice * input.urgencyMultiplier)
      : basePrice;
  const urgencyFee = roundCurrency(baseWithUrgency - basePrice);

  let volumeDiscountPercentage = 0;
  if (input.serviceType === 'translation') {
    if (totalCount >= 51) volumeDiscountPercentage = 15;
    else if (totalCount >= 31) volumeDiscountPercentage = 10;
    else if (totalCount >= 16) volumeDiscountPercentage = 5;
  }

  const volumeDiscountAmount = roundCurrency(
    baseWithUrgency * (volumeDiscountPercentage / 100),
  );

  let total = roundCurrency(baseWithUrgency - volumeDiscountAmount + notaryFee);
  let totalDiscountApplied = 0;

  if (
    input.serviceType === 'translation' &&
    input.urgency === 'standard' &&
    input.paymentPlan === 'upfront_discount'
  ) {
    totalDiscountApplied = roundCurrency(total * 0.05);
    total = roundCurrency(total - totalDiscountApplied);
  }

  return {
    breakdown: {
      basePrice,
      fullBasePrice,
      urgencyFee,
      notaryFee: roundCurrency(notaryFee),
      totalDocs: selectedDocuments.length,
      totalCount,
      minOrderApplied: false,
      totalMinimumAdjustment: 0,
      totalDiscountApplied,
      totalSavings: roundCurrency(fullBasePrice - basePrice),
      excludedPages,
      volumeDiscountPercentage,
      volumeDiscountAmount,
    },
    total,
  };
}

export function deriveProposalFinancialSummary(
  input: DeriveProposalFinancialSummaryInput,
): ProposalFinancialSummary {
  const metadata = safeMetadata(input.metadata);
  const breakdown = sanitizeProposalBreakdown(metadata.breakdown);
  const documents = Array.isArray(metadata.documents) ? metadata.documents : [];

  const totalSavings = roundCurrency(
    asNumber(breakdown.totalSavings) || deriveSavingsFromDocuments(documents),
  );
  const urgencyFee = roundCurrency(asNumber(breakdown.urgencyFee));
  const notaryFee = roundCurrency(asNumber(breakdown.notaryFee));
  const volumeDiscountAmount = roundCurrency(asNumber(breakdown.volumeDiscountAmount));
  const paymentDiscountAmount = roundCurrency(asNumber(breakdown.totalDiscountApplied));
  const operationalAdjustmentAmount = roundCurrency(asNumber(input.extraDiscount));
  const manualDiscountAmount = 0;
  const volumeDiscountPercentage = asNumber(breakdown.volumeDiscountPercentage);
  const totalPayable = calculateCanonicalProposalTotal({
    breakdown,
    operationalAdjustmentAmount,
  });

  const derivedFullBasePrice = roundCurrency(
    totalPayable +
      totalSavings +
      volumeDiscountAmount +
      paymentDiscountAmount +
      operationalAdjustmentAmount +
      urgencyFee -
      notaryFee,
  );

  const fullBasePrice = roundCurrency(
    asNumber(breakdown.fullBasePrice) || derivedFullBasePrice,
  );

  return {
    fullBasePrice,
    billableBasePrice: roundCurrency(fullBasePrice - totalSavings),
    totalSavings,
    urgencyFee,
    notaryFee,
    volumeDiscountPercentage,
    volumeDiscountAmount,
    paymentDiscountAmount,
    operationalAdjustmentAmount,
    manualDiscountAmount,
    totalPayable,
  };
}