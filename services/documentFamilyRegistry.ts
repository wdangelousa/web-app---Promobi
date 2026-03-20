import type { DocumentType } from '@/services/documentClassifier';

export type DocumentFamily =
  | 'civil_records'
  | 'identity_travel'
  | 'academic_records'
  | 'employment_records'
  | 'financial_tax_records'
  | 'relationship_evidence'
  | 'corporate_business_records'
  | 'investment_source_of_funds'
  | 'recommendation_letters'
  | 'letters_and_statements'
  | 'publications_media'
  | 'editorial_news_pages'
  | 'licenses_regulatory'
  | 'uscis_dos_forms_notices'
  | 'unknown';

export type RegisteredDocumentFamily = Exclude<DocumentFamily, 'unknown'>;
export type KnownDocumentType = Exclude<DocumentType, 'unknown'>;

export type FamilyDefaultOrientation = 'portrait' | 'landscape' | 'mixed';
export type FamilyTableDensity = 'low' | 'medium' | 'high';
export type FamilySignatureStampPresence = 'rare' | 'possible' | 'common' | 'very-common';
export type FamilyMultilingualSensitivity = 'low' | 'medium' | 'high';
export type FamilyTranslationEnvelope =
  | 'certified-documentary'
  | 'tabular-record'
  | 'narrative-evidence'
  | 'regulatory-form'
  | 'financial-ledger';
export type FamilyCapabilityLevel = 'none' | 'basic' | 'advanced';
export type FamilyParityCompactionProfile = 'none' | 'light' | 'balanced' | 'aggressive';
export type FamilyMaxSafeDensityProfile = 'conservative' | 'balanced' | 'tight';
export type FamilyCertificationPagePolicy = 'strict-source-equals-translated' | 'unsupported';

export type FamilyBlockType =
  | 'header'
  | 'metadata'
  | 'table'
  | 'signature'
  | 'stamp'
  | 'seal'
  | 'note'
  | 'attachment';

export interface FamilySafeDefaultBlock {
  blockType: FamilyBlockType;
  required: boolean;
  preserveVisualAnchor: boolean;
  allowEmptyPlaceholder: boolean;
}

export interface FamilyLayoutProfile {
  family: DocumentFamily;
  defaultOrientation: FamilyDefaultOrientation;
  commonBlockTypes: readonly FamilyBlockType[];
  likelyTableDensity: FamilyTableDensity;
  signatureStampPresence: FamilySignatureStampPresence;
  multilingualHeaderSensitivity: FamilyMultilingualSensitivity;
  safeMarginExpansionLikely: boolean;
  translationEnvelope: FamilyTranslationEnvelope;
}

export interface FamilyRenderCapabilities {
  family: DocumentFamily;
  status: 'implemented' | 'scaffolded';
  structuredRendererImplemented: boolean;
  clientFacingPremiumOnly: true;
  supportsFamilySpecificLayoutRules: boolean;
  supportsFamilySpecificTranslationEnvelope: boolean;
  supportedDocumentTypes: readonly KnownDocumentType[];
}

export interface FamilyClientFacingCapabilityMap {
  family: DocumentFamily;
  previewSupported: boolean;
  deliverySupported: boolean;
  orientationSupport: FamilyCapabilityLevel;
  tableSupport: FamilyCapabilityLevel;
  signatureBlockSupport: FamilyCapabilityLevel;
  exactPageParitySupported: boolean;
  parityCompactionProfile: FamilyParityCompactionProfile;
  maxSafeDensityProfile: FamilyMaxSafeDensityProfile;
  certificationPagePolicy: FamilyCertificationPagePolicy;
}

export type FamilyPriorityLevel = 1 | 2 | 3 | 'unassigned';

export interface DocumentFamilyImplementationMatrixRow {
  family: DocumentFamily;
  detectionImplemented: boolean;
  previewRendererImplemented: boolean;
  finalDeliveryRendererImplemented: boolean;
  portraitSupported: boolean;
  landscapeSupported: boolean;
  denseTableHandling: boolean;
  signatureSealHandling: boolean;
  notes: string;
  priorityLevel: FamilyPriorityLevel;
  orientationCapability: FamilyCapabilityLevel;
  tableCapability: FamilyCapabilityLevel;
  signatureCapability: FamilyCapabilityLevel;
}

export interface FamilyDetectionInput {
  documentType?: DocumentType | null;
  documentLabel?: string | null;
  fileUrl?: string | null;
  translatedText?: string | null;
}

export interface FamilyDetectionResult {
  family: DocumentFamily;
  confidence: 'mapped-document-type' | 'heuristic' | 'unknown';
  reason: string;
}

