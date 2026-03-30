/**
 * services/structuredPreviewKit.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Assembles a 3-part structured preview kit (internal preview only):
 *
 *   Part 1:  HTML certification cover          — generated via Gotenberg from
 *                                               a controlled HTML template.
 *                                               Uses letterhead.png as the
 *                                               full-page background (it IS the
 *                                               approved visual template: butterfly
 *                                               logo + corner accents baked in).
 *                                               ATA and ATIF badges are overlaid
 *                                               in the header zone.  All metadata
 *                                               fields are embedded natively.
 *
 *   Part 2:  Translated document              — generated via Gotenberg from
 *                                               structured HTML with calibrated
 *                                               print margins.  The HTML template
 *                                               provides all visual branding (logo,
 *                                               gold border, footer chrome).
 *                                               PDF letterhead overlay is applied
 *                                               ONLY for external PDF overrides.
 *
 *   Part 3:  Original source document         — original PDF appended as-is
 *                                               (skipped if source is not PDF)
 *
 * Cover variant selection (PART 1):
 *   If input.coverVariant is provided, it is used directly.
 *   Otherwise derived from sourceLanguage:
 *     ES / es  → 'es-en'
 *     Anything else (PT_BR, pt, unknown) → 'pt-en'
 *
 * Cover assets loaded from /public:
 *   letterhead.png             full-page background (butterfly logo + corner accents)
 *   logo-ata.png               ATA logo (header zone, center)
 *   atif.png                   ATIF badge (header zone, right)
 *   assinatura-isabele.png.jpg Isabele's signature (footer-left)
 *   selo-ata.png               ATA seal (footer-right)
 *
 * Invariants:
 *   - Never writes to the database.
 *   - Never modifies Document, Order, delivery_pdf_url, or translation_status.
 *   - Never affects the legacy pipeline or generateDeliveryKit.ts.
 *   - Never exposes artefacts to the client.
 *   - Never throws — all errors are caught and reflected in the result type.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';
import type { DocumentOrientation } from '@/lib/documentOrientationDetector';
import {
  renderHtmlWithGotenberg,
  type GotenbergExtraFile,
  type GotenbergFailure,
} from '@/lib/gotenbergClient';
import {
  buildTranslatedGotenbergSettings,
  buildTranslatedSafeAreaPageCss,
  getTranslatedPageSafeArea,
  injectTranslatedPageSafeArea,
} from '@/lib/translatedPageSafeArea';
import {
  detectSourceLanguageLeakageFromHtml,
  normalizeLanguageCode,
} from '@/lib/translatedLanguageIntegrity';
import {
  resolveSourcePageCount,
  type SourceArtifactType,
  type SourcePageCountStrategy,
} from '@/lib/sourcePageCountResolver';
import type { PageParityMode } from '@/lib/translationArtifactSource';
import {
  applyInitialRenderProfile,
  applyRecoveryToHtml,
  buildInitialRenderProfile,
  buildPageLayoutBudget,
  buildPreRenderLayoutHints,
  computeRenderQualityTier,
  isParityRecoveryNeeded,
  isParityUnderflow,
  resolveParityLabel,
  PARITY_MAX_RECOVERY_LEVEL,
  type InitialRenderProfile,
  type ParityRecoveryLevel,
  type PreRenderLayoutHints,
  type RenderQualityTier,
} from '@/lib/parityRecovery';

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_BUCKET = 'documents';

const LETTERHEAD_PATH = join(process.cwd(), 'public', 'letterhead.png');
const LETTERHEAD_LANDSCAPE_PATH = join(process.cwd(), 'public', 'letterhead-landscape.png');

// Local fallback: .artifacts/structured-preview-kits/ at project root.
const LOCAL_ARTIFACTS_DIR = join(process.cwd(), '.artifacts', 'structured-preview-kits');

// ── Gotenberg paper settings ──────────────────────────────────────────────────

/**
 * Cover page: zero Gotenberg margins — all spacing is controlled by CSS
 * padding inside the HTML template.
 */
const GOTENBERG_COVER: Record<string, string> = {
  paperWidth: '8.5',
  paperHeight: '11',
  marginTop: '0',
  marginBottom: '0',
  marginLeft: '0',
  marginRight: '0',
  printBackground: 'true',
  preferCssPageSize: 'false',
  skipNetworkIdleEvent: 'true',
};

// Source language labels used in cover metadata.
const SOURCE_LANGUAGE_LABELS: Record<string, string> = {
  PT_BR: 'Portuguese (Brazil)',
  PT: 'Portuguese',
  pt: 'Portuguese',
  ES: 'Spanish',
  es: 'Spanish',
  FR: 'French',
  fr: 'French',
  EN: 'English',
  en: 'English',
};

type LanguageGateSource = 'upstream_language_integrity' | 'fallback_html_scan';

// ── Cover asset specs ─────────────────────────────────────────────────────────

interface CoverAssetSpec {
  filename: string;
  path: string;
  mimeType: string;
  role: string;
}

const COVER_ASSET_SPECS: CoverAssetSpec[] = [
  {
    filename: 'letterhead.png',
    path: LETTERHEAD_PATH,
    mimeType: 'image/png',
    role: 'full-page background: approved letterhead template (butterfly logo + corner accents)',
  },
  {
    filename: 'logo-ata.png',
    path: join(process.cwd(), 'public', 'logo-ata.png'),
    mimeType: 'image/png',
    role: 'ATA logo (header zone, center)',
  },
  {
    filename: 'atif.png',
    path: join(process.cwd(), 'public', 'atif.png'),
    mimeType: 'image/png',
    role: 'ATIF badge (header zone, right)',
  },
  {
    filename: 'assinatura-isabele.png.jpg',
    path: join(process.cwd(), 'public', 'assinatura-isabele.png.jpg'),
    mimeType: 'image/jpeg',
    role: 'Isabele signature (footer-left)',
  },
  {
    filename: 'selo-ata.png',
    path: join(process.cwd(), 'public', 'selo-ata.png'),
    mimeType: 'image/png',
    role: 'ATA seal (footer-right)',
  },
];

/**
 * Loads all cover assets from disk. Never throws.
 */
