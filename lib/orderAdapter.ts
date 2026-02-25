/**
 * Utility to safely parse and normalize order data.
 * This prevents rendering crashes caused by malformed JSON or unexpected metadata structures.
 */

export interface NormalizedOrder {
    id: number;
    status: string;
    totalAmount: number;
    createdAt: string; // ISO 8601 string — Date objects cannot cross the Server→Client boundary
    user: {
        fullName: string;
        email: string;
        phone?: string | null;
    };
    documents: any[];
    metadata: any;
    urgency: string;
    uspsTracking?: string | null;
    requiresHardCopy: boolean;
    deliveryUrl?: string | null;
    hasTranslation: boolean;
    hasNotary: boolean;
}

/**
 * Safely parses a JSON string.
 */
export function safeParseJSON(jsonStr: string | null | undefined, fallback: any = null): any {
    if (!jsonStr) return fallback;
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Failed to parse JSON:", e, "Content:", jsonStr);
        return fallback;
    }
}

/**
 * Normalizes an order object from Prisma to a safe structure for UI components.
 * This is EXTREMELY explicit to avoid issues with spreading Prisma proxies
 * or carrying over circular/non-serializable references.
 */
export function normalizeOrder(order: any): NormalizedOrder {
    if (!order) {
        throw new Error("Cannot normalize null order");
    }

    const defaultUser = { fullName: 'N/A', email: 'N/A' };

    // Safely parse metadata
    let parsedMetadata = {};
    const rawMetadata = order.metadata;
    if (typeof rawMetadata === 'string') {
        parsedMetadata = safeParseJSON(rawMetadata, {});
    } else if (rawMetadata && typeof rawMetadata === 'object') {
        parsedMetadata = rawMetadata;
    }

    // Safely handle documents
    const safeDocuments = Array.isArray(order.documents)
        ? order.documents.map((doc: any) => ({
            id: doc.id,
            docType: doc.docType || 'Documento',
            originalFileUrl: doc.originalFileUrl || null,
            translatedFileUrl: doc.translatedFileUrl || null,
            count: typeof doc.count === 'number' ? doc.count : 1,
            // Carry over any other primitive fields needed
            analysis: doc.analysis || null,
            notarized: !!doc.notarized,
            translatedText: typeof doc.translatedText === 'string' ? doc.translatedText : null,
            translation_status: doc.translation_status || 'pending',
            delivery_pdf_url: doc.delivery_pdf_url || null,
            exactNameOnDoc: doc.exactNameOnDoc || null,
            isReviewed: doc.isReviewed === true,
            externalTranslationUrl: typeof doc.externalTranslationUrl === 'string' ? doc.externalTranslationUrl : null,
            pageRotations: (doc.pageRotations && typeof doc.pageRotations === 'object') ? doc.pageRotations : null,
        }))
        : [];

    return {
        id: typeof order.id === 'number' ? order.id : (parseInt(order.id) || 0),
        status: String(order.status || 'PENDING'),
        totalAmount: typeof order.totalAmount === 'number' ? order.totalAmount : 0,
        createdAt: (order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt || Date.now())).toISOString(),
        user: {
            fullName: String(order.user?.fullName || defaultUser.fullName),
            email: String(order.user?.email || defaultUser.email),
            phone: order.user?.phone ? String(order.user.phone) : null,
        },
        documents: safeDocuments,
        metadata: parsedMetadata,
        urgency: String(order.urgency || 'standard'),
        uspsTracking: order.uspsTracking ? String(order.uspsTracking) : null,
        requiresHardCopy: !!order.requiresHardCopy,
        deliveryUrl: order.deliveryUrl ? String(order.deliveryUrl) : null,
        hasTranslation: order.hasTranslation !== undefined ? !!order.hasTranslation : true,
        hasNotary: order.hasNotary !== undefined ? !!order.hasNotary : false,
    };
}
