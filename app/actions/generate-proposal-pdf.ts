'use server';

import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { ProposalPDF } from '@/components/ProposalPDF';
import { getLogoBase64 } from './get-logo-base64';

export async function generatePremiumProposalPDF(order: any, globalSettings: any) {
    try {
        console.log(`[generatePremiumProposalPDF] Start: Order ${order?.id}`);
        const logoBase64 = await getLogoBase64();

        const buffer = await renderToBuffer(
            React.createElement(ProposalPDF, {
                order,
                globalSettings,
                logoBase64
            }) as any
        );

        console.log(`[generatePremiumProposalPDF] Success: ${buffer.length} bytes`);

        // Return base64 for client-side download
        return {
            success: true,
            base64: buffer.toString('base64'),
            fileName: `Proposta-Promobi-${order.id}.pdf`
        };
    } catch (error: any) {
        console.error("Error generating PDF server-side:", error);
        return {
            success: false,
            error: `Falha ao gerar o PDF: ${error.message || 'Erro interno no motor de renderização'}`
        };
    }
}