export const REGISTERED_DOCUMENT_FAMILIES: readonly RegisteredDocumentFamily[] = [
  'civil_records',
  'identity_travel',
  'academic_records',
  'employment_records',
  'financial_tax_records',
  'relationship_evidence',
  'corporate_business_records',
  'investment_source_of_funds',
  'recommendation_letters',
  'letters_and_statements',
  'publications_media',
  'editorial_news_pages',
  'licenses_regulatory',
  'uscis_dos_forms_notices',
] as const;

export const DOCUMENT_TYPE_TO_FAMILY: Record<KnownDocumentType, RegisteredDocumentFamily> = {
  marriage_certificate_brazil: 'civil_records',
  birth_certificate_brazil: 'civil_records',
  civil_record_general: 'civil_records',
  identity_travel_record: 'identity_travel',
  academic_diploma_certificate: 'academic_records',
  academic_transcript: 'academic_records',
  academic_record_general: 'academic_records',
  corporate_business_record: 'corporate_business_records',
  editorial_news_pages: 'editorial_news_pages',
  publication_media_record: 'publications_media',
  letters_and_statements: 'letters_and_statements',
  recommendation_letter: 'recommendation_letters',
  employment_record: 'employment_records',
  course_certificate_landscape: 'academic_records',
  eb1_evidence_photo_sheet: 'relationship_evidence',
};

const BASE_SAFE_BLOCKS: readonly FamilySafeDefaultBlock[] = [
  { blockType: 'header', required: true, preserveVisualAnchor: true, allowEmptyPlaceholder: true },
  { blockType: 'metadata', required: true, preserveVisualAnchor: true, allowEmptyPlaceholder: true },
  { blockType: 'table', required: false, preserveVisualAnchor: true, allowEmptyPlaceholder: true },
  { blockType: 'signature', required: false, preserveVisualAnchor: true, allowEmptyPlaceholder: true },
  { blockType: 'stamp', required: false, preserveVisualAnchor: true, allowEmptyPlaceholder: true },
  { blockType: 'seal', required: false, preserveVisualAnchor: true, allowEmptyPlaceholder: true },
  { blockType: 'note', required: false, preserveVisualAnchor: true, allowEmptyPlaceholder: true },
  { blockType: 'attachment', required: false, preserveVisualAnchor: true, allowEmptyPlaceholder: true },
] as const;

