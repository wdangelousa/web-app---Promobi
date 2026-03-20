/**
 * services/translationRouter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Translation Router — decides which pipeline handles a translation request.
 *
 * Routing logic:
 *   - 'structured'  → document type is in an implemented structured family AND
 *                     either the feature flag is on or forcedBlueprint=true.
 *   - 'standard'    → all other cases (plain Claude translation output).
 *
 * Callers must still validate forcedBlueprint eligibility and handle the 422
 * guard independently (router does not return errors — only pipeline labels).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { FEATURE_FLAGS } from '@/lib/featureFlags';
import { isDocumentTypeInImplementedStructuredFamily } from '@/services/documentFamilyRegistry';
import type { DocumentType } from '@/services/documentClassifier';

export type TranslationPipeline = 'structured' | 'standard';

export interface TranslationRouterContext {
  orderId?: string | number;
  documentId?: string | number;
  /** Classified document type — required to make an accurate routing decision. */
  documentType?: DocumentType;
  /** True when the operator explicitly requested faithful_layout / anthropic_blueprint. */
  forcedBlueprint?: boolean;
}

/**
 * Returns the translation pipeline to use for this request.
 *
 * 'structured'  → run structured extraction + rendering pipeline.
 * 'standard'    → return plain Claude translation HTML as-is.
 *
 * When documentType is absent the router cannot determine eligibility and
 * defaults to 'standard' (safe fallback).
 */
export function selectTranslationPipeline(context?: TranslationRouterContext): TranslationPipeline {
  if (!context?.documentType) {
    console.log('[translationRouter] documentType absent — pipeline: standard');
    return 'standard';
  }

  const { orderId, documentId, documentType, forcedBlueprint } = context;
  const label = orderId != null ? `Order #${orderId} Doc #${documentId ?? '?'} —` : '';
  const familyImplemented = isDocumentTypeInImplementedStructuredFamily(documentType);

  if (forcedBlueprint && familyImplemented) {
    console.log(`[translationRouter] ${label} pipeline: structured (forced blueprint, family=${documentType})`);
    return 'structured';
  }

  if (FEATURE_FLAGS.USE_STRUCTURED_TRANSLATION && familyImplemented) {
    console.log(`[translationRouter] ${label} pipeline: structured (flag enabled, family=${documentType})`);
    return 'structured';
  }

  console.log(`[translationRouter] ${label} pipeline: standard (documentType=${documentType}, forcedBlueprint=${forcedBlueprint ?? false}, flagEnabled=${FEATURE_FLAGS.USE_STRUCTURED_TRANSLATION}, familyImplemented=${familyImplemented})`);
  return 'standard';
}
