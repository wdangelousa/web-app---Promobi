import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { classifyDocument } from '@/services/documentClassifier';
import {
  detectDocumentFamily,
  getDocumentFamilyImplementationMatrixRow,
  getFamilyClientFacingCapabilityMap,
} from '@/services/documentFamilyRegistry';
import {
  assertStructuredClientFacingRender,
  formatStructuredRenderingFailureMessage,
} from '@/services/structuredDocumentRenderer';

interface RouteRenderDiagnostic {
  documentId: number;
  documentLabel: string;
  family: string;
  renderer: string;
  capabilityMap: {
    previewSupported: boolean;
    deliverySupported: boolean;
    orientationSupport: string;
    tableSupport: string;
    signatureBlockSupport: string;
  };
  implementationMatrix: {
    detectionImplemented: boolean;
    previewRendererImplemented: boolean;
    finalDeliveryRendererImplemented: boolean;
    portraitSupported: boolean;
    landscapeSupported: boolean;
    denseTableHandling: boolean;
    signatureSealHandling: boolean;
    priorityLevel: string | number;
    notes: string;
  };
  structuredRendererApplied: false;
  orientation: 'n/a';
  blockedReason: string | null;
}

function toImplementationMatrixDiagnostic(
  row: ReturnType<typeof getDocumentFamilyImplementationMatrixRow>,
): RouteRenderDiagnostic['implementationMatrix'] {
  return {
    detectionImplemented: row.detectionImplemented,
    previewRendererImplemented: row.previewRendererImplemented,
    finalDeliveryRendererImplemented: row.finalDeliveryRendererImplemented,
    portraitSupported: row.portraitSupported,
    landscapeSupported: row.landscapeSupported,
    denseTableHandling: row.denseTableHandling,
    signatureSealHandling: row.signatureSealHandling,
    priorityLevel: row.priorityLevel,
    notes: row.notes,
  };
}

function summarizeDiagnostics(diagnostics: RouteRenderDiagnostic[]): string {
  return diagnostics
    .map((entry) => {
      const base =
        `doc=${entry.documentId}(${entry.documentLabel}) family=${entry.family} ` +
        `renderer=${entry.renderer} structuredApplied=no orientation=${entry.orientation} ` +
        `priority=${entry.implementationMatrix.priorityLevel} ` +
        `capabilities=preview:${entry.capabilityMap.previewSupported ? 'yes' : 'no'} ` +
        `delivery:${entry.capabilityMap.deliverySupported ? 'yes' : 'no'} ` +
        `orientation:${entry.capabilityMap.orientationSupport} ` +
        `table:${entry.capabilityMap.tableSupport} ` +
        `signature:${entry.capabilityMap.signatureBlockSupport} ` +
        `matrixPreview:${entry.implementationMatrix.previewRendererImplemented ? 'yes' : 'no'} ` +
        `matrixDelivery:${entry.implementationMatrix.finalDeliveryRendererImplemented ? 'yes' : 'no'} ` +
        `matrixDenseTable:${entry.implementationMatrix.denseTableHandling ? 'yes' : 'no'} ` +
        `matrixSignatureSeal:${entry.implementationMatrix.signatureSealHandling ? 'yes' : 'no'}`;
      return entry.blockedReason ? `${base} blocked=${entry.blockedReason}` : base;
    })
    .join(' | ');
}