const FAMILY_LAYOUT_PROFILES: Record<DocumentFamily, FamilyLayoutProfile> = {
  civil_records: {
    family: 'civil_records',
    defaultOrientation: 'portrait',
    commonBlockTypes: ['header', 'metadata', 'table', 'signature', 'stamp', 'seal', 'note'],
    likelyTableDensity: 'medium',
    signatureStampPresence: 'very-common',
    multilingualHeaderSensitivity: 'high',
    safeMarginExpansionLikely: true,
    translationEnvelope: 'certified-documentary',
  },
  identity_travel: {
    family: 'identity_travel',
    defaultOrientation: 'mixed',
    commonBlockTypes: ['header', 'metadata', 'table', 'signature', 'stamp', 'note'],
    likelyTableDensity: 'low',
    signatureStampPresence: 'common',
    multilingualHeaderSensitivity: 'high',
    safeMarginExpansionLikely: false,
    translationEnvelope: 'certified-documentary',
  },
  academic_records: {
    family: 'academic_records',
    defaultOrientation: 'mixed',
    commonBlockTypes: ['header', 'metadata', 'table', 'signature', 'stamp', 'seal', 'note', 'attachment'],
    likelyTableDensity: 'high',
    signatureStampPresence: 'common',
    multilingualHeaderSensitivity: 'medium',
    safeMarginExpansionLikely: true,
    translationEnvelope: 'tabular-record',
  },
  employment_records: {
    family: 'employment_records',
    defaultOrientation: 'portrait',
    commonBlockTypes: ['header', 'metadata', 'table', 'signature', 'stamp', 'note', 'attachment'],
    likelyTableDensity: 'medium',
    signatureStampPresence: 'common',
    multilingualHeaderSensitivity: 'medium',
    safeMarginExpansionLikely: true,
    translationEnvelope: 'tabular-record',
  },
  financial_tax_records: {
    family: 'financial_tax_records',
    defaultOrientation: 'portrait',
    commonBlockTypes: ['header', 'metadata', 'table', 'signature', 'stamp', 'seal', 'note', 'attachment'],
    likelyTableDensity: 'high',
    signatureStampPresence: 'common',
    multilingualHeaderSensitivity: 'high',
    safeMarginExpansionLikely: true,
    translationEnvelope: 'financial-ledger',
  },
  relationship_evidence: {
    family: 'relationship_evidence',
    defaultOrientation: 'mixed',
    commonBlockTypes: ['header', 'metadata', 'table', 'signature', 'note', 'attachment'],
    likelyTableDensity: 'low',
    signatureStampPresence: 'possible',
    multilingualHeaderSensitivity: 'medium',
    safeMarginExpansionLikely: false,
    translationEnvelope: 'narrative-evidence',
  },
  corporate_business_records: {
    family: 'corporate_business_records',
    defaultOrientation: 'portrait',
    commonBlockTypes: ['header', 'metadata', 'table', 'signature', 'stamp', 'seal', 'note', 'attachment'],
    likelyTableDensity: 'medium',
    signatureStampPresence: 'common',
    multilingualHeaderSensitivity: 'medium',
    safeMarginExpansionLikely: true,
    translationEnvelope: 'certified-documentary',
  },
  investment_source_of_funds: {
    family: 'investment_source_of_funds',
    defaultOrientation: 'portrait',
    commonBlockTypes: ['header', 'metadata', 'table', 'signature', 'stamp', 'note', 'attachment'],
    likelyTableDensity: 'high',
    signatureStampPresence: 'possible',
    multilingualHeaderSensitivity: 'medium',
    safeMarginExpansionLikely: true,
    translationEnvelope: 'financial-ledger',
  },
  recommendation_letters: {
    family: 'recommendation_letters',
    defaultOrientation: 'portrait',
    commonBlockTypes: ['header', 'metadata', 'signature', 'stamp', 'note', 'attachment'],
    likelyTableDensity: 'low',
    signatureStampPresence: 'common',
    multilingualHeaderSensitivity: 'high',
    safeMarginExpansionLikely: false,
    translationEnvelope: 'narrative-evidence',
  },
  letters_and_statements: {
    family: 'letters_and_statements',
    defaultOrientation: 'mixed',
    commonBlockTypes: ['header', 'metadata', 'signature', 'stamp', 'note', 'attachment'],
    likelyTableDensity: 'low',
    signatureStampPresence: 'common',
    multilingualHeaderSensitivity: 'high',
    safeMarginExpansionLikely: true,
    translationEnvelope: 'narrative-evidence',
  },
  publications_media: {
    family: 'publications_media',
    defaultOrientation: 'mixed',
    commonBlockTypes: ['header', 'metadata', 'table', 'signature', 'note', 'attachment'],
    likelyTableDensity: 'medium',
    signatureStampPresence: 'possible',
    multilingualHeaderSensitivity: 'high',
    safeMarginExpansionLikely: true,
    translationEnvelope: 'narrative-evidence',
  },
  editorial_news_pages: {
    family: 'editorial_news_pages',
    defaultOrientation: 'mixed',
    commonBlockTypes: ['header', 'metadata', 'table', 'note', 'attachment'],
    likelyTableDensity: 'medium',
    signatureStampPresence: 'possible',
    multilingualHeaderSensitivity: 'high',
    safeMarginExpansionLikely: true,
    translationEnvelope: 'narrative-evidence',
  },
  licenses_regulatory: {
    family: 'licenses_regulatory',
    defaultOrientation: 'portrait',
    commonBlockTypes: ['header', 'metadata', 'table', 'signature', 'stamp', 'seal', 'note', 'attachment'],
    likelyTableDensity: 'medium',
    signatureStampPresence: 'very-common',
    multilingualHeaderSensitivity: 'high',
    safeMarginExpansionLikely: true,
    translationEnvelope: 'regulatory-form',
  },
  uscis_dos_forms_notices: {
    family: 'uscis_dos_forms_notices',
    defaultOrientation: 'portrait',
    commonBlockTypes: ['header', 'metadata', 'table', 'signature', 'stamp', 'seal', 'note', 'attachment'],
    likelyTableDensity: 'high',
    signatureStampPresence: 'common',
    multilingualHeaderSensitivity: 'high',
    safeMarginExpansionLikely: true,
    translationEnvelope: 'regulatory-form',
  },
  unknown: {
    family: 'unknown',
    defaultOrientation: 'portrait',
    commonBlockTypes: ['header', 'metadata', 'table', 'signature', 'stamp', 'seal', 'note', 'attachment'],
    likelyTableDensity: 'medium',
    signatureStampPresence: 'possible',
    multilingualHeaderSensitivity: 'medium',
    safeMarginExpansionLikely: false,
    translationEnvelope: 'certified-documentary',
  },
};

export const DOCUMENT_FAMILY_IMPLEMENTATION_MATRIX: Record<
  DocumentFamily,
  DocumentFamilyImplementationMatrixRow
