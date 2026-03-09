// Logic Layer: Hooks
// Created: 2026-03-09

import { createClient } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function useOrderActions() {
    const supabase = createClient();
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    /**
     * Reopens an order's quote back to Draft status using RPC.
     */
    const reopenQuote = async (orderId: string | number) => {
        setIsLoading(true);
        try {
            // Call the RPC created in Phase 1
            const { error } = await supabase.rpc('reopen_order_quote', {
                p_order_id: Number(orderId)
            });

            if (error) {
                console.error('[useOrderActions] RPC Error:', error);
                throw new Error(error.message || 'Erro ao reabrir orçamento.');
            }

            // Success feedback and redirect
            router.push(`/admin/orcamento-manual?orderId=${orderId}`);
            return { success: true };

        } catch (err: any) {
            console.error('[useOrderActions] Error:', err);
            return { success: false, error: err.message };
        } finally {
            setIsLoading(false);
        }
    };

    return {
        reopenQuote,
        isLoading
    };
}
