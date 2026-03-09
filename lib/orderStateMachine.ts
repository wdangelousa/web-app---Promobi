// Logic Layer: Order State Machine
// Created: 2026-03-09

import { OrderStatus } from '@prisma/client';

export type OrderTransition = 'REOPEN_QUOTE' | 'SEND_PROPOSAL' | 'MARK_PAID' | 'START_TRANSLATION';

/**
 * Validates if an order can transition from currentStatus to requestedAction.
 */
export const canTransition = (currentStatus: OrderStatus, action: OrderTransition): boolean => {
    switch (action) {
        case 'REOPEN_QUOTE':
            // Allow backward transition from pending payment or quoting back to draft
            // Explicitly block if already paid or in further execution phases
            const blockedStatuses: OrderStatus[] = ['PAID', 'READY_FOR_REVIEW', 'TRANSLATING', 'NOTARIZING', 'COMPLETED'];
            return !blockedStatuses.includes(currentStatus);

        case 'SEND_PROPOSAL':
            return currentStatus === 'PENDING';

        case 'MARK_PAID':
            return currentStatus === 'PENDING_PAYMENT' || currentStatus === 'AWAITING_VERIFICATION';

        case 'START_TRANSLATION':
            return currentStatus === 'PAID';

        default:
            return false;
    }
}