> = {
  civil_records: {
    family: 'civil_records',
    detectionImplemented: true,
    previewRendererImplemented: true,
    finalDeliveryRendererImplemented: true,
    portraitSupported: true,
    landscapeSupported: false,
    denseTableHandling: true,
    signatureSealHandling: true,
    notes: 'Production-ready for portrait marriage, birth, and civil-general records. Landscape is intentionally blocked until full civil renderer parity is implemented.',
    priorityLevel: 2,
    orientationCapability: 'basic',
    tableCapability: 'advanced',
    signatureCapability: 'advanced',
  },
  identity_travel: {
    family: 'identity_travel',
    detectionImplemented: true,
    previewRendererImplemented: true,
    finalDeliveryRendererImplemented: true,
    portraitSupported: true,
    landscapeSupported: true,
    denseTableHandling: false,
    signatureSealHandling: true,
    notes: 'Production-ready for passport/ID/visa records. Optimized for compact sections rather than dense ledgers.',
    priorityLevel: 2,
    orientationCapability: 'advanced',
    tableCapability: 'basic',
    signatureCapability: 'basic',
  },
  academic_records: {
    family: 'academic_records',
    detectionImplemented: true,
    previewRendererImplemented: true,
    finalDeliveryRendererImplemented: true,
    portraitSupported: true,
    landscapeSupported: true,
    denseTableHandling: true,
    signatureSealHandling: true,
    notes: 'Production-ready for diploma, transcript, general academic, and landscape course-certificate documents.',
    priorityLevel: 2,
    orientationCapability: 'advanced',
    tableCapability: 'advanced',
    signatureCapability: 'basic',
  },
  employment_records: {
    family: 'employment_records',
    detectionImplemented: true,
    previewRendererImplemented: true,
    finalDeliveryRendererImplemented: true,
    portraitSupported: true,
    landscapeSupported: true,
    denseTableHandling: false,
    signatureSealHandling: true,
    notes: 'Production-ready for employment letters/certificates; dense payroll-style ledgers are not a target shape.',
    priorityLevel: 1,
    orientationCapability: 'basic',
    tableCapability: 'basic',
    signatureCapability: 'advanced',
  },
  financial_tax_records: {
    family: 'financial_tax_records',
    detectionImplemented: true,
    previewRendererImplemented: false,
    finalDeliveryRendererImplemented: false,
    portraitSupported: false,
    landscapeSupported: false,
    denseTableHandling: false,
    signatureSealHandling: false,
    notes: 'Detection exists, but structured preview and final-delivery renderers are not implemented.',
    priorityLevel: 1,
    orientationCapability: 'none',
    tableCapability: 'none',
    signatureCapability: 'none',
  },
  relationship_evidence: {
    family: 'relationship_evidence',
    detectionImplemented: true,
    previewRendererImplemented: true,
    finalDeliveryRendererImplemented: true,
    portraitSupported: true,
    landscapeSupported: true,
    denseTableHandling: false,
    signatureSealHandling: true,
    notes: 'Production-ready for EB1 evidence photo sheets through the generic structured evidence renderer. Family-specific specializations can be layered later.',
    priorityLevel: 2,
    orientationCapability: 'basic',
    tableCapability: 'basic',
    signatureCapability: 'basic',
  },
  corporate_business_records: {
    family: 'corporate_business_records',
    detectionImplemented: true,
    previewRendererImplemented: true,
    finalDeliveryRendererImplemented: true,
    portraitSupported: true,
    landscapeSupported: true,
    denseTableHandling: true,
    signatureSealHandling: true,
    notes: 'Production-ready for corporate registry/governance records with signature/seal anchoring.',
    priorityLevel: 1,
    orientationCapability: 'basic',
    tableCapability: 'advanced',
    signatureCapability: 'advanced',
  },
  investment_source_of_funds: {
    family: 'investment_source_of_funds',
    detectionImplemented: true,
    previewRendererImplemented: false,
    finalDeliveryRendererImplemented: false,
    portraitSupported: false,
    landscapeSupported: false,
    denseTableHandling: false,
    signatureSealHandling: false,
    notes: 'Detection exists, but structured rendering for client-facing delivery is not implemented.',
    priorityLevel: 3,
    orientationCapability: 'none',
    tableCapability: 'none',
    signatureCapability: 'none',
  },
  recommendation_letters: {
    family: 'recommendation_letters',
    detectionImplemented: true,
    previewRendererImplemented: true,
    finalDeliveryRendererImplemented: true,
    portraitSupported: true,
    landscapeSupported: true,
    denseTableHandling: false,
    signatureSealHandling: true,
    notes: 'Production-ready for recommendation/support letters; dense tabular content is intentionally de-emphasized.',
    priorityLevel: 1,
    orientationCapability: 'basic',
    tableCapability: 'basic',
    signatureCapability: 'advanced',
  },
  letters_and_statements: {
    family: 'letters_and_statements',
    detectionImplemented: true,
    previewRendererImplemented: true,
    finalDeliveryRendererImplemented: true,
    portraitSupported: true,
    landscapeSupported: true,
    denseTableHandling: false,
    signatureSealHandling: true,
    notes: 'Production-ready generic structured renderer for recommendation letters and declarations, including bundled resume sections via flexible zone model.',
    priorityLevel: 2,
    orientationCapability: 'advanced',
    tableCapability: 'basic',
    signatureCapability: 'advanced',
  },
  publications_media: {
    family: 'publications_media',
    detectionImplemented: true,
    previewRendererImplemented: true,
    finalDeliveryRendererImplemented: true,
    portraitSupported: true,
    landscapeSupported: true,
    denseTableHandling: false,
    signatureSealHandling: true,
    notes: 'Production-ready for publications/media evidence pages and citation-style layouts.',
    priorityLevel: 2,
    orientationCapability: 'advanced',
    tableCapability: 'basic',
    signatureCapability: 'basic',
  },
  editorial_news_pages: {
    family: 'editorial_news_pages',
    detectionImplemented: true,
    previewRendererImplemented: false,
    finalDeliveryRendererImplemented: false,
    portraitSupported: true,
    landscapeSupported: true,
    denseTableHandling: false,
    signatureSealHandling: false,
    notes: 'Detection implemented. Rendering uses the faithful-light path (continuous-text HTML) — the structured JSON renderer is intentionally disabled because news/editorial pages are flowing prose, not field-keyed records. assertStructuredClientFacingRender will throw immediately, faithful-light fallback activates without an expensive Claude extraction call.',
    priorityLevel: 2,
    orientationCapability: 'advanced',
    tableCapability: 'basic',
    signatureCapability: 'basic',
  },
  licenses_regulatory: {
    family: 'licenses_regulatory',
    detectionImplemented: true,
    previewRendererImplemented: false,
    finalDeliveryRendererImplemented: false,
    portraitSupported: false,
    landscapeSupported: false,
    denseTableHandling: false,
    signatureSealHandling: false,
    notes: 'Detection exists, but structured preview and final-delivery renderers are not implemented.',
    priorityLevel: 3,
    orientationCapability: 'none',
    tableCapability: 'none',
    signatureCapability: 'none',
  },
  uscis_dos_forms_notices: {
    family: 'uscis_dos_forms_notices',
    detectionImplemented: true,
    previewRendererImplemented: false,
    finalDeliveryRendererImplemented: false,
    portraitSupported: false,
    landscapeSupported: false,
    denseTableHandling: false,
    signatureSealHandling: false,
    notes: 'Detection exists, but USCIS/DOS form and notice renderers are not yet implemented.',
    priorityLevel: 3,
    orientationCapability: 'none',
    tableCapability: 'none',
    signatureCapability: 'none',
  },
  unknown: {
    family: 'unknown',
    detectionImplemented: false,
    previewRendererImplemented: false,
    finalDeliveryRendererImplemented: false,
    portraitSupported: false,
    landscapeSupported: false,
    denseTableHandling: false,
    signatureSealHandling: false,
    notes: 'Unknown family is always blocked for client-facing translated output.',
    priorityLevel: 'unassigned',
    orientationCapability: 'none',
    tableCapability: 'none',
    signatureCapability: 'none',
  },
};

const SUPPORTED_DOCUMENT_TYPES_BY_FAMILY: Record<DocumentFamily, readonly KnownDocumentType[]> = {
  civil_records: [
    'marriage_certificate_brazil',
    'birth_certificate_brazil',
    'civil_record_general',
  ],
  identity_travel: ['identity_travel_record'],
  academic_records: [
    'academic_diploma_certificate',
    'academic_transcript',
    'academic_record_general',
    'course_certificate_landscape',
  ],
  employment_records: ['employment_record'],
  financial_tax_records: [],
  relationship_evidence: ['eb1_evidence_photo_sheet'],
  corporate_business_records: ['corporate_business_record'],
  investment_source_of_funds: [],
  recommendation_letters: ['recommendation_letter'],
  letters_and_statements: ['letters_and_statements'],
  publications_media: ['publication_media_record'],
  editorial_news_pages: ['editorial_news_pages'],
  licenses_regulatory: [],
  uscis_dos_forms_notices: [],
  unknown: [],
};

const ALL_DOCUMENT_FAMILIES: readonly DocumentFamily[] = [
  ...REGISTERED_DOCUMENT_FAMILIES,
  'unknown',
] as const;

const FAMILY_RENDER_CAPABILITIES: Record<DocumentFamily, FamilyRenderCapabilities> =
  ALL_DOCUMENT_FAMILIES.reduce<Record<DocumentFamily, FamilyRenderCapabilities>>((acc, family) => {
    const row = DOCUMENT_FAMILY_IMPLEMENTATION_MATRIX[family];
    const structuredRendererImplemented =
      row.previewRendererImplemented && row.finalDeliveryRendererImplemented;

    acc[family] = {
      family,
      status: structuredRendererImplemented ? 'implemented' : 'scaffolded',
      structuredRendererImplemented,
      clientFacingPremiumOnly: true,
      supportsFamilySpecificLayoutRules: family !== 'unknown',
      supportsFamilySpecificTranslationEnvelope: family !== 'unknown',
      supportedDocumentTypes: SUPPORTED_DOCUMENT_TYPES_BY_FAMILY[family],
    };
    return acc;
  }, {} as Record<DocumentFamily, FamilyRenderCapabilities>);

