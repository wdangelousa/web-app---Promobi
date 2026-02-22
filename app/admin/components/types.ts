import { OrderStatus } from '@prisma/client'

// Lightweight type for Kanban Board
export type KanbanOrder = {
    id: number
    status: OrderStatus
    totalAmount: number
    urgency: string
    user: {
        fullName: string
    }
    documents: {
        id: number
    }[]
    requiresNotarization: boolean
    requiresHardCopy: boolean
    createdAt: Date
    metadata?: string | null
}

// Full type for Modal Details
export type DetailOrder = KanbanOrder & {
    email: string
    phone?: string | null
    uspsTracking?: string | null
    deliveryUrl?: string | null
    metadata?: string | null // JSON payload
    documents: {
        id: number
        docType: string
        originalFileUrl: string
        translatedFileUrl: string | null
        exactNameOnDoc: string | null
    }[]
}

// Alias for backward compatibility during refactor if needed, but better to be explicit
export type Order = DetailOrder