function loadCoverAssets(logPrefix: string): GotenbergExtraFile[] {
  const found: string[] = [];
  const missing: string[] = [];
  const loaded: GotenbergExtraFile[] = [];

  for (const spec of COVER_ASSET_SPECS) {
    try {
      const buf = readFileSync(spec.path);
      loaded.push({ filename: spec.filename, buffer: buf, mimeType: spec.mimeType });
      found.push(`${spec.filename} (${spec.role})`);
    } catch {
      missing.push(`${spec.filename} (${spec.role})`);
    }
  }

  console.log(`${logPrefix} — real cover assets found: [${found.join(', ')}]`);
  if (missing.length > 0) {
    console.warn(`${logPrefix} — cover assets not found in /public: [${missing.join(', ')}]`);
  }

  return loaded;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StructuredPreviewKitInput {
  structuredHtml: string;
  /**
   * When true, apply the letterhead PNG overlay to the translated PDF
   * unconditionally via pdf-lib, regardless of any HTML content detection.
   * Used by the structured renderer pipeline where CSS-based letterhead
   * is not viable (Gotenberg API margins clip the CSS canvas background).
   */
  forceLetterheadOverlay?: boolean;
  externalTranslatedPdfBuffer?: ArrayBuffer;
  originalFileBuffer: ArrayBuffer;
  isOriginalPdf: boolean;
  orderId: string | number;
  documentId: string | number;
  sourceLanguage?: string;
  targetLanguage?: string;
  coverVariant?: 'pt-en' | 'es-en';
  orientation?: DocumentOrientation;
  documentTypeLabel?: string;
  sourcePageCount?: number;
  sourceArtifactType?: SourceArtifactType | string;
  sourcePageCountStrategy?: SourcePageCountStrategy | string;
  groupedSourceImageCount?: number;
  originalFileUrl?: string | null;
  originalContentType?: string | null;
  hybridSinglePageEvidence?: boolean;
  documentDate?: string;
  documentFamily?: string;
  rendererName?: string;
  /**
   * Translation modality — governs parity-recovery policy.
   *   'faithful'     → parity recovery ladder is activated when translated page
   *                    count exceeds source page count.
   *   'standard'     → parity is not enforced during rendering (default).
   *   'external_pdf' → handled upstream; recovery is never invoked.
   */
  modality?: 'standard' | 'faithful' | 'external_pdf';
  /**
   * Phase 2 pre-render layout hints. When present for faithful-modality
   * documents, `buildStructuredKitBuffer` selects a density-derived initial
   * render profile (balanced / compact / dense) and applies it before the
   * first Gotenberg pass, reducing reliance on the recovery ladder.
   */
  layoutHints?: PreRenderLayoutHints;
  surface?: 'preview-kit' | 'delivery-kit' | 'unknown';
  compactionAttempted?: boolean;
  languageIntegrity?: StructuredLanguageIntegritySignal;
  pageParityDecision?: StructuredPageParityDecision | null;
}

export interface StructuredPageParityDecision {
  mode: PageParityMode;
  sourceRelevantPageCount?: number | null;
  justification?: string | null;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
}

export interface PageParityDecisionContext {
  parity_decision_required: true;
  defaultMode: 'strict_all_pages';
  currentMode: PageParityMode;
  sourcePhysicalPageCount: number | null;
  sourceRelevantPageCount: number | null;
  translatedPageCount: number | null;
  suggestedModes: PageParityMode[];
  blockingReason:
    | 'page_parity_mismatch'
    | 'page_parity_unverifiable_source_page_count';
}

export interface StructuredLanguageIntegritySignal {
  targetLanguage: string;
  sourceLanguage: string;
  translatedPayloadFound: boolean;
  translatedZonesCount: number | null;
  sourceZonesCount: number | null;
  missingTranslatedZones: string[];
  sourceContentAttempted: boolean;
  sourceLanguageMarkers: string[];
  requiredZones: string[];
  translatedZonesFound: string[];
  sourceLanguageContaminatedZones: string[];
  mappedGenericZones: string[];
  languageIssueType:
    | 'none'
    | 'missing_translated_zones'
    | 'source_language_mismatch'
    | 'missing_and_source_language_mismatch';
}

export interface StructuredPreviewKitResult {
  assembled: boolean;
  coverGenerated: boolean;
  coverMetadataApplied: boolean;
  translatedSectionGenerated: boolean;
  originalAppended: boolean;
  kitPath?: string;
  kitUrl?: string;
  kitLocalPath?: string;
  letterheadDetected: boolean;
  letterheadInjected: boolean;
  sourcePageCount?: number;
  translatedPageCount?: number;
  sourcePhysicalPageCount?: number;
  sourceRelevantPageCount?: number;
  pageParityStatus?: 'pass' | 'fail';
  pageParityMode?: PageParityMode;
  parityDecisionRequired?: boolean;
  parityDecisionContext?: PageParityDecisionContext;
  blockingReason?: string;
  certificationGenerationBlocked?: boolean;
  releaseBlocked?: boolean;
  /** True when source had exactly 1 page and the translated render produced 2+ pages. */
  singlePageExpansionDetected?: boolean;
}

export interface PageParityDiagnostic {
  orderId: string | number;
  docId: string | number;
  detected_family: string;
  source_language: string;
  target_language: string;
  translated_payload_found: boolean;
  translated_zones_count: number | null;
  source_zones_count: number | null;
  missing_translated_zones: string[];
  required_zones: string[];
  translated_zones_found: string[];
  source_language_contaminated_zones: string[];
  mapped_generic_zones: string[];
  language_issue_type: string;
  source_content_attempted: boolean;
  source_language_markers: string[];
  true_source_content_leakage: string[];
  allowed_literal_content: string[];
  false_positive_source_language_marker: string[];
  missing_translated_zone_content: string[];
  language_gate_source: LanguageGateSource;
  source_artifact_type: string;
  source_page_count_strategy: string;
  resolved_source_page_count: number | null;
  page_parity_mode: PageParityMode;
  source_physical_page_count: number | null;
  source_relevant_page_count: number | null;
  source_page_count: number | null;
  translated_page_count: number | null;
  gotenberg_endpoint_used: string | null;
  gotenberg_failure_type: string | null;
  gotenberg_failure_detail: string | null;
  gotenberg_status_code: number | null;
  parity_status: 'pass' | 'fail';
  blocking_reason: string;
  renderer_used: string;
  orientation_used: string;
  compaction_attempted: boolean;
  certification_generation_blocked: boolean;
  release_blocked: boolean;
}

export interface StructuredKitBuildResult {
  success: boolean;
  kitBuffer?: Buffer;
  blockingReason?: string;
  sourcePageCount?: number;
  sourcePhysicalPageCount?: number;
  sourceRelevantPageCount?: number;
  translatedPageCount?: number;
  parityStatus?: 'pass' | 'fail';
  pageParityMode?: PageParityMode;
  parityDecisionRequired?: boolean;
  parityDecisionContext?: PageParityDecisionContext;
  diagnostics?: PageParityDiagnostic;
  /**
   * True when source had exactly 1 page and the translated render produced 2+
   * pages. Callers should retry with faithful-light before surfacing the
   * parity decision modal.
   */
  singlePageExpansionDetected?: boolean;
}

// ── Local fallback helper ─────────────────────────────────────────────────────

function saveLocalFallback(
  content: Buffer,
  filename: string,
  logPrefix: string,
): string | null {
  try {
    mkdirSync(LOCAL_ARTIFACTS_DIR, { recursive: true });
    const filePath = join(LOCAL_ARTIFACTS_DIR, filename);
    writeFileSync(filePath, content);
    return filePath;
  } catch (err) {
    console.error(`${logPrefix} local fallback write error: ${err}`);
    return null;
  }
}

function logPageParityDiagnostics(
  logPrefix: string,
  diagnostics: PageParityDiagnostic,
): void {
  console.log(
    `${logPrefix} — page parity diagnostics: ${JSON.stringify(diagnostics)}`,
  );
}

function buildLanguageIntegritySignal(
  input: StructuredPreviewKitInput,
): StructuredLanguageIntegritySignal {
  const sourceLanguage = (input.languageIntegrity?.sourceLanguage ?? input.sourceLanguage ?? 'unknown').toUpperCase();
  const targetLanguage = (input.languageIntegrity?.targetLanguage ?? input.targetLanguage ?? 'EN').toUpperCase();
  return {
    targetLanguage,
    sourceLanguage,
    translatedPayloadFound: input.languageIntegrity?.translatedPayloadFound ?? false,
    translatedZonesCount: input.languageIntegrity?.translatedZonesCount ?? null,
    sourceZonesCount: input.languageIntegrity?.sourceZonesCount ?? null,
    missingTranslatedZones: [...(input.languageIntegrity?.missingTranslatedZones ?? [])],
    sourceContentAttempted: input.languageIntegrity?.sourceContentAttempted ?? false,
    sourceLanguageMarkers: [...(input.languageIntegrity?.sourceLanguageMarkers ?? [])],
    requiredZones: [...(input.languageIntegrity?.requiredZones ?? [])],
    translatedZonesFound: [...(input.languageIntegrity?.translatedZonesFound ?? [])],
    sourceLanguageContaminatedZones: [
      ...(input.languageIntegrity?.sourceLanguageContaminatedZones ?? []),
    ],
    mappedGenericZones: [...(input.languageIntegrity?.mappedGenericZones ?? [])],
    languageIssueType: input.languageIntegrity?.languageIssueType ?? 'none',
  };
}

function isEnglishTargetLanguage(targetLanguage: string): boolean {
  return normalizeLanguageCode(targetLanguage) === 'EN';
}

interface SourceLanguageMarkerClassification {
  trueSourceContentLeakage: string[];
  allowedLiteralContent: string[];
  falsePositiveSourceLanguageMarker: string[];
}

function markerZonePrefix(marker: string): string | null {
  const separatorIndex = marker.indexOf(':');
  if (separatorIndex <= 0) return null;
  const prefix = marker.slice(0, separatorIndex).trim();
  return prefix || null;
}

function classifySourceLanguageMarkers(
  markers: string[],
  options: {
    sourceLanguageContaminatedZones?: string[];
    treatUnscopedAsFalsePositive?: boolean;
  } = {},
): SourceLanguageMarkerClassification {
  const trueSourceContentLeakage: string[] = [];
  const falsePositiveSourceLanguageMarker: string[] = [];
  const allowedLiteralContent: string[] = [];
  const contaminatedZones = new Set(
    (options.sourceLanguageContaminatedZones ?? [])
      .map((zone) => zone.trim())
      .filter(Boolean),
  );

  for (const marker of markers) {
    const zone = markerZonePrefix(marker);
    if (zone) {
      if (contaminatedZones.has(zone)) {
        trueSourceContentLeakage.push(marker);
      } else {
        falsePositiveSourceLanguageMarker.push(marker);
      }
      continue;
    }

    if (options.treatUnscopedAsFalsePositive) {
      falsePositiveSourceLanguageMarker.push(marker);
      continue;
    }

    trueSourceContentLeakage.push(marker);
  }

  return {
    trueSourceContentLeakage: Array.from(new Set(trueSourceContentLeakage)),
    allowedLiteralContent: Array.from(new Set(allowedLiteralContent)),
    falsePositiveSourceLanguageMarker: Array.from(
      new Set(falsePositiveSourceLanguageMarker),
    ),
  };
}

function hasUpstreamLanguageIntegrityEvidence(
  signal: StructuredLanguageIntegritySignal,
): boolean {
  return (
    signal.translatedPayloadFound ||
    signal.requiredZones.length > 0 ||
    signal.translatedZonesFound.length > 0 ||
    signal.sourceZonesCount !== null ||
    signal.translatedZonesCount !== null ||
    signal.languageIssueType !== 'none'
  );
}

function logLanguageIntegrityDiagnostics(
  logPrefix: string,
  diagnostics: {
    orderId: string | number;
    docId: string | number;
    family: string;
    targetLanguage: string;
    sourceLanguage: string;
    translatedPayloadFound: boolean;
    translatedZonesCount: number | null;
    sourceZonesCount: number | null;
    missingTranslatedZones: string[];
    requiredZones: string[];
    translatedZonesFound: string[];
    sourceLanguageContaminatedZones: string[];
    mappedGenericZones: string[];
    languageIssueType: string;
    sourceContentAttempted: boolean;
    sourceLanguageMarkers: string[];
    trueSourceContentLeakage: string[];
    allowedLiteralContent: string[];
    falsePositiveSourceLanguageMarker: string[];
    missingTranslatedZoneContent: string[];
    languageGateSource: LanguageGateSource;
    blockingReason: string;
  },
): void {
  console.log(
    `${logPrefix} — language integrity diagnostics: ${JSON.stringify(diagnostics)}`,
  );
}

const PAGE_PARITY_DEFAULT_MODE = 'strict_all_pages' as const;

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function normalizePageParityDecision(
  decision: StructuredPageParityDecision | null | undefined,
): StructuredPageParityDecision | null {
  if (!decision) return null;
  const mode = decision.mode;
  if (
    mode !== 'strict_all_pages' &&
    mode !== 'content_pages_only' &&
    mode !== 'first_page_only' &&
    mode !== 'manual_override'
  ) {
    return null;
  }

  return {
    mode,
    sourceRelevantPageCount: normalizePositiveInteger(decision.sourceRelevantPageCount),
    justification:
      typeof decision.justification === 'string'
        ? decision.justification.trim() || null
        : null,
    approvedByUserId:
      typeof decision.approvedByUserId === 'string'
        ? decision.approvedByUserId.trim() || null
        : null,
    approvedAt:
      typeof decision.approvedAt === 'string'
        ? decision.approvedAt.trim() || null
        : null,
  };
}

function buildSuggestedParityModes(
  sourcePhysicalPageCount: number | null,
  translatedPageCount: number | null,
): PageParityMode[] {
  if (!sourcePhysicalPageCount || sourcePhysicalPageCount <= 0) {
    return ['strict_all_pages', 'manual_override'];
  }

  const suggested: PageParityMode[] = ['strict_all_pages'];
  if (
    translatedPageCount &&
    translatedPageCount > 0 &&
    translatedPageCount <= sourcePhysicalPageCount
  ) {
    suggested.push('content_pages_only');
  }
  if (sourcePhysicalPageCount > 1) {
    suggested.push('first_page_only');
  }
  suggested.push('manual_override');
  return Array.from(new Set(suggested));
}

interface PageParityEvaluationInput {
  sourcePhysicalPageCount: number | null;
  translatedPageCount: number;
  decision: StructuredPageParityDecision | null;
}

interface PageParityEvaluationResult {
  mode: PageParityMode;
  sourceRelevantPageCount: number | null;
  parityPass: boolean;
  decisionRequired: boolean;
  blockingReason:
    | 'none'
    | 'page_parity_mismatch'
    | 'page_parity_unverifiable_source_page_count'
    | 'page_parity_manual_override_requires_justification';
  decisionContext?: PageParityDecisionContext;
}

function evaluatePageParity(
  input: PageParityEvaluationInput,
): PageParityEvaluationResult {
  const mode = input.decision?.mode ?? PAGE_PARITY_DEFAULT_MODE;
  const sourcePhysicalPageCount = input.sourcePhysicalPageCount;
  const translatedPageCount = input.translatedPageCount;
  const suggestedModes = buildSuggestedParityModes(
    sourcePhysicalPageCount,
    translatedPageCount,
  );

  if (sourcePhysicalPageCount === null) {
    if (mode === 'manual_override') {
      if (!input.decision?.justification) {
        return {
          mode,
          sourceRelevantPageCount: null,
          parityPass: false,
          decisionRequired: false,
          blockingReason: 'page_parity_manual_override_requires_justification',
        };
      }
      return {
        mode,
        sourceRelevantPageCount: null,
        parityPass: true,
        decisionRequired: false,
        blockingReason: 'none',
      };
    }

    if (input.decision) {
      return {
        mode,
        sourceRelevantPageCount: null,
        parityPass: false,
        decisionRequired: false,
        blockingReason: 'page_parity_unverifiable_source_page_count',
      };
    }

    return {
      mode,
      sourceRelevantPageCount: null,
      parityPass: false,
      decisionRequired: true,
      blockingReason: 'page_parity_unverifiable_source_page_count',
      decisionContext: {
        parity_decision_required: true,
        defaultMode: PAGE_PARITY_DEFAULT_MODE,
        currentMode: mode,
        sourcePhysicalPageCount: null,
        sourceRelevantPageCount: null,
        translatedPageCount,
        suggestedModes,
        blockingReason: 'page_parity_unverifiable_source_page_count',
      },
    };
  }

  if (mode === 'manual_override') {
    if (!input.decision?.justification) {
      return {
        mode,
        sourceRelevantPageCount: null,
        parityPass: false,
        decisionRequired: false,
        blockingReason: 'page_parity_manual_override_requires_justification',
      };
    }
    return {
      mode,
      sourceRelevantPageCount: input.decision.sourceRelevantPageCount ?? null,
      parityPass: true,
      decisionRequired: false,
      blockingReason: 'none',
    };
  }

  if (mode === 'first_page_only') {
    const sourceRelevantPageCount = sourcePhysicalPageCount > 0 ? 1 : null;
    const parityPass = translatedPageCount === 1;
    if (!parityPass) {
      return {
        mode,
        sourceRelevantPageCount,
        parityPass: false,
        decisionRequired: false,
        blockingReason: 'page_parity_mismatch',
      };
    }
    return {
      mode,
      sourceRelevantPageCount,
      parityPass: true,
      decisionRequired: false,
      blockingReason: 'none',
    };
  }

  if (mode === 'content_pages_only') {
    const sourceRelevantPageCount =
      input.decision?.sourceRelevantPageCount ??
      (translatedPageCount > 0 && translatedPageCount <= sourcePhysicalPageCount
        ? translatedPageCount
        : null);
    const parityPass =
      sourceRelevantPageCount !== null &&
      sourceRelevantPageCount > 0 &&
      sourceRelevantPageCount <= sourcePhysicalPageCount &&
      translatedPageCount === sourceRelevantPageCount;
    if (!parityPass) {
      return {
        mode,
        sourceRelevantPageCount,
        parityPass: false,
        decisionRequired: false,
        blockingReason: 'page_parity_mismatch',
      };
    }
    return {
      mode,
      sourceRelevantPageCount,
      parityPass: true,
      decisionRequired: false,
      blockingReason: 'none',
    };
  }

  const strictParityPass = translatedPageCount === sourcePhysicalPageCount;
  if (strictParityPass) {
    return {
      mode,
      sourceRelevantPageCount: sourcePhysicalPageCount,
      parityPass: true,
      decisionRequired: false,
      blockingReason: 'none',
    };
  }

  if (input.decision) {
    return {
      mode,
      sourceRelevantPageCount: sourcePhysicalPageCount,
      parityPass: false,
      decisionRequired: false,
      blockingReason: 'page_parity_mismatch',
    };
  }

  return {
    mode,
    sourceRelevantPageCount: sourcePhysicalPageCount,
    parityPass: false,
    decisionRequired: true,
    blockingReason: 'page_parity_mismatch',
    decisionContext: {
      parity_decision_required: true,
      defaultMode: PAGE_PARITY_DEFAULT_MODE,
      currentMode: mode,
      sourcePhysicalPageCount,
      sourceRelevantPageCount: sourcePhysicalPageCount,
      translatedPageCount,
      suggestedModes,
      blockingReason: 'page_parity_mismatch',
    },
  };
}

// ── Cover variant derivation ──────────────────────────────────────────────────

function deriveCoverVariant(sourceLanguage?: string): 'pt-en' | 'es-en' {
  const upper = (sourceLanguage ?? '').toUpperCase();
  return upper === 'ES' ? 'es-en' : 'pt-en';
}

// ── HTML certification cover ──────────────────────────────────────────────────

function buildCertificationCoverHtml(
  variant: 'pt-en' | 'es-en',
  meta: {
    documentType: string;
    sourceLanguage: string;
    sourcePageCount: number | string;
    translatedPageCount: number | string;
    orderId: string | number;
    dated: string;
    documentDate?: string;
  },
  loadedAssets: Set<string>,
): string {
  const coverVariantLabel = variant === 'es-en' ? 'Spanish to English' : 'Portuguese to English';
  const coverSourceLanguage = variant === 'es-en' ? 'Spanish' : 'Portuguese';

  const certificationBodyHtml = variant === 'es-en'
    ? `<p>
  I, <strong>Isabele Bandeira de Moraes D'Angelo</strong>, certify that I am competent to translate
  from Spanish into English and that the attached translation is a
  <strong>complete</strong> and <strong>accurate translation</strong> of the attached original document.
</p>
<p>
  This certification is issued for official use, including but not limited to immigration,
  academic, banking, and institutional purposes, as required.
</p>`
    : `<p>
  I, <strong>Isabele Bandeira de Moraes D'Angelo</strong>, certify that I am competent to translate
  from Portuguese into English and that the attached translation is a
  <strong>complete</strong> and <strong>accurate translation</strong> of the attached original document.
</p>
<p>
  This certification is issued for official use, including but not limited to immigration,
  academic, banking, and institutional purposes, as required.
</p>`;

  const hasLh = loadedAssets.has('letterhead.png');
  const hasAta = loadedAssets.has('logo-ata.png');
  const hasAtif = loadedAssets.has('atif.png');
  const hasSig = loadedAssets.has('assinatura-isabele.png.jpg');
  const hasSeal = loadedAssets.has('selo-ata.png');

  const lhImg = hasLh ? `<img src="letterhead.png" alt="">` : '';
  const ataImg = hasAta ? `<img class="logo-ata" src="logo-ata.png" alt="American Translators Association">` : '';
  const atifImg = hasAtif ? `<img class="logo-atif" src="atif.png" alt="ATIF">` : '';
  const sigImg = hasSig ? `<img class="signature-img" src="assinatura-isabele.png.jpg" alt="Signature of Isabele Bandeira de Moraes D'Angelo">` : '';
  const sealImg = hasSeal ? `<img class="seal-img" src="selo-ata.png" alt="ATA Seal">` : '';

  const documentDate = meta.documentDate ?? '\u2014';
  const targetLanguage = 'English (United States)';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Certification of Translation Accuracy — Promobidocs</title>
  <style>
    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    @page {
      size: letter;
      margin: 0;
    }

    html, body {
      width: 100%;
      height: 100%;
      font-family: Arial, Helvetica, sans-serif;
      color: #2f2f2f;
      background: #fff;
    }

    .page {
      position: relative;
      width: 8.5in;
      min-height: 11in;
      margin: 0 auto;
      overflow: hidden;
      background: #fff;
    }

    .cover-bg {
      position: absolute;
      inset: 0;
      z-index: 0;
    }

    .cover-bg img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .content {
      position: relative;
      z-index: 2;
      height: 11in;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 0.55in 0.65in 1.3in 0.65in;
    }

    .header {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 14px;
      min-height: 0.95in;
      padding-left: 2.5in;
      padding-right: 0.2in;
    }

    .header img {
      display: block;
      object-fit: contain;
    }

    .logo-ata {
      height: 0.52in;
      max-width: 1.45in;
    }

    .logo-atif {
      height: 0.48in;
      max-width: 0.95in;
    }

    .title-block {
      text-align: center;
    }

    .eyebrow {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1.6px;
      text-transform: uppercase;
      color: #8b5a2b;
      margin-bottom: 6px;
    }

    .title {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 23px;
      line-height: 1.2;
      font-weight: 700;
      text-transform: uppercase;
      color: #2a2a2a;
      letter-spacing: 0.8px;
    }

    .lang-pair {
      margin-top: 8px;
      font-size: 13px;
      font-weight: 700;
      color: #c46f1e;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }

    .meta-wrap {
      border: 1px solid #e3d7cb;
      border-radius: 8px;
      overflow: hidden;
      background: rgba(255,255,255,0.94);
    }

    .meta-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
    }

    .meta-table td {
      border: 1px solid #eadfd6;
      padding: 9px 12px;
      vertical-align: middle;
    }

    .meta-table .label {
      width: 23%;
      background: #f8f1eb;
      font-weight: 700;
      color: #5a4638;
    }

    .meta-table .value {
      color: #2f2f2f;
    }

    .body {
      padding: 0 0.05in;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 12pt;
      line-height: 1.5;
      color: #2f2f2f;
    }

    .body p + p {
      margin-top: 10px;
    }

    .body strong {
      font-weight: 700;
    }

    .divider {
      height: 2px;
      background: linear-gradient(90deg, #8b5a2b, #d29452);
      border: none;
    }

    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 24px;
    }

    .footer-left {
      flex: 1;
      min-width: 0;
    }

    .signature-img {
      height: 0.52in;
      width: auto;
      display: block;
      margin-bottom: 6px;
    }

    .translator-name {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 15px;
      font-weight: 700;
      color: #2f2f2f;
    }

    .credential {
      margin-top: 3px;
      font-size: 12px;
      color: #4d4d4d;
      line-height: 1.45;
    }

    .contact {
      margin-top: 10px;
      font-size: 11.5px;
      color: #4d4d4d;
      line-height: 1.6;
    }

    .footer-right {
      width: 1.55in;
      text-align: center;
      flex-shrink: 0;
    }

    .seal-img {
      width: 1.35in;
      height: 1.35in;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }

    .footer-note {
      margin-top: 4px;
      font-size: 9px;
      color: #666;
      line-height: 1.3;
    }

    @media print {
      .page {
        width: 100%;
        min-height: auto;
        page-break-after: always;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="cover-bg">
      ${lhImg}
    </div>

    <div class="content">
      <div class="header">
        ${ataImg}
        ${atifImg}
      </div>

      <div class="title-block">
        <div class="eyebrow">Certified Translation</div>
        <div class="title">Certification of Translation Accuracy</div>
        <div class="lang-pair">${coverVariantLabel}</div>
      </div>

      <div class="meta-wrap">
        <table class="meta-table">
          <tr>
            <td class="label">Document Type</td>
            <td class="value">${String(meta.documentType || '\u2014')}</td>
            <td class="label">Order #</td>
            <td class="value">${String(meta.orderId)}</td>
          </tr>
          <tr>
            <td class="label">Source Language</td>
            <td class="value">${coverSourceLanguage}</td>
            <td class="label">Target Language</td>
            <td class="value">${targetLanguage}</td>
          </tr>
          <tr>
            <td class="label">Source Pages</td>
            <td class="value">${String(meta.sourcePageCount)}</td>
            <td class="label">Translated Pages</td>
            <td class="value">${String(meta.translatedPageCount)}</td>
          </tr>
          <tr>
            <td class="label">Dated</td>
            <td class="value">${meta.dated}</td>
            <td class="label">Document Date</td>
            <td class="value">${documentDate}</td>
          </tr>
        </table>
      </div>

      <div class="body">
        ${certificationBodyHtml}
      </div>

      <hr class="divider" />

      <div class="footer">
        <div class="footer-left">
          ${sigImg}
          <div class="translator-name">Isabele Bandeira de Moraes D'Angelo</div>
          <div class="credential">American Translators Association — Member No. M-194918</div>
          <div class="credential">ATIF Registration — #3622</div>
          <div class="contact">
            Telephone: +1 321 324-5851<br>
            Email: desk@promobidocs.com<br>
            3300 Greenwald Way N, Kissimmee, FL
          </div>
        </div>
        <div class="footer-right">
          ${sealImg}
          <div class="footer-note">
            Professional translation certification
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ── Translated document HTML wrapper ─────────────────────────────────────────

export function buildTranslatedDocumentHtml(
  translatedText: string,
  orientation?: 'portrait' | 'landscape',
): string {
  const isLandscape = orientation === 'landscape';
  const safeAreaPageCss = buildTranslatedSafeAreaPageCss(
    isLandscape ? 'landscape' : 'portrait',
  );
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    ${safeAreaPageCss}

    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.55;
      background: #fff;
      color: #111;
      margin: 0;
      padding: 0;
      width: 100%;
    }

    body {
      word-break: break-word;
      overflow-wrap: break-word;
    }

    /* Landscape: constrain line length for readability */
    .content-body {
      ${isLandscape ? 'max-width: 7in; margin: 0 auto;' : ''}
    }

    p {
      margin: 0 0 8pt 0;
    }

    /* Heading hierarchy — distinct sizes, not flat 11pt */
    h1 {
      font-size: 13pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 14pt 0 6pt 0;
      padding-bottom: 4pt;
      border-bottom: 0.75pt solid #aaa;
    }

    h2 {
      font-size: 12pt;
      font-weight: bold;
      margin: 10pt 0 5pt 0;
    }

    h3 {
      font-size: 11pt;
      font-weight: bold;
      font-style: italic;
      margin: 8pt 0 4pt 0;
    }

    strong, b { font-weight: bold; }

    /* Page-break / section dividers */
    hr {
      border: none;
      border-top: 0.75pt solid #ccc;
      margin: 10pt 0;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 10pt;
      table-layout: fixed;
    }

    td, th {
      padding: 5pt 8pt;
      border: 1px solid #ccc;
      font-size: 10pt;
      vertical-align: top;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    th {
      background: #f5f5f5;
      font-weight: bold;
      text-align: left;
    }

    img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  <div class="content-body">
    ${translatedText}
  </div>
</body>
</html>`;
}

// ── PDF overlay helper ────────────────────────────────────────────────────────

function loadLetterheadBuffer(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

function stripCssLetterheadBackground(html: string): string {
  return html
    .replace(
      /background\s*:\s*url\(['"]letterhead(?:-landscape)?\.png['"]\)[^;]*;/gi,
      'background: none;',
    )
    .replace(
      /background-image\s*:\s*url\(['"]letterhead(?:-landscape)?\.png['"]\)[^;]*;/gi,
      'background-image: none;',
    );
}

async function applyLetterheadOverlayToPdf(
  pdfBuffer: Buffer,
  letterheadBuffer: Buffer,
  logPrefix: string,
  contentMargins?: { topIn: number; rightIn: number; bottomIn: number; leftIn: number },
): Promise<Buffer | null> {
  try {
    const { rgb } = await import('pdf-lib');
    const srcPdf = await PDFDocument.load(pdfBuffer);
    const finalPdf = await PDFDocument.create();

    const letterheadImage = await finalPdf.embedPng(letterheadBuffer);
    const srcPages = srcPdf.getPages();
    const embeddedPages = await finalPdf.embedPages(srcPages);
    const margins = contentMargins ?? {
      topIn: 1.85,
      rightIn: 0.7,
      bottomIn: 0.75,
      leftIn: 1.0,
    };
    const pointsPerInch = 72;

    for (const embeddedPage of embeddedPages) {
      const { width, height } = embeddedPage;
      const page = finalPdf.addPage([width, height]);

      // 1. Letterhead across the full page
      page.drawImage(letterheadImage, {
        x: 0,
        y: 0,
        width,
        height,
        opacity: 1,
      });

      // 2. White mask over the safe content box so any internal decorative
      // bands inside the PNG do not remain behind the translated text.
      page.drawRectangle({
        x: margins.leftIn * pointsPerInch,
        y: margins.bottomIn * pointsPerInch,
        width: width - ((margins.leftIn + margins.rightIn) * pointsPerInch),
        height: height - ((margins.topIn + margins.bottomIn) * pointsPerInch),
        color: rgb(1, 1, 1),
      });

      // 3. Content on top
      page.drawPage(embeddedPage, {
        x: 0,
        y: 0,
        width,
        height,
      });
    }

    return Buffer.from(await finalPdf.save());
  } catch (err) {
    console.error(`${logPrefix} — translated letterhead overlay error: ${err}`);
    return null;
  }
}

// ── Gotenberg helper ──────────────────────────────────────────────────────────

interface GotenbergCallResult {
  buffer: Buffer | null;
  endpointUsed: string | null;
  failure: GotenbergFailure | null;
}

function formatGotenbergFailureDetail(failure: GotenbergFailure | null): string | null {
  if (!failure) return null;
  const parts = [
    failure.message,
    failure.causeCode ? `cause=${failure.causeCode}` : '',
    failure.responseSnippet ? `response=${failure.responseSnippet}` : '',
  ].filter(Boolean);
  return parts.join(' | ');
}

async function callGotenberg(
  html: string,
  settings: Record<string, string>,
  logPrefix: string,
  label: string,
  extraFiles?: GotenbergExtraFile[],
): Promise<GotenbergCallResult> {
  console.log(`${logPrefix} — MARGINS (${label}):`, JSON.stringify(settings));
  const result = await renderHtmlWithGotenberg({
    html,
    settings,
    logPrefix,
    label,
    extraFiles,
  });
  if (!result.ok || !result.buffer) {
    return {
      buffer: null,
      endpointUsed: result.endpointUsed,
      failure: result.failure,
    };
  }
  return {
    buffer: result.buffer,
    endpointUsed: result.endpointUsed,
    failure: null,
  };
}

// ── Shared kit buffer builder ─────────────────────────────────────────────────

/**
 * Assembles the 3-part kit PDF (cover + translated + original) and returns the
 * raw Buffer WITHOUT uploading or touching the database.
 *
 * Used by both:
 *   - assembleStructuredPreviewKit  (preview → orders/previews/ in documents bucket)
 *   - generateDeliveryKit           (official → orders/completed/ in translations bucket)
 *
 * Returns a structured build result. On any failure, success=false and the
 * blocking reason is included for upstream client-facing guards.
 */
export async function buildStructuredKitBuffer(
  input: StructuredPreviewKitInput,
): Promise<StructuredKitBuildResult> {
  const logPrefix = `[buildStructuredKitBuffer] Order #${input.orderId} Doc #${input.documentId}`;
  const log = (msg: string) => console.log(`${logPrefix} — ${msg}`);
  const surface = input.surface ?? 'unknown';
  const languageIntegrity = buildLanguageIntegritySignal(input);
  const upstreamMarkerClassification = classifySourceLanguageMarkers(
    languageIntegrity.sourceLanguageMarkers,
    {
      sourceLanguageContaminatedZones:
        languageIntegrity.sourceLanguageContaminatedZones,
    },
  );
  const normalizedParityDecision = normalizePageParityDecision(
    input.pageParityDecision,
  );
  const requestedParityMode =
    normalizedParityDecision?.mode ?? PAGE_PARITY_DEFAULT_MODE;
  const baseDiagnostics = {
    orderId: input.orderId,
    docId: input.documentId,
    detected_family: input.documentFamily ?? 'unknown',
    source_language: languageIntegrity.sourceLanguage,
    target_language: languageIntegrity.targetLanguage,
    translated_payload_found: languageIntegrity.translatedPayloadFound,
    translated_zones_count: languageIntegrity.translatedZonesCount,
    source_zones_count: languageIntegrity.sourceZonesCount,
    missing_translated_zones: languageIntegrity.missingTranslatedZones,
    required_zones: languageIntegrity.requiredZones,
    translated_zones_found: languageIntegrity.translatedZonesFound,
    source_language_contaminated_zones:
      languageIntegrity.sourceLanguageContaminatedZones,
    mapped_generic_zones: languageIntegrity.mappedGenericZones,
    language_issue_type: languageIntegrity.languageIssueType,
    source_content_attempted: languageIntegrity.sourceContentAttempted,
    source_language_markers: languageIntegrity.sourceLanguageMarkers,
    true_source_content_leakage:
      upstreamMarkerClassification.trueSourceContentLeakage,
    allowed_literal_content: upstreamMarkerClassification.allowedLiteralContent,
    false_positive_source_language_marker:
      upstreamMarkerClassification.falsePositiveSourceLanguageMarker,
    missing_translated_zone_content: languageIntegrity.missingTranslatedZones,
    language_gate_source: 'upstream_language_integrity' as const,
    source_artifact_type: input.sourceArtifactType ?? 'unknown',
    source_page_count_strategy: input.sourcePageCountStrategy ?? 'undetermined',
    resolved_source_page_count:
      typeof input.sourcePageCount === 'number' && input.sourcePageCount > 0
        ? input.sourcePageCount
        : null,
    page_parity_mode: requestedParityMode,
    source_physical_page_count:
      typeof input.sourcePageCount === 'number' && input.sourcePageCount > 0
        ? input.sourcePageCount
        : null,
    source_relevant_page_count:
      normalizedParityDecision?.sourceRelevantPageCount ?? null,
    gotenberg_endpoint_used: null as string | null,
    gotenberg_failure_type: null as string | null,
    gotenberg_failure_detail: null as string | null,
    gotenberg_status_code: null as number | null,
    renderer_used: input.rendererName ?? 'unknown',
    orientation_used: input.orientation ?? 'portrait',
    compaction_attempted: input.compactionAttempted ?? false,
  } as const;
  const shouldMarkReleaseBlocked = surface === 'delivery-kit';

  try {
    const coverVariant = input.coverVariant ?? deriveCoverVariant(input.sourceLanguage);
    const isLandscape = input.orientation === 'landscape';
    const translatedOrientation = isLandscape ? 'landscape' : 'portrait';
    const safeArea = getTranslatedPageSafeArea(translatedOrientation);
    const paperSettings = buildTranslatedGotenbergSettings(translatedOrientation);
    const htmlEmbedsLetterhead = input.structuredHtml.includes('data:image/png;base64,');
    if (htmlEmbedsLetterhead) {
      paperSettings.marginTop = '0';
      paperSettings.marginBottom = '0';
      paperSettings.marginLeft = '0';
      paperSettings.marginRight = '0';
      paperSettings.preferCssPageSize = 'true';
      log('gotenberg: zero margins + preferCssPageSize (self-contained letterhead detected)');
    }
    log(`orientation: ${input.orientation ?? 'portrait (default)'}`);
    log(
      `translated safe area policy: orientation=${safeArea.orientation} ` +
      `margins(top/right/bottom/left)=${safeArea.marginTopIn}/${safeArea.marginRightIn}/` +
      `${safeArea.marginBottomIn}/${safeArea.marginLeftIn} in`,
    );

    // ── Part 2: Translated document PDF ──────────────────────────────────────
    const hasExternalTranslatedPdfOverride =
      input.externalTranslatedPdfBuffer instanceof ArrayBuffer &&
      input.externalTranslatedPdfBuffer.byteLength > 0;
    const targetLhPath = isLandscape ? LETTERHEAD_LANDSCAPE_PATH : LETTERHEAD_PATH;
    const letterheadBuffer = loadLetterheadBuffer(targetLhPath);

    if (letterheadBuffer) {
      log(`letterhead detected: yes (${targetLhPath})`);
    } else {
      log(`letterhead detected: no (${targetLhPath})`);
    }

    let translatedPdfBuffer: Buffer;
    let translatedPdfDoc: PDFDocument;
    let translatedPageCount: number;

    if (hasExternalTranslatedPdfOverride) {
      log(`translated section source: external PDF override`);
      translatedPdfBuffer = Buffer.from(input.externalTranslatedPdfBuffer!);
      try {
        translatedPdfDoc = await PDFDocument.load(translatedPdfBuffer, {
          ignoreEncryption: true,
        });
      } catch (err) {
        const diagnostics: PageParityDiagnostic = {
          ...baseDiagnostics,
          source_page_count: input.sourcePageCount ?? null,
          translated_page_count: null,
          parity_status: 'fail',
          blocking_reason: 'external_translation_pdf_invalid',
          certification_generation_blocked: true,
          release_blocked: shouldMarkReleaseBlocked,
        };
        logPageParityDiagnostics(logPrefix, diagnostics);
        return {
          success: false,
          blockingReason: diagnostics.blocking_reason,
          parityStatus: 'fail',
          diagnostics,
        };
      }

      translatedPageCount = translatedPdfDoc.getPageCount();

      if (letterheadBuffer) {
        const overlayBuffer = await applyLetterheadOverlayToPdf(
          translatedPdfBuffer,
          letterheadBuffer,
          logPrefix,
          {
            topIn: parseFloat(safeArea.marginTopIn),
            rightIn: parseFloat(safeArea.marginRightIn),
            bottomIn: parseFloat(safeArea.marginBottomIn),
            leftIn: parseFloat(safeArea.marginLeftIn),
          },
        );
        if (overlayBuffer) {
          translatedPdfBuffer = overlayBuffer;
          translatedPdfDoc = await PDFDocument.load(translatedPdfBuffer);
          log(`letterhead overlay applied: yes (external PDF)`);
        } else {
          log(`letterhead overlay applied: no (overlay failed, external PDF)`);
        }
      } else {
        log(`letterhead overlay applied: no (file not found, external PDF)`);
      }

      logLanguageIntegrityDiagnostics(logPrefix, {
        orderId: input.orderId,
        docId: input.documentId,
        family: input.documentFamily ?? 'unknown',
        targetLanguage: languageIntegrity.targetLanguage,
        sourceLanguage: languageIntegrity.sourceLanguage,
        translatedPayloadFound: languageIntegrity.translatedPayloadFound,
        translatedZonesCount: languageIntegrity.translatedZonesCount,
        sourceZonesCount: languageIntegrity.sourceZonesCount,
        missingTranslatedZones: languageIntegrity.missingTranslatedZones,
        requiredZones: languageIntegrity.requiredZones,
        translatedZonesFound: languageIntegrity.translatedZonesFound,
        sourceLanguageContaminatedZones:
          languageIntegrity.sourceLanguageContaminatedZones,
        mappedGenericZones: languageIntegrity.mappedGenericZones,
        languageIssueType: languageIntegrity.languageIssueType,
        sourceContentAttempted: languageIntegrity.sourceContentAttempted,
        sourceLanguageMarkers: languageIntegrity.sourceLanguageMarkers,
        trueSourceContentLeakage:
          upstreamMarkerClassification.trueSourceContentLeakage,
        allowedLiteralContent: upstreamMarkerClassification.allowedLiteralContent,
        falsePositiveSourceLanguageMarker:
          upstreamMarkerClassification.falsePositiveSourceLanguageMarker,
        missingTranslatedZoneContent: languageIntegrity.missingTranslatedZones,
        languageGateSource: 'upstream_language_integrity',
        blockingReason: 'none',
      });
    } else {
      const renderStructuredHtml = input.forceLetterheadOverlay
        ? stripCssLetterheadBackground(input.structuredHtml)
        : input.structuredHtml;
      const safeAreaStructuredHtml = injectTranslatedPageSafeArea(
        renderStructuredHtml,
        translatedOrientation,
      );
      const missingTranslatedZones = languageIntegrity.missingTranslatedZones;
      let languageGateSource: LanguageGateSource = 'upstream_language_integrity';
      let combinedSourceLanguageMarkers = [...languageIntegrity.sourceLanguageMarkers];
      let trueSourceContentLeakage = [
        ...upstreamMarkerClassification.trueSourceContentLeakage,
      ];
      let allowedLiteralContent = [
        ...upstreamMarkerClassification.allowedLiteralContent,
      ];
      let falsePositiveSourceLanguageMarker = [
        ...upstreamMarkerClassification.falsePositiveSourceLanguageMarker,
      ];

      let shouldBlockForLanguageIntegrity =
        isEnglishTargetLanguage(languageIntegrity.targetLanguage) &&
        (
          missingTranslatedZones.length > 0 ||
          languageIntegrity.languageIssueType !== 'none' ||
          trueSourceContentLeakage.length > 0
        );

      if (
        isEnglishTargetLanguage(languageIntegrity.targetLanguage) &&
        !hasUpstreamLanguageIntegrityEvidence(languageIntegrity)
      ) {
        languageGateSource = 'fallback_html_scan';
        const htmlLeakage = detectSourceLanguageLeakageFromHtml(
          safeAreaStructuredHtml,
          {
            sourceLanguage: languageIntegrity.sourceLanguage,
            targetLanguage: languageIntegrity.targetLanguage,
          },
        );
        const fallbackClassification = classifySourceLanguageMarkers(
          htmlLeakage.matchedMarkers,
          {
            sourceLanguageContaminatedZones: [],
            treatUnscopedAsFalsePositive: false,
          },
        );
        trueSourceContentLeakage = Array.from(
          new Set([
            ...trueSourceContentLeakage,
            ...fallbackClassification.trueSourceContentLeakage,
          ]),
        );
        allowedLiteralContent = Array.from(
          new Set([
            ...allowedLiteralContent,
            ...fallbackClassification.allowedLiteralContent,
          ]),
        );
        falsePositiveSourceLanguageMarker = Array.from(
          new Set([
            ...falsePositiveSourceLanguageMarker,
            ...fallbackClassification.falsePositiveSourceLanguageMarker,
          ]),
        );
        combinedSourceLanguageMarkers = Array.from(
          new Set([
            ...combinedSourceLanguageMarkers,
            ...htmlLeakage.matchedMarkers,
          ]),
        );
        shouldBlockForLanguageIntegrity =
          shouldBlockForLanguageIntegrity ||
          fallbackClassification.trueSourceContentLeakage.length > 0;
      }

      const resolvedSourceContentAttempted =
        languageIntegrity.sourceContentAttempted ||
        trueSourceContentLeakage.length > 0 ||
        missingTranslatedZones.length > 0;
      const languageBlockingReason = shouldBlockForLanguageIntegrity
        ? 'translated_zone_content_missing_or_source_language_detected'
        : 'none';

      logLanguageIntegrityDiagnostics(logPrefix, {
        orderId: input.orderId,
        docId: input.documentId,
        family: input.documentFamily ?? 'unknown',
        targetLanguage: languageIntegrity.targetLanguage,
        sourceLanguage: languageIntegrity.sourceLanguage,
        translatedPayloadFound: languageIntegrity.translatedPayloadFound,
        translatedZonesCount: languageIntegrity.translatedZonesCount,
        sourceZonesCount: languageIntegrity.sourceZonesCount,
        missingTranslatedZones,
        requiredZones: languageIntegrity.requiredZones,
        translatedZonesFound: languageIntegrity.translatedZonesFound,
        sourceLanguageContaminatedZones:
          languageIntegrity.sourceLanguageContaminatedZones,
        mappedGenericZones: languageIntegrity.mappedGenericZones,
        languageIssueType: languageIntegrity.languageIssueType,
        sourceContentAttempted: resolvedSourceContentAttempted,
        sourceLanguageMarkers: combinedSourceLanguageMarkers,
        trueSourceContentLeakage,
        allowedLiteralContent,
        falsePositiveSourceLanguageMarker,
        missingTranslatedZoneContent: missingTranslatedZones,
        languageGateSource,
        blockingReason: languageBlockingReason,
      });

      if (shouldBlockForLanguageIntegrity) {
        const diagnostics: PageParityDiagnostic = {
          ...baseDiagnostics,
          source_language_markers: combinedSourceLanguageMarkers,
          true_source_content_leakage: trueSourceContentLeakage,
          allowed_literal_content: allowedLiteralContent,
          false_positive_source_language_marker:
            falsePositiveSourceLanguageMarker,
          missing_translated_zone_content: missingTranslatedZones,
          language_gate_source: languageGateSource,
          source_content_attempted: resolvedSourceContentAttempted,
          source_page_count: input.sourcePageCount ?? null,
          translated_page_count: null,
          parity_status: 'fail',
          blocking_reason: languageBlockingReason,
          certification_generation_blocked: true,
          release_blocked: shouldMarkReleaseBlocked,
        };
        logPageParityDiagnostics(logPrefix, diagnostics);
        return {
          success: false,
          blockingReason: diagnostics.blocking_reason,
          parityStatus: 'fail',
          diagnostics,
        };
      }

      // ── Phase 2: Apply initial render profile before first Gotenberg pass ──────
      // For faithful-modality documents with layout hints, select a density-
      // derived render profile and apply it to the HTML before the first render.
      // This pre-optimises font size, line height, cell padding, and (for dense
      // pages) annotation verbosity, reducing reliance on the recovery ladder.
      let firstRenderHtml = safeAreaStructuredHtml;
      let firstRenderProfile: InitialRenderProfile | null = null;
      if (input.modality === 'faithful' && input.layoutHints) {
        firstRenderProfile = buildInitialRenderProfile(input.layoutHints);
        firstRenderHtml = applyInitialRenderProfile(safeAreaStructuredHtml, firstRenderProfile);
        log(
          `first-render profile: ${firstRenderProfile.name} ` +
          `font=${firstRenderProfile.fontSizePx}px ` +
          `lineHeight=${firstRenderProfile.lineHeight} ` +
          `cellPad=${firstRenderProfile.cellPaddingPx}px ` +
          `paraMargin=${firstRenderProfile.paraMarginBottomEm}em ` +
          `annotationCompaction=${firstRenderProfile.annotationCompactionMode}`,
        );
      }

      // Attach the official Promobidocs letterhead so the HTML template's
      // Attach letterhead file to Gotenberg only when the HTML references it
      // (mirror_html path via buildTranslatedPageHtml). Structured renderer HTML
      // may also be self-contained via data URI, which needs no extra file.
      const translatedExtraFiles: GotenbergExtraFile[] = [];
      const htmlReferencesLetterhead =
        !input.forceLetterheadOverlay &&
        (
          input.structuredHtml.includes('letterhead.png') ||
          input.structuredHtml.includes('letterhead-landscape.png')
        );
      if (htmlReferencesLetterhead) {
        const targetLhFile = isLandscape ? 'letterhead-landscape.png' : 'letterhead.png';
        const targetLhFullPath = isLandscape ? LETTERHEAD_LANDSCAPE_PATH : LETTERHEAD_PATH;
        try {
          const lhBuf = readFileSync(targetLhFullPath);
          translatedExtraFiles.push({ filename: targetLhFile, buffer: lhBuf, mimeType: 'image/png' });
          log(`letterhead attached for Gotenberg: ${targetLhFile} (mirror_html CSS path)`);
        } catch {
          log(`${targetLhFile} not found at ${targetLhFullPath} — CSS letterhead background will be absent`);
        }
      } else {
        log(`letterhead Gotenberg extra file skipped: structured renderer path uses PDF overlay`);
      }

      const translatedPdfBase = await callGotenberg(
        firstRenderHtml,
        paperSettings,
        logPrefix,
        'translated-section',
        translatedExtraFiles,
      );

      if (!translatedPdfBase.buffer) {
        log(`translated section: Gotenberg failed`);
        const diagnostics: PageParityDiagnostic = {
          ...baseDiagnostics,
          gotenberg_endpoint_used: translatedPdfBase.endpointUsed,
          gotenberg_failure_type: translatedPdfBase.failure?.type ?? null,
          gotenberg_failure_detail: formatGotenbergFailureDetail(
            translatedPdfBase.failure,
          ),
          gotenberg_status_code: translatedPdfBase.failure?.statusCode ?? null,
          source_page_count: input.sourcePageCount ?? null,
          translated_page_count: null,
          parity_status: 'fail',
          blocking_reason: 'translated_section_generation_failed',
          certification_generation_blocked: true,
          release_blocked: shouldMarkReleaseBlocked,
        };
        logPageParityDiagnostics(logPrefix, diagnostics);
        return {
          success: false,
          blockingReason: diagnostics.blocking_reason,
          parityStatus: 'fail',
          diagnostics,
        };
      }

      translatedPdfBuffer = translatedPdfBase.buffer;

      // ── Parity recovery loop (faithful modality only) ──────────────────────
      // For faithful-modality documents, if the initial render produces more
      // pages than the source, apply successive CSS/HTML compression levels
      // and re-render until parity is achieved or all levels are exhausted.
      // Standard and external_pdf modalities skip this block entirely.
      if (
        input.modality === 'faithful' &&
        typeof input.sourcePageCount === 'number' &&
        input.sourcePageCount > 0
      ) {
        let probePageCount = 0;
        try {
          const probe = await PDFDocument.load(translatedPdfBuffer, { ignoreEncryption: true });
          probePageCount = probe.getPageCount();
        } catch { /* leave probePageCount = 0 */ }

        // Log whether the initial render profile achieved parity or recovery is needed.
        if (firstRenderProfile) {
          const recoveryNeeded = isParityRecoveryNeeded(
            probePageCount,
            input.sourcePageCount,
            'faithful',
          );
          log(
            `first-render result: profile=${firstRenderProfile.name} ` +
            `translated=${probePageCount} source=${input.sourcePageCount} ` +
            `recovery_needed=${recoveryNeeded}`,
          );
        }

        // Detect underflow (translated renders fewer pages than source).
        // Not remediated in Phase 1 — detected and logged for diagnostics only.
        if (isParityUnderflow(probePageCount, input.sourcePageCount, 'faithful')) {
          log(
            `parity underflow: translated=${probePageCount} source=${input.sourcePageCount} ` +
            `delta=${input.sourcePageCount - probePageCount} — underflow is not remediated in Phase 1`,
          );
        }

        // Track recovery outcome for telemetry and quality tier.
        let recoveryWasNeeded = false;
        let resolvedAtLevel: ParityRecoveryLevel | null = null;
        let parityResolved = true; // true if first render or recovery achieved parity

        if (isParityRecoveryNeeded(probePageCount, input.sourcePageCount, 'faithful')) {
          recoveryWasNeeded = true;

          // V2 pipeline: deterministic HTML produces predictable pagination.
          // If first render achieved parity, skip recovery entirely.
          const isV2Pipeline = input.rendererName === 'mirror_html_v2';
          if (isV2Pipeline && probePageCount <= input.sourcePageCount) {
            log(
              `parity recovery: skipped (V2 pipeline, first render achieved parity) ` +
              `translated=${probePageCount} source=${input.sourcePageCount}`
            );
            recoveryWasNeeded = false;
          } else if (isV2Pipeline && probePageCount > input.sourcePageCount) {
            log(
              `parity recovery: V2 pipeline but overflow detected — ` +
              `translated=${probePageCount} source=${input.sourcePageCount} — ` +
              `falling through to recovery loop as safety net`
            );
          }

          if (recoveryWasNeeded) {
          const budget = buildPageLayoutBudget(
            input.sourcePageCount,
            isLandscape ? 'landscape' : 'portrait',
          );
          // Compute pre-render hints for the start-of-recovery log.
          // The profile may have already applied these hints in the first render;
          // recovery builds on firstRenderHtml (which includes any profile CSS)
          // and adds !important overrides at each successive level.
          const preRenderHints = buildPreRenderLayoutHints(budget);
          log(
            `parity recovery: start — translated=${probePageCount} source=${input.sourcePageCount} ` +
            `overflow=${probePageCount - input.sourcePageCount} page(s) ` +
            `budget_per_page=${budget.usableHeightPerSourcePageIn.toFixed(2)}in ` +
            `hints=font:${preRenderHints.suggestedFontSizePx}px/lh:${preRenderHints.suggestedLineHeight}/pad:${preRenderHints.suggestedCellPaddingPx}px`,
          );

          let bestBuffer = translatedPdfBuffer;
          let bestPageCount = probePageCount;
          let recoveryResolved = false;

          for (let lvl = 1; lvl <= PARITY_MAX_RECOVERY_LEVEL && !recoveryResolved; lvl++) {
            const level = lvl as ParityRecoveryLevel;
            // Recovery builds on firstRenderHtml (which may already include
            // initial-profile CSS). Recovery CSS uses !important and overrides
            // the profile baseline where needed.
            const recoveredHtml = applyRecoveryToHtml(firstRenderHtml, level);
            const htmlChanged = recoveredHtml.length !== firstRenderHtml.length;
            const recoveredResult = await callGotenberg(
              recoveredHtml,
              paperSettings,
              logPrefix,
              `parity-recovery-l${level}`,
              translatedExtraFiles,
            );

            if (recoveredResult.buffer) {
              let recoveredPageCount = 0;
              try {
                const recoveredDoc = await PDFDocument.load(
                  recoveredResult.buffer,
                  { ignoreEncryption: true },
                );
                recoveredPageCount = recoveredDoc.getPageCount();
              } catch { /* leave recoveredPageCount = 0 */ }

              log(
                `parity recovery level ${level}: translated_pages=${recoveredPageCount} ` +
                `source_pages=${input.sourcePageCount} ` +
                `page_delta=${recoveredPageCount - input.sourcePageCount} ` +
                `html_changed=${htmlChanged} ` +
                `resolved=${recoveredPageCount <= input.sourcePageCount}`,
              );

              if (recoveredPageCount <= input.sourcePageCount) {
                bestBuffer = recoveredResult.buffer;
                bestPageCount = recoveredPageCount;
                recoveryResolved = true;
                resolvedAtLevel = level;
                log(`parity recovery: resolved at level ${level}`);
                log(`parity recovery outcome: ${resolveParityLabel(level)}`);
              } else if (recoveredPageCount < bestPageCount) {
                // Partial improvement — keep as best candidate so far.
                bestBuffer = recoveredResult.buffer;
                bestPageCount = recoveredPageCount;
              }
            } else {
              log(`parity recovery level ${level}: Gotenberg failed`);
            }
          }

          if (!recoveryResolved) {
            parityResolved = false;
            log(
              `parity recovery: exhausted all levels — ` +
              `final_translated=${bestPageCount} source=${input.sourcePageCount}`,
            );
            log(`parity recovery outcome: ${resolveParityLabel(null)}`);
          }

          translatedPdfBuffer = bestBuffer;
          } // end if (recoveryWasNeeded)
        }

        // ── Profile effectiveness telemetry and render quality tier ────────────
        // Emit a structured log line grouping profile selection, recovery outcome,
        // and document context so operational dashboards can track:
        //   - how often each profile resolves parity on first render
        //   - how often each profile still requires L1/L2/L3/L4 recovery
        //   - render quality distribution by document type, family, orientation,
        //     and fallback vs. non-fallback path
        const isFallbackRenderer = (input.rendererName ?? '').includes('fallback');
        const qualityTier: RenderQualityTier = computeRenderQualityTier(
          firstRenderProfile,
          resolvedAtLevel,
          parityResolved,
          isFallbackRenderer,
          input.documentFamily,
        );
        log(
          `profile_telemetry: ` +
          `v2_pipeline=${input.rendererName === 'mirror_html_v2'} ` +
          `profile=${firstRenderProfile?.name ?? 'none'} ` +
          `first_render_resolved_parity=${!recoveryWasNeeded} ` +
          `recovery_was_needed=${recoveryWasNeeded} ` +
          `resolved_at_level=${resolvedAtLevel ?? 'none'} ` +
          `parity_resolved=${parityResolved} ` +
          `render_quality_tier=${qualityTier} ` +
          `document_type=${input.documentTypeLabel ?? 'unknown'} ` +
          `document_family=${input.documentFamily ?? 'unknown'} ` +
          `modality=${input.modality ?? 'unknown'} ` +
          `orientation=${isLandscape ? 'landscape' : 'portrait'} ` +
          `is_fallback_renderer=${isFallbackRenderer}`,
        );
      }

      // ── Letterhead overlay ─────────────────────────────────────────────────
      if (input.forceLetterheadOverlay && letterheadBuffer) {
        log(`letterhead overlay: applying (forceLetterheadOverlay=true)`);
        const overlayResult = await applyLetterheadOverlayToPdf(
          translatedPdfBuffer,
          letterheadBuffer,
          logPrefix,
          {
            topIn: parseFloat(safeArea.marginTopIn),
            rightIn: parseFloat(safeArea.marginRightIn),
            bottomIn: parseFloat(safeArea.marginBottomIn),
            leftIn: parseFloat(safeArea.marginLeftIn),
          },
        );
        if (overlayResult) {
          translatedPdfBuffer = overlayResult;
          log(`letterhead overlay: applied successfully`);
        } else {
          log(`letterhead overlay: failed (applyLetterheadOverlayToPdf returned null)`);
        }
      } else if (!input.forceLetterheadOverlay) {
        log(`letterhead overlay: skipped (forceLetterheadOverlay not set — mirror_html CSS path)`);
      } else {
        log(`letterhead overlay: skipped (letterhead file not found)`);
      }

      log(`translated section generated: yes`);
      translatedPdfDoc = await PDFDocument.load(translatedPdfBuffer);
      translatedPageCount = translatedPdfDoc.getPageCount();
    }

    log(`translated pages: ${translatedPageCount}`);

    const singlePageExpansionDetected =
      typeof input.sourcePageCount === 'number' &&
      input.sourcePageCount === 1 &&
      translatedPageCount > 1;

    if (singlePageExpansionDetected) {
      log(
        `single_page_expansion_detected: source=1 translated=${translatedPageCount} ` +
        `overflow=${translatedPageCount - 1} renderer=${input.rendererName ?? 'unknown'}`,
      );
    }

    let originalPdfDocForAssembly: PDFDocument | null = null;
    let extractedPdfPageCount: number | null = null;

    if (input.isOriginalPdf && input.originalFileBuffer.byteLength > 0) {
      try {
        originalPdfDocForAssembly = await PDFDocument.load(input.originalFileBuffer, {
          ignoreEncryption: true,
        });
        extractedPdfPageCount = originalPdfDocForAssembly.getPageCount();
      } catch (err) {
        log(`source page extraction failed: ${err}`);
      }
    } else if (
      ['image/jpeg', 'image/jpg', 'image/png'].includes(input.originalContentType ?? '') &&
      input.originalFileBuffer.byteLength > 0
    ) {
      try {
        const imgDoc = await PDFDocument.create();
        const imgBytes = new Uint8Array(input.originalFileBuffer);
        const embeddedImage =
          input.originalContentType === 'image/png'
            ? await imgDoc.embedPng(imgBytes)
            : await imgDoc.embedJpg(imgBytes);
        const page = imgDoc.addPage([embeddedImage.width, embeddedImage.height]);
        page.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width: embeddedImage.width,
          height: embeddedImage.height,
        });
        const imgPdfBytes = await imgDoc.save();
        originalPdfDocForAssembly = await PDFDocument.load(imgPdfBytes);
        extractedPdfPageCount = 1;
        log(`image original converted to single-page PDF for assembly`);
      } catch (err) {
        log(`image-to-pdf conversion failed: ${err}`);
      }
    }

    const sourcePageResolution = await resolveSourcePageCount({
      fileUrl: input.originalFileUrl,
      contentType: input.originalContentType,
      fileBuffer: input.originalFileBuffer,
      isPdfHint: input.isOriginalPdf,
      pdfPageCountHint:
        extractedPdfPageCount ??
        (typeof input.sourcePageCount === 'number' && input.sourcePageCount > 0
          ? input.sourcePageCount
          : null),
      explicitPageCountHint:
        typeof input.sourcePageCount === 'number' && input.sourcePageCount > 0
          ? input.sourcePageCount
          : null,
      groupedSourceImageCountHint: input.groupedSourceImageCount,
      hybridSinglePageEvidence: input.hybridSinglePageEvidence,
    });
    log(
      `source page count resolution: artifact=${sourcePageResolution.sourceArtifactType} ` +
        `strategy=${sourcePageResolution.sourcePageCountStrategy} ` +
        `resolved=${sourcePageResolution.resolvedSourcePageCount ?? 'n/a'}`,
    );

    const sourcePhysicalPageCount =
      sourcePageResolution.resolvedSourcePageCount ?? null;
    const sourceResolutionDiagnostics = {
      source_artifact_type: sourcePageResolution.sourceArtifactType,
      source_page_count_strategy: sourcePageResolution.sourcePageCountStrategy,
      resolved_source_page_count: sourcePageResolution.resolvedSourcePageCount,
    } as const;

    const parityEvaluation = evaluatePageParity({
      sourcePhysicalPageCount,
      translatedPageCount,
      decision: normalizedParityDecision,
    });
    const sourceRelevantPageCount = parityEvaluation.sourceRelevantPageCount;
    const parityDiagnosticsBase = {
      ...baseDiagnostics,
      ...sourceResolutionDiagnostics,
      page_parity_mode: parityEvaluation.mode,
      source_physical_page_count: sourcePhysicalPageCount,
      source_relevant_page_count: sourceRelevantPageCount,
      source_page_count: sourcePhysicalPageCount,
      translated_page_count: translatedPageCount,
    } as const;

    if (parityEvaluation.decisionRequired) {
      const diagnostics: PageParityDiagnostic = {
        ...parityDiagnosticsBase,
        parity_status: 'fail',
        blocking_reason: 'page_parity_decision_required',
        certification_generation_blocked: true,
        release_blocked: shouldMarkReleaseBlocked,
      };
      logPageParityDiagnostics(logPrefix, diagnostics);
      return {
        success: false,
        blockingReason: diagnostics.blocking_reason,
        sourcePageCount: sourcePhysicalPageCount ?? undefined,
        sourcePhysicalPageCount: sourcePhysicalPageCount ?? undefined,
        sourceRelevantPageCount: sourceRelevantPageCount ?? undefined,
        translatedPageCount,
        parityStatus: 'fail',
        pageParityMode: parityEvaluation.mode,
        parityDecisionRequired: true,
        parityDecisionContext: parityEvaluation.decisionContext,
        singlePageExpansionDetected,
        diagnostics,
      };
    }

    if (!parityEvaluation.parityPass) {
      const diagnostics: PageParityDiagnostic = {
        ...parityDiagnosticsBase,
        parity_status: 'fail',
        blocking_reason: parityEvaluation.blockingReason,
        certification_generation_blocked: true,
        release_blocked: shouldMarkReleaseBlocked,
      };
      logPageParityDiagnostics(logPrefix, diagnostics);
      return {
        success: false,
        blockingReason: diagnostics.blocking_reason,
        sourcePageCount: sourcePhysicalPageCount ?? undefined,
        sourcePhysicalPageCount: sourcePhysicalPageCount ?? undefined,
        sourceRelevantPageCount: sourceRelevantPageCount ?? undefined,
        translatedPageCount,
        parityStatus: 'fail',
        pageParityMode: parityEvaluation.mode,
        singlePageExpansionDetected,
        diagnostics,
      };
    }

    const passDiagnostics: PageParityDiagnostic = {
      ...parityDiagnosticsBase,
      parity_status: 'pass',
      blocking_reason: 'none',
      certification_generation_blocked: false,
      release_blocked: false,
    };
    logPageParityDiagnostics(logPrefix, passDiagnostics);

    // ── Part 1: HTML certification cover ─────────────────────────────────────
    const sourceLangLabel =
      SOURCE_LANGUAGE_LABELS[input.sourceLanguage ?? ''] ??
      input.sourceLanguage ??
      'Unknown';

    const today = new Date();
    const dated = today.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const coverAssets = loadCoverAssets(logPrefix);
    const loadedCoverAssets = new Set(coverAssets.map(a => a.filename));

    const coverHtml = buildCertificationCoverHtml(
      coverVariant,
      {
        documentType: input.documentTypeLabel ?? 'Document',
        sourceLanguage: sourceLangLabel,
        sourcePageCount: sourcePhysicalPageCount ?? 'n/a',
        translatedPageCount,
        orderId: input.orderId,
        dated,
        documentDate: input.documentDate,
      },
      loadedCoverAssets,
    );

    log(`cover assets loaded: [${Array.from(loadedCoverAssets).join(', ')}]`);

    const coverPdf = await callGotenberg(
      coverHtml,
      GOTENBERG_COVER,
      logPrefix,
      'html-cover',
      coverAssets,
    );

    if (!coverPdf.buffer) {
      log(`cover page: Gotenberg failed`);
      const diagnostics: PageParityDiagnostic = {
        ...parityDiagnosticsBase,
        gotenberg_endpoint_used: coverPdf.endpointUsed,
        gotenberg_failure_type: coverPdf.failure?.type ?? null,
        gotenberg_failure_detail: formatGotenbergFailureDetail(coverPdf.failure),
        gotenberg_status_code: coverPdf.failure?.statusCode ?? null,
        parity_status: 'fail',
        blocking_reason: 'certification_cover_generation_failed',
        certification_generation_blocked: true,
        release_blocked: shouldMarkReleaseBlocked,
      };
      logPageParityDiagnostics(logPrefix, diagnostics);
      return {
        success: false,
        blockingReason: diagnostics.blocking_reason,
        sourcePageCount: sourcePhysicalPageCount ?? undefined,
        sourcePhysicalPageCount: sourcePhysicalPageCount ?? undefined,
        sourceRelevantPageCount: sourceRelevantPageCount ?? undefined,
        translatedPageCount,
        parityStatus: 'fail',
        pageParityMode: parityEvaluation.mode,
        diagnostics,
      };
    }

    log(`cover page generated: yes`);

    // ── pdf-lib assembly: Part 1 + Part 2 + Part 3 ───────────────────────────
    const finalPdf = await PDFDocument.create();

    // Part 1: cover intact
    const coverDoc = await PDFDocument.load(coverPdf.buffer);
    const coverPages = await finalPdf.copyPages(coverDoc, coverDoc.getPageIndices());
    coverPages.forEach(p => finalPdf.addPage(p));

    // Part 2: translated with letterhead overlay
    const translatedPages = await finalPdf.copyPages(translatedPdfDoc, translatedPdfDoc.getPageIndices());
    translatedPages.forEach(p => finalPdf.addPage(p));

    // Part 3: original intact (skipped if not PDF or unavailable)
    let originalPageCount = 0;
    if (originalPdfDocForAssembly) {
      const originalPages = await finalPdf.copyPages(
        originalPdfDocForAssembly,
        originalPdfDocForAssembly.getPageIndices(),
      );
      originalPages.forEach(p => finalPdf.addPage(p));
      originalPageCount = originalPdfDocForAssembly.getPageCount();
      log(`original appended: yes (${originalPageCount} page(s))`);
    } else if (input.isOriginalPdf && input.originalFileBuffer.byteLength > 0) {
      try {
        const originalDoc = await PDFDocument.load(input.originalFileBuffer, { ignoreEncryption: true });
        const originalPages = await finalPdf.copyPages(originalDoc, originalDoc.getPageIndices());
        originalPages.forEach(p => finalPdf.addPage(p));
        originalPageCount = originalDoc.getPageCount();
        log(`original appended: yes (${originalPageCount} page(s))`);
      } catch (origErr) {
        log(`original appended: no (pdf-lib load error: ${origErr})`);
      }
    } else {
      log(`original appended: no (source is not a PDF or buffer empty)`);
    }

    const totalPages = finalPdf.getPageCount();
    const kitBytes = await finalPdf.save();
    const kitBuffer = Buffer.from(kitBytes);

    log(
      `kit assembled: yes — cover=${coverDoc.getPageCount()} + translated=${translatedPageCount} + original=${originalPageCount}; ` +
      `total=${totalPages} pages, ${kitBuffer.length} bytes`,
    );

    return {
      success: true,
      kitBuffer,
      sourcePageCount: sourcePhysicalPageCount ?? undefined,
      sourcePhysicalPageCount: sourcePhysicalPageCount ?? undefined,
      sourceRelevantPageCount: sourceRelevantPageCount ?? undefined,
      translatedPageCount,
      parityStatus: 'pass',
      pageParityMode: parityEvaluation.mode,
      diagnostics: passDiagnostics,
    };

  } catch (err) {
    console.error(`[buildStructuredKitBuffer] unexpected error: ${err}`);
    const diagnostics: PageParityDiagnostic = {
      ...baseDiagnostics,
      source_page_count: input.sourcePageCount ?? null,
      translated_page_count: null,
      parity_status: 'fail',
      blocking_reason: 'kit_assembly_unexpected_error',
      certification_generation_blocked: true,
      release_blocked: shouldMarkReleaseBlocked,
    };
    logPageParityDiagnostics(logPrefix, diagnostics);
    return {
      success: false,
      blockingReason: diagnostics.blocking_reason,
      parityStatus: 'fail',
      diagnostics,
    };
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function assembleStructuredPreviewKit(
  input: StructuredPreviewKitInput,
): Promise<StructuredPreviewKitResult> {
  const result: StructuredPreviewKitResult = {
    assembled: false,
    coverGenerated: false,
    coverMetadataApplied: false,
    translatedSectionGenerated: false,
    originalAppended: false,
    letterheadDetected: false,
    letterheadInjected: false,
  };

  const logPrefix = `[structuredPreviewKit] Order #${input.orderId} Doc #${input.documentId}`;
  const log = (msg: string) => console.log(`${logPrefix} — ${msg}`);

  try {
    // Detect letterhead for result metadata (orientation-aware)
    const isLandscape = input.orientation === 'landscape';
    const targetLhPath = isLandscape ? LETTERHEAD_LANDSCAPE_PATH : LETTERHEAD_PATH;
    try {
      result.letterheadDetected = existsSync(targetLhPath);
    } catch {
      result.letterheadDetected = false;
    }

    // ── Assemble the 3-part PDF buffer ────────────────────────────────────────
    const buildResult = await buildStructuredKitBuffer(input);

    result.sourcePageCount = buildResult.sourcePageCount;
    result.sourcePhysicalPageCount = buildResult.sourcePhysicalPageCount;
    result.sourceRelevantPageCount = buildResult.sourceRelevantPageCount;
    result.translatedPageCount = buildResult.translatedPageCount;
    result.pageParityStatus = buildResult.parityStatus;
    result.pageParityMode = buildResult.pageParityMode;
    result.parityDecisionRequired = buildResult.parityDecisionRequired ?? false;
    result.parityDecisionContext = buildResult.parityDecisionContext;
    result.blockingReason = buildResult.blockingReason;
    result.certificationGenerationBlocked =
      buildResult.diagnostics?.certification_generation_blocked ?? false;
    result.releaseBlocked = buildResult.diagnostics?.release_blocked ?? false;
    result.singlePageExpansionDetected = buildResult.singlePageExpansionDetected ?? false;

    if (!buildResult.success || !buildResult.kitBuffer) {
      log(`kit assembly failed`);
      return result;
    }
    const kitBuffer = buildResult.kitBuffer;

    result.coverGenerated = true;
    result.coverMetadataApplied = true;
    result.translatedSectionGenerated = true;
    // Letterhead is injected for both paths:
    //   - Canonical internal: via HTML background image in the template
    //   - External PDF override: via PDF overlay (applyLetterheadOverlayToPdf)
    result.letterheadInjected = result.letterheadDetected;
    result.originalAppended =
      (input.isOriginalPdf ||
        ['image/jpeg', 'image/jpg', 'image/png'].includes(input.originalContentType ?? '')) &&
      input.originalFileBuffer.byteLength > 0;

    // ── Persist: Supabase Storage with local fallback ─────────────────────────
    const timestamp = Date.now();
    const kitFilename = `structured-kit-${input.documentId}-${timestamp}.pdf`;
    const kitStoragePath = `orders/previews/${kitFilename}`;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey);
      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(kitStoragePath, kitBuffer, { contentType: 'application/pdf', upsert: true });

      if (uploadErr) {
        log(`storage upload failed: ${uploadErr.message}`);
        const localPath = saveLocalFallback(kitBuffer, kitFilename, logPrefix);
        if (localPath) {
          result.kitLocalPath = localPath;
          result.assembled = true;
          log(`saved locally: ${localPath}`);
        }
      } else {
        const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(kitStoragePath);
        result.assembled = true;
        result.kitPath = kitStoragePath;
        result.kitUrl = urlData?.publicUrl;
        log(`saved to storage: ${result.kitUrl}`);
      }
    } else {
      const localPath = saveLocalFallback(kitBuffer, kitFilename, logPrefix);
      if (localPath) {
        result.kitLocalPath = localPath;
        result.assembled = true;
        log(`saved locally (no env vars): ${localPath}`);
      }
    }
  } catch (err) {
    console.error(`${logPrefix} — unexpected error: ${err}`);
  }

  return result;
}