const FAMILY_CLIENT_FACING_CAPABILITIES: Record<DocumentFamily, FamilyClientFacingCapabilityMap> =
  ALL_DOCUMENT_FAMILIES.reduce<Record<DocumentFamily, FamilyClientFacingCapabilityMap>>((acc, family) => {
    const row = DOCUMENT_FAMILY_IMPLEMENTATION_MATRIX[family];
    const exactPageParitySupported =
      row.previewRendererImplemented && row.finalDeliveryRendererImplemented;
    const parityCompactionProfile: FamilyParityCompactionProfile =
      !exactPageParitySupported
        ? 'none'
        : row.denseTableHandling
          ? 'aggressive'
          : row.tableCapability === 'advanced'
            ? 'balanced'
            : 'light';
    const maxSafeDensityProfile: FamilyMaxSafeDensityProfile =
      row.tableCapability === 'advanced'
        ? 'tight'
        : row.tableCapability === 'basic'
          ? 'balanced'
          : 'conservative';

    acc[family] = {
      family,
      previewSupported: row.previewRendererImplemented,
      deliverySupported: row.finalDeliveryRendererImplemented,
      orientationSupport: row.orientationCapability,
      tableSupport: row.tableCapability,
      signatureBlockSupport: row.signatureCapability,
      exactPageParitySupported,
      parityCompactionProfile,
      maxSafeDensityProfile,
      certificationPagePolicy: exactPageParitySupported
        ? 'strict-source-equals-translated'
        : 'unsupported',
    };
    return acc;
  }, {} as Record<DocumentFamily, FamilyClientFacingCapabilityMap>);

const FAMILY_HEURISTIC_RULES: Record<
  RegisteredDocumentFamily,
  Array<{ pattern: RegExp; weight: number }>
