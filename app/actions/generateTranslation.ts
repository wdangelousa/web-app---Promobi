'use server'

import * as deepl from 'deepl-node';
import prisma from '../../lib/prisma';

// Helper to download file from URL to Buffer
async function downloadFile(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
}

export async function generateTranslationDraft(orderId: number) {
    console.log(`[AutoTranslation] Starting for Order #${orderId}`);

    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { documents: true }
        });

        if (!order) {
            console.error(`[AutoTranslation] Order #${orderId} not found`);
            return { success: false, error: 'Order not found' };
        }

        // Initialize DeepL
        const authKey = process.env.DEEPL_API_KEY;
        if (!authKey) {
            console.error("[AutoTranslation] Missing DEEPL_API_KEY");
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'MANUAL_TRANSLATION_NEEDED' }
            });
            return { success: false, error: 'Missing API Key' };
        }

        const translator = new deepl.Translator(authKey);
        let completedCount = 0;
        let lastTranslatedText = '';

        // Process each document
        for (const doc of order.documents) {
            try {
                if (!doc.originalFileUrl || doc.originalFileUrl === 'PENDING_UPLOAD') {
                    continue;
                }

                console.log(`[AutoTranslation] Processing Document #${doc.id}`);

                const dataBuffer = await downloadFile(doc.originalFileUrl);
                let extractedText = '';

                if (doc.docType?.toLowerCase().includes('pdf') || doc.exactNameOnDoc?.toLowerCase().endsWith('.pdf')) {
                    // pdf2json: Ferramenta nativa para Node.js (Vercel)
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const PDFParser = require("pdf2json");
                    const pdfParser = new PDFParser(null, 1);

                    extractedText = await new Promise((resolve, reject) => {
                        pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
                        pdfParser.on("pdfParser_dataReady", () => {
                            resolve(pdfParser.getRawTextContent());
                        });
                        pdfParser.parseBuffer(dataBuffer);
                    }) as string;
                }

                // 🔥 NOVO: Detector de Documento Escaneado / Foto
                // Remove as quebras de página vazias que o sistema gera ao ler imagens
                const cleanText = (extractedText || '').replace(/----------------Page \(\d+\) Break----------------/g, '').trim();

                // Se sobrar menos de 10 letras no documento inteiro, significa que é uma foto/imagem sem texto digital.
                if (!cleanText || cleanText.length < 10) {
                    console.warn(`[AutoTranslation] Imagem/Scaneado detectado no Doc #${doc.id}`);

                    // Avisa a Isabele imediatamente na tela
                    return {
                        success: false,
                        error: 'Documento escaneado ou sem texto digital detectado. A IA não consegue ler imagens (requer OCR). Por favor, utilize um template e traduza manualmente.'
                    };
                }

                const result = await translator.translateText(cleanText, null, 'en-US');
                const translatedText = Array.isArray(result) ? result.map(r => r.text).join('\n') : result.text;

                await prisma.document.update({
                    where: { id: doc.id },
                    data: { translatedText }
                });

                lastTranslatedText = translatedText;
                completedCount++;
                console.log(`[AutoTranslation] Saved draft for Doc #${doc.id}`);

            } catch (err) {
                console.error(`[AutoTranslation] Error processing document #${doc.id}:`, err);
            }
        }

        // Final Status Update
        if (completedCount > 0) {
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'READY_FOR_REVIEW' }
            });
            // Retorna o texto de volta para a tela
            return { success: true, count: completedCount, text: lastTranslatedText };
        } else {
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'MANUAL_TRANSLATION_NEEDED' }
            });
            return { success: false, error: 'Não foi possível extrair e traduzir texto dos documentos.' };
        }

    } catch (error) {
        console.error("[AutoTranslation] Critical Error:", error);
        await prisma.order.update({
            where: { id: orderId },
            data: { status: 'MANUAL_TRANSLATION_NEEDED' }
        });
        return { success: false, error: String(error) };
    }
}