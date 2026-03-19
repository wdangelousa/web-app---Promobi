import { PDFDocument } from 'pdf-lib';

export type SourceArtifactType =
  | 'pdf'
  | 'single_image'
  | 'grouped_images'
  | 'hybrid'
  | 'unknown';

export type SourcePageCountStrategy =
  | 'pdf_page_count'
  | 'single_image_file_assumed_one'
  | 'grouped_source_images_count'
  | 'hybrid_single_page_evidence'
  | 'provided_source_page_count_hint'
  | 'undetermined';

export interface SourcePageCountResolverInput {
  fileUrl?: string | null;
  contentType?: string | null;
  fileBuffer?: ArrayBuffer | Buffer | Uint8Array | null;
  isPdfHint?: boolean;
  pdfPageCountHint?: number | null;
  explicitPageCountHint?: number | null;
  groupedSourceImageCountHint?: number | null;
  hybridSinglePageEvidence?: boolean;
}

export interface SourcePageCountResolution {
  sourceArtifactType: SourceArtifactType;
  sourcePageCountStrategy: SourcePageCountStrategy;
  resolvedSourcePageCount: number | null;
  parityVerifiable: boolean;
}

const IMAGE_EXTENSION_RE = /\.(png|jpg|jpeg|gif|webp|bmp|tif|tiff|heic|heif)(?:$|[?#])/i;
const PDF_EXTENSION_RE = /\.pdf(?:$|[?#])/i;

function toPositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function normalizeContentType(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function normalizeUrl(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function resolveCountFromGenericObject(obj: Record<string, unknown>): number | null {
  const directKeys = [
    'sourcePageCount',
    'source_page_count',
    'pageCount',
    'page_count',
    'count',
    'imageCount',
    'imagesCount',
    'groupedImageCount',
    'groupedImagesCount',
  ];

  for (const key of directKeys) {
    const parsed = toPositiveInteger(obj[key]);
    if (parsed !== null) return parsed;
  }

  const collectionKeys = [
    'sourceImages',
    'groupedImages',
    'uploadedImages',
    'images',
    'pages',
    'pageSet',
  ];
  for (const key of collectionKeys) {
    const value = obj[key];
    if (Array.isArray(value) && value.length > 0) return value.length;
  }

  return null;
}

export function isLikelyPdfSource(
  fileUrl?: string | null,
  contentType?: string | null,
  isPdfHint?: boolean,
): boolean {
  if (isPdfHint) return true;
  const normalizedType = normalizeContentType(contentType);
  if (normalizedType.includes('pdf')) return true;
  const normalizedUrl = normalizeUrl(fileUrl);
  return PDF_EXTENSION_RE.test(normalizedUrl);
}

export function isLikelyImageSource(
  fileUrl?: string | null,
  contentType?: string | null,
): boolean {
  const normalizedType = normalizeContentType(contentType);
  if (normalizedType.startsWith('image/')) return true;
  const normalizedUrl = normalizeUrl(fileUrl);
  return IMAGE_EXTENSION_RE.test(normalizedUrl);
}

async function tryExtractPdfPageCount(
  fileBuffer?: ArrayBuffer | Buffer | Uint8Array | null,
): Promise<number | null> {
  if (!fileBuffer) return null;

  let bufferToLoad: Buffer;
  if (fileBuffer instanceof ArrayBuffer) {
    if (fileBuffer.byteLength === 0) return null;
    bufferToLoad = Buffer.from(fileBuffer);
  } else if (ArrayBuffer.isView(fileBuffer)) {
    if (fileBuffer.byteLength === 0) return null;
    bufferToLoad = Buffer.from(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength);
  } else {
    return null;
  }

  try {
    const pdfDoc = await PDFDocument.load(bufferToLoad, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();
    return pageCount > 0 ? pageCount : null;
  } catch {
    return null;
  }
}

export interface GroupedSourceImageCountHintInput {
  orderMetadata?: unknown;
  documentId?: number | null;
  originalFileUrl?: string | null;
  exactNameOnDoc?: string | null;
}

export function resolveGroupedSourceImageCountHintFromOrderMetadata(
  input: GroupedSourceImageCountHintInput,
): number | null {
  const metadataObject = asObject(input.orderMetadata);
  if (!metadataObject) return null;

  const normalizedUrl = normalizeUrl(input.originalFileUrl);
  const normalizedName = normalizeUrl(input.exactNameOnDoc);
  const docId = input.documentId ?? null;

  const byDocIdContainers = [
    'sourcePageCountByDocumentId',
    'sourcePageCountByDocId',
    'sourcePageCountsByDocId',
    'groupedSourceImageCountByDocumentId',
    'groupedSourceImageCountByDocId',
  ];

  if (docId !== null) {
    for (const key of byDocIdContainers) {
      const container = asObject(metadataObject[key]);
      if (!container) continue;
      const direct = toPositiveInteger(container[String(docId)]);
      if (direct !== null) return direct;
    }
  }

  const documents = Array.isArray(metadataObject.documents)
    ? metadataObject.documents
    : [];
  if (documents.length === 0) return null;

  const candidateCounts: number[] = [];

  for (const entry of documents) {
    const docEntry = asObject(entry);
    if (!docEntry) continue;

    const entryDocId = toPositiveInteger(docEntry.documentId);
    const entryFileName = normalizeUrl(
      typeof docEntry.fileName === 'string' ? docEntry.fileName : null,
    );
    const uploadedFile = asObject(docEntry.uploadedFile);
    const uploadedUrl = normalizeUrl(
      uploadedFile && typeof uploadedFile.url === 'string' ? uploadedFile.url : null,
    );

    const matchesById = docId !== null && entryDocId !== null && entryDocId === docId;
    const matchesByUrl = normalizedUrl.length > 0 && uploadedUrl.length > 0 && uploadedUrl === normalizedUrl;
    const matchesByName =
      normalizedName.length > 0 &&
      entryFileName.length > 0 &&
      entryFileName === normalizedName;

    if (!matchesById && !matchesByUrl && !matchesByName) {
      continue;
    }

    const resolved = resolveCountFromGenericObject(docEntry);
    if (resolved !== null) candidateCounts.push(resolved);
  }

  if (candidateCounts.length === 0) return null;
  return Math.max(...candidateCounts);
}

export async function resolveSourcePageCount(
  input: SourcePageCountResolverInput,
): Promise<SourcePageCountResolution> {
  const pdfPageCountHint = toPositiveInteger(input.pdfPageCountHint);
  const explicitPageCountHint = toPositiveInteger(input.explicitPageCountHint);
  const groupedImageCountHint = toPositiveInteger(input.groupedSourceImageCountHint);
  const isPdf = isLikelyPdfSource(input.fileUrl, input.contentType, input.isPdfHint);
  const isImage = isLikelyImageSource(input.fileUrl, input.contentType);

  if (isPdf) {
    if (pdfPageCountHint !== null) {
      return {
        sourceArtifactType: 'pdf',
        sourcePageCountStrategy: 'pdf_page_count',
        resolvedSourcePageCount: pdfPageCountHint,
        parityVerifiable: true,
      };
    }

    const extractedPdfCount = await tryExtractPdfPageCount(input.fileBuffer);
    if (extractedPdfCount !== null) {
      return {
        sourceArtifactType: 'pdf',
        sourcePageCountStrategy: 'pdf_page_count',
        resolvedSourcePageCount: extractedPdfCount,
        parityVerifiable: true,
      };
    }

    if (explicitPageCountHint === 1 && input.hybridSinglePageEvidence) {
      return {
        sourceArtifactType: 'hybrid',
        sourcePageCountStrategy: 'hybrid_single_page_evidence',
        resolvedSourcePageCount: 1,
        parityVerifiable: true,
      };
    }

    return {
      sourceArtifactType: 'pdf',
      sourcePageCountStrategy: 'undetermined',
      resolvedSourcePageCount: null,
      parityVerifiable: false,
    };
  }

  if (groupedImageCountHint !== null && groupedImageCountHint > 1) {
    return {
      sourceArtifactType: 'grouped_images',
      sourcePageCountStrategy: 'grouped_source_images_count',
      resolvedSourcePageCount: groupedImageCountHint,
      parityVerifiable: true,
    };
  }

  if (isImage) {
    return {
      sourceArtifactType: 'single_image',
      sourcePageCountStrategy: 'single_image_file_assumed_one',
      resolvedSourcePageCount: 1,
      parityVerifiable: true,
    };
  }

  if (groupedImageCountHint === 1 || input.hybridSinglePageEvidence) {
    return {
      sourceArtifactType: 'hybrid',
      sourcePageCountStrategy: 'hybrid_single_page_evidence',
      resolvedSourcePageCount: 1,
      parityVerifiable: true,
    };
  }

  if (explicitPageCountHint !== null) {
    return {
      sourceArtifactType: explicitPageCountHint === 1 ? 'hybrid' : 'unknown',
      sourcePageCountStrategy: 'provided_source_page_count_hint',
      resolvedSourcePageCount: explicitPageCountHint,
      parityVerifiable: true,
    };
  }

  return {
    sourceArtifactType: 'unknown',
    sourcePageCountStrategy: 'undetermined',
    resolvedSourcePageCount: null,
    parityVerifiable: false,
  };
}