> = {
  civil_records: [
    {
      pattern:
        /\b(?:birth|marriage|divorce|death|adoption|name change|civil registry|civil registry extract|certid[aã]o|decree|judgment)\b/i,
      weight: 2,
    },
    { pattern: /\b(?:natural persons|registro civil|averba[cç][aã]o|marginal notes?)\b/i, weight: 1 },
  ],
  identity_travel: [
    {
      pattern:
        /\b(?:passport|travel document|visa|identity card|driver'?s license|national identity|entry|exit|i-94)\b/i,
      weight: 2,
    },
    {
      pattern:
        /\b(?:document number|nationality|date of birth|place of birth|class of admission|admit until|port of entry|issuing authority)\b/i,
      weight: 2,
    },
    { pattern: /\b(?:machine readable zone|mrz|passaporte|rg\b|cnh\b)\b/i, weight: 1 },
  ],
  academic_records: [
    {
      pattern:
        /\b(?:academic transcript|school record|diploma|degree|certificate of completion|enrollment certificate|academic declaration|course completion statement|syllabus|course outline)\b/i,
      weight: 2,
    },
    {
      pattern:
        /\b(?:hist[oó]rico escolar|grade report|curriculum|ementa|registrar|academic office|student id|semester|academic year)\b/i,
      weight: 1,
    },
  ],
  employment_records: [
    { pattern: /\b(?:employment verification|experience letter|employer declaration|salary confirmation|work certificate)\b/i, weight: 2 },
    { pattern: /\b(?:employment|labor contract|work permit|pay stub|salary|to whom it may concern)\b/i, weight: 2 },
    { pattern: /\b(?:holerite|carteira de trabalho|human resources|hr attestation)\b/i, weight: 1 },
  ],
  financial_tax_records: [
    { pattern: /\b(?:tax return|income tax|financial statement|bank statement|irs)\b/i, weight: 2 },
    { pattern: /\b(?:dirpf|declara[cç][aã]o de ajuste anual|sigilo fiscal|w-2|1099)\b/i, weight: 2 },
  ],
  relationship_evidence: [
    { pattern: /\b(?:relationship evidence|joint account|joint lease|affidavit)\b/i, weight: 2 },
    { pattern: /\b(?:photos?|chat logs?|wedding invitation)\b/i, weight: 1 },
    {
      pattern:
        /\b(?:evidence\s*\d+|page_metadata|layout_zones|translated_content_by_zone|non_textual_elements|rendering_hints|eb-?1)\b/i,
      weight: 2,
    },
    {
      pattern:
        /\b(?:z_evidence_title|z_explanatory_paragraph|z_single_photo|z_photo_gallery|z_top_photo_gallery|z_bottom_center_photo|z_footer_identity)\b/i,
      weight: 2,
    },
    {
      pattern:
        /\b(?:trophy|medal|honor|honour|highlight marker|yellow arrow|photo gallery|ceremony)\b/i,
      weight: 1,
    },
  ],
  corporate_business_records: [
    {
      pattern:
        /\b(?:articles of incorporation|articles of organization|operating agreement|bylaws|annual report|certificate of good standing|business license|corporate resolution|business registration|registry extract)\b/i,
      weight: 2,
    },
    {
      pattern:
        /\b(?:secretary of state|commercial registry|registry authority|department of state|junta comercial|cnpj|minutes of meeting|registered agent)\b/i,
      weight: 2,
    },
    { pattern: /\b(?:article \d+|section \d+|clause \d+|resolved that|be it resolved)\b/i, weight: 1 },
  ],
  investment_source_of_funds: [
    { pattern: /\b(?:source of funds|investment account|portfolio statement|capital contribution)\b/i, weight: 2 },
    { pattern: /\b(?:brokerage|wire transfer|proof of funds)\b/i, weight: 1 },
  ],
  recommendation_letters: [
    {
      pattern:
        /\b(?:letter of recommendation|recommendation letter|expert opinion letter|support letter|reference letter|testimonial letter|institutional endorsement)\b/i,
      weight: 2,
    },
    {
      pattern:
        /\b(?:i am writing to recommend|i strongly recommend|without reservation|highest recommendation|beneficiary|extraordinary ability|uscis|eb-1|eb-2|niw|o-1)\b/i,
      weight: 2,
    },
    { pattern: /\b(?:curriculum vitae|cv attached|resume attached|recommender|endorse)\b/i, weight: 1 },
  ],
  letters_and_statements: [
    {
      pattern:
        /\b(?:declaration|statement|declara[cç][aã]o|recommendation letter|reference letter|support letter|carta de refer[eê]ncia|carta de recomenda[cç][aã]o|to whom it may concern)\b/i,
      weight: 2,
    },
    {
      pattern:
        /\b(?:sincerely|regards|signature block|signer identity|footer contact|letterhead|human resources|accountant|contador|enrollment declaration|article acceptance)\b/i,
      weight: 2,
    },
    {
      pattern:
        /\b(?:z_document_title|z_body_text|z_date_location|z_closing|z_signature_block|z_signer_identity|z_footer_contact|z_attached_resume_section)\b/i,
      weight: 2,
    },
  ],
  publications_media: [
    {
      pattern:
        /\b(?:journal|magazine|newspaper|press clipping|media clipping|book cover|article cover|conference paper|proceedings)\b/i,
      weight: 2,
    },
    {
      pattern:
        /\b(?:byline|headline|source:|publication date|volume \d+|issue \d+|doi|issn|isbn|interview with)\b/i,
      weight: 2,
    },
    { pattern: /\b(?:abstract|keywords|citations?|references|footnotes|caption)\b/i, weight: 1 },
  ],
  editorial_news_pages: [
    {
      pattern:
        /\b(?:editorial news|news article|web news|print view|newspaper clipping|press clipping|media clipping|headline|subheadline|byline|location date|article body)\b/i,
      weight: 2,
    },
    {
      pattern:
        /\b(?:cookie notice|site navigation|related content|footer links|url timestamp|metadata block|doi block|abstract block)\b/i,
      weight: 2,
    },
    {
      pattern:
        /\b(?:z_headline|z_subheadline|z_byline|z_location_date|z_article_body|z_metadata_block|z_doi_block|z_abstract_block|z_cookie_notice|z_site_navigation|z_footer_links|z_url_timestamp)\b/i,
      weight: 2,
    },
  ],
  licenses_regulatory: [
    { pattern: /\b(?:license|permit|registration certificate|board certification)\b/i, weight: 2 },
    { pattern: /\b(?:regulatory|crm\b|oab\b|anvisa|professional council)\b/i, weight: 1 },
  ],
  uscis_dos_forms_notices: [
    { pattern: /\b(?:uscis|notice of action|department of state|consular)\b/i, weight: 2 },
    { pattern: /\b(?:i-130|i-485|i-797|ds-160|ds-260|nvc)\b/i, weight: 2 },
  ],
};

export function isRegisteredDocumentFamily(
  family: DocumentFamily,
): family is RegisteredDocumentFamily {
  return family !== 'unknown';
}

export function getDocumentFamilyForType(
  documentType: DocumentType,
): DocumentFamily {
  if (documentType === 'unknown') return 'unknown';
  return DOCUMENT_TYPE_TO_FAMILY[documentType];
}

export function getFamilyLayoutProfile(
  family: DocumentFamily,
): FamilyLayoutProfile {
  return FAMILY_LAYOUT_PROFILES[family];
}

export function getFamilyRenderCapabilities(
  family: DocumentFamily,
): FamilyRenderCapabilities {
  return FAMILY_RENDER_CAPABILITIES[family];
}

export function getDocumentFamilyImplementationMatrixRow(
  family: DocumentFamily,
): DocumentFamilyImplementationMatrixRow {
  return DOCUMENT_FAMILY_IMPLEMENTATION_MATRIX[family];
}

export function listDocumentFamilyImplementationMatrix(
  options: { includeUnknown?: boolean } = {},
): readonly DocumentFamilyImplementationMatrixRow[] {
  const orderedFamilies: readonly DocumentFamily[] = options.includeUnknown
    ? ALL_DOCUMENT_FAMILIES
    : REGISTERED_DOCUMENT_FAMILIES;
  return orderedFamilies.map((family) => DOCUMENT_FAMILY_IMPLEMENTATION_MATRIX[family]);
}

export function getFamilyClientFacingCapabilityMap(
  family: DocumentFamily,
): FamilyClientFacingCapabilityMap {
  return FAMILY_CLIENT_FACING_CAPABILITIES[family];
}

export function getFamilySafeDefaultBlocks(
  family: DocumentFamily,
): readonly FamilySafeDefaultBlock[] {
  const profile = getFamilyLayoutProfile(family);
  return BASE_SAFE_BLOCKS.map((block) => {
    if (!profile.commonBlockTypes.includes(block.blockType)) {
      return {
        ...block,
        required: false,
        allowEmptyPlaceholder: true,
      };
    }
    return block;
  });
}

export function hasImplementedStructuredFamilyRenderer(
  family: DocumentFamily,
): boolean {
  return getFamilyRenderCapabilities(family).structuredRendererImplemented;
}

export function isDocumentTypeInImplementedStructuredFamily(
  documentType: DocumentType,
): boolean {
  const family = getDocumentFamilyForType(documentType);
  if (!isRegisteredDocumentFamily(family)) return false;
  const capabilities = getFamilyRenderCapabilities(family);
  return (
    capabilities.structuredRendererImplemented &&
    capabilities.supportedDocumentTypes.includes(documentType as KnownDocumentType)
  );
}

function detectFamilyByHeuristics(input: FamilyDetectionInput): FamilyDetectionResult {
  const source = [input.documentLabel, input.fileUrl, input.translatedText]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n');

  if (!source) {
    return {
      family: 'unknown',
      confidence: 'unknown',
      reason: 'No label/url/text signals were provided.',
    };
  }

  const ranked = REGISTERED_DOCUMENT_FAMILIES
    .map((family) => {
      const score = FAMILY_HEURISTIC_RULES[family].reduce((total, rule) => {
        return total + (rule.pattern.test(source) ? rule.weight : 0);
      }, 0);
      return { family, score };
    })
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  if (!top || top.score < 2) {
    return {
      family: 'unknown',
      confidence: 'unknown',
      reason: 'Heuristic family score below confidence threshold.',
    };
  }

  return {
    family: top.family,
    confidence: 'heuristic',
    reason: `Heuristic keyword score ${top.score} for family "${top.family}".`,
  };
}

export function detectDocumentFamily(
  input: FamilyDetectionInput,
): FamilyDetectionResult {
  if (input.documentType) {
    const mappedFamily = getDocumentFamilyForType(input.documentType);
    if (mappedFamily !== 'unknown') {
      return {
        family: mappedFamily,
        confidence: 'mapped-document-type',
        reason: `Mapped from document type "${input.documentType}".`,
      };
    }
  }

  return detectFamilyByHeuristics(input);
}

// ── Faithful-light fallback eligibility ───────────────────────────────────────
//
// Document types listed here may fall back to the faithful translated HTML
// (doc.translatedText) when the structured renderer fails due to JSON/schema
// issues — rather than blocking the kit entirely.
//
// Only add a type here when:
//   1. The family's translated output is typically clean enough for delivery.
//   2. The structured renderer is fragile due to variable Anthropic JSON output.
//   3. There is no correctness risk in using a linear faithful layout for this
//      document type (e.g. editorial/news articles, not legal certificates).
const FAITHFUL_FALLBACK_ELIGIBLE_TYPES = new Set<string>([
  'editorial_news_pages',
]);

export function doesDocumentTypeSupportFaithfulFallback(
  documentType: string,
): boolean {
  return FAITHFUL_FALLBACK_ELIGIBLE_TYPES.has(documentType);
}