export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required' }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { documents: true },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const translatedDocs = order.documents.filter(
      (doc) => typeof doc.translatedText === 'string' && doc.translatedText.trim().length > 0,
    );

    if (translatedDocs.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No translated documents found for client-facing PDF generation.',
        },
        { status: 400 },
      );
    }

    const routeLabel = '/api/generate-pdf-kit';
    const diagnostics: RouteRenderDiagnostic[] = translatedDocs.map((doc) => {
      const documentLabelHint =
        [doc.exactNameOnDoc, doc.docType].filter(Boolean).join(' ').trim() || undefined;

      const classification = classifyDocument({
        fileUrl: doc.originalFileUrl ?? undefined,
        documentLabel: documentLabelHint,
        translatedText: doc.translatedText ?? undefined,
        sourceLanguage: doc.sourceLanguage ?? order.sourceLanguage ?? undefined,
      });

      const documentLabel = doc.exactNameOnDoc ?? doc.docType ?? `#${doc.id}`;
      const detectedFamily = detectDocumentFamily({
        documentType: classification.documentType,
        documentLabel: documentLabelHint,
        fileUrl: doc.originalFileUrl,
        translatedText: doc.translatedText ?? undefined,
      }).family;
      const detectedCapabilityMap = getFamilyClientFacingCapabilityMap(detectedFamily);
      const detectedMatrixRow = getDocumentFamilyImplementationMatrixRow(detectedFamily);

      try {
        const renderAssertion = assertStructuredClientFacingRender({
          documentType: classification.documentType,
          documentLabel: documentLabelHint,
          fileUrl: doc.originalFileUrl,
          translatedText: doc.translatedText ?? undefined,
          surface: routeLabel,
          logPrefix: `[generate-pdf-kit] Order #${orderId} Doc #${doc.id}`,
        });

        return {
          documentId: doc.id,
          documentLabel,
          family: renderAssertion.family,
          renderer: renderAssertion.rendererName,
          capabilityMap: {
            previewSupported: renderAssertion.familyClientFacingCapability.previewSupported,
            deliverySupported: renderAssertion.familyClientFacingCapability.deliverySupported,
            orientationSupport: renderAssertion.familyClientFacingCapability.orientationSupport,
            tableSupport: renderAssertion.familyClientFacingCapability.tableSupport,
            signatureBlockSupport: renderAssertion.familyClientFacingCapability.signatureBlockSupport,
          },
          implementationMatrix: toImplementationMatrixDiagnostic(renderAssertion.implementationMatrixRow),
          structuredRendererApplied: false,
          orientation: 'n/a',
          blockedReason: null,
        };
      } catch (err) {
        return {
          documentId: doc.id,
          documentLabel,
          family: detectedFamily,
          renderer: 'n/a',
          capabilityMap: {
            previewSupported: detectedCapabilityMap.previewSupported,
            deliverySupported: detectedCapabilityMap.deliverySupported,
            orientationSupport: detectedCapabilityMap.orientationSupport,
            tableSupport: detectedCapabilityMap.tableSupport,
            signatureBlockSupport: detectedCapabilityMap.signatureBlockSupport,
          },
          implementationMatrix: toImplementationMatrixDiagnostic(detectedMatrixRow),
          structuredRendererApplied: false,
          orientation: 'n/a',
          blockedReason: formatStructuredRenderingFailureMessage(classification.documentType, err),
        };
      }
    });

    const unsupportedOrMissing = diagnostics.filter((entry) => entry.blockedReason !== null);
    if (unsupportedOrMissing.length > 0) {
      console.error(
        `[generate-pdf-kit] Order #${orderId} blocked: missing structured support | ${summarizeDiagnostics(diagnostics)}`,
      );
      return NextResponse.json(
        {
          success: false,
          code: 'STRUCTURED_RENDERING_REQUIRED',
          error:
            'Client-facing translated output blocked: missing structured renderer support for one or more document families.',
          diagnostics,
        },
        { status: 409 },
      );
    }

    console.error(
      `[generate-pdf-kit] Order #${orderId} blocked: family mismatch (legacy linear route) | ${summarizeDiagnostics(diagnostics)}`,
    );

    return NextResponse.json(
      {
        success: false,
        code: 'STRUCTURED_RENDERING_REQUIRED',
        error:
          'Family mismatch: this endpoint uses legacy/linear rendering and is blocked by invariant. Use the structured Preview Kit or structured delivery action.',
        diagnostics,
      },
      { status: 409 },
    );
  } catch (error: any) {
    console.error('[generate-pdf-kit] unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error?.message ?? String(error) },
      { status: 500 },
    );
  }
}
