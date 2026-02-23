/**
 * Utility to safely parse and normalize order data.
 * This prevents rendering crashes caused by malformed JSON or unexpected metadata structures.
 */

export interface NormalizedOrder {
    id: number;
    status: string;
    totalAmount: number;
    createdAt: Date;
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
 */
export function normalizeOrder(order: any): NormalizedOrder {
    const defaultUser = { fullName: 'N/A', email: 'N/A' };

    // Safely parse metadata
    const parsedMetadata = typeof order.metadata === 'string'
        ? safeParseJSON(order.metadata, {})
        : (order.metadata || {});

    return {
        ...order,
        id: typeof order.id === 'number' ? order.id : 0,
        status: order.status || 'PENDING',
        totalAmount: typeof order.totalAmount === 'number' ? order.totalAmount : 0,
        createdAt: order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt || Date.now()),
        user: {
            fullName: order.user?.fullName || defaultUser.fullName,
            email: order.user?.email || defaultUser.email,
            phone: order.user?.phone || null,
        },
        documents: Array.isArray(order.documents) ? order.documents : [],
        metadata: parsedMetadata,
        urgency: order.urgency || 'standard',
        uspsTracking: order.uspsTracking || null,
        requiresHardCopy: !!order.requiresHardCopy,
        deliveryUrl: order.deliveryUrl || null,
        hasTranslation: order.hasTranslation !== undefined ? !!order.hasTranslation : true,
        hasNotary: order.hasNotary !== undefined ? !!order.hasNotary : false,
    };
}
