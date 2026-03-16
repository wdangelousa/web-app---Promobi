/**
 * services/translationRouter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Translation Router — decides which pipeline handles a translation request.
 *
 * Current state: always returns 'legacy'.
 *   - USE_STRUCTURED_TRANSLATION=false (default) → legacy pipeline only
 *   - USE_STRUCTURED_TRANSLATION=true            → legacy pipeline runs normally;
 *                                                   structured pipeline ALSO runs in parallel
 *                                                   (see services/structuredPipeline.ts)
 *
 * The structured pipeline runs alongside the legacy one — it does not replace it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { FEATURE_FLAGS } from '@/lib/featureFlags';

export type TranslationPipeline = 'legacy' | 'structured';

export interface TranslationRouterContext {
  orderId?: string | number;
  documentId?: string | number;
}

/**
 * Selects the appropriate translation pipeline based on feature flags.
 * Always returns 'legacy' until the structured pipeline is implemented.
 */
export function selectTranslationPipeline(context?: TranslationRouterContext): TranslationPipeline {
  const label = context
    ? `Order #${context.orderId ?? '?'} Doc #${context.documentId ?? '?'} —`
    : '';

  if (FEATURE_FLAGS.USE_STRUCTURED_TRANSLATION) {
    console.log(
      `[translationRouter] ${label} structured translation enabled — legacy + structured pipelines will both run`
    );
    return 'legacy';
  }

  console.log(`[translationRouter] ${label} pipeline selected: legacy (USE_STRUCTURED_TRANSLATION=false)`);
  return 'legacy';
}

// NOTE: The structured pipeline implementation lives in services/structuredPipeline.ts.
// Use isEligibleForStructuredPipeline() and runMarriageCertStructuredPipeline() from there.
