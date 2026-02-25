'use server'

import * as deepl from 'deepl-node';
import prisma from '../../lib/prisma';
import ILovePDFApi from '@ilovepdf/ilovepdf-nodejs';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';

// --- FUNÇÕES AUXILIARES ---

async function downloadFile(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
}

// Reconstrutor Inteligente: Remove as quebras de linha estranhas no meio das frases
function sanitizeOcrText(text: string): string {
    if (!text) return '';
    // 1. Marca quebras de linha duplas (Parágrafos reais) para protegê-las
    let sanitized = text.replace(/\n{2,}/g, ' __PARAGRAPH_BREAK__ ');
    // 2. Transforma quebras simples (cortes de linha no PDF) em espaços, caso a linha anterior não termine com pontuação
    sanitized = sanitized.replace(/([^.:;!?])\n/g, '$1 ');
    // 3. Remove excesso de espaços
    sanitized = sanitized.replace(/\s{2,}/g, ' ');
    // 4. Restaura os parágrafos reais
    sanitized = sanitized.replace(/ __PARAGRAPH_BREAK__ /g, '\n\n');
    return sanitized.trim();
}

async function extractTextWithPdf2Json(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PDFParser = require("pdf2json");
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser(null, 1);
        pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
        pdfParser.on("pdfParser_dataReady", () => resolve(pdfParser.getRawTextContent()));
        pdfParser.parseBuffer(buffer);
    });
}

// Novo conversor de imagens usando PDF-LIB (Muito mais rápido e não precisa de API externa)
async function convertImageToPdfLocal(imageBuffer: Buffer, filename: string): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    let image;
    if (filename.toLowerCase().endsWith('.png')) {
        image = await pdfDoc.embedPng(imageBuffer);
    } else {
        image = await pdfDoc.embedJpg(imageBuffer);
    }
    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}

// SDK Oficial da iLovePDF (Blindado contra erro 401)
async function performILovePdfOCROfficial(buffer: Buffer): Promise<Buffer> {
    const publicKey = 'project_public_b4990cf84ccd39069f02695ac36ed91a_0-GX3ce148715ca29b5801d8638aa65ec6599';
    const secretKey = 'secret_key_79f694c65dcfab8bd33ec4f7e4e14321_krtE5711f9df92fb18748a59f7ab14a1bc509';

    // @ts-ignore - A tipagem do SDK as vezes reclama do new, mas funciona perfeitamente
    const instance = new ILovePDFApi(publicKey, secretKey);
    const task = instance.newTask('pdfocr');
    await task.start();

    // Salva o buffer num ficheiro temporário porque o SDK exige caminho físico
    const tempPath = path.join('/tmp', `temp_ocr_${Date.now()}.pdf`);
    await fs.writeFile(tempPath, buffer);

    try {
        await task.addFile(tempPath);
        await task.process({ ocr_languages: 'por' });
        const downloadedData = await task.download();
        return Buffer.from(downloadedData);
    } finally {
        // Limpeza do ficheiro temporário
        await fs.unlink(tempPath).catch(() => { });
    }
}

// --- FUNÇÃO PRINCIPAL ---
export async function generateTranslationDraft(orderId: number) {
    console.log(`[AutoTranslation] Starting for Order #${orderId}`);

    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { documents: true }
        });

        if (!order) return { success: false, error: 'Order not found' };

        const authKey = process.env.DEEPL_API_KEY;
        if (!authKey) return { success: false, error: 'Missing API Key' };

        const translator = new deepl.Translator(authKey);
        let completedCount = 0;
        let lastTranslatedText = '';

        for (const doc of order.documents) {
            try {
                if (!doc.originalFileUrl || doc.originalFileUrl === 'PENDING_UPLOAD') continue;

                const docName = doc.exactNameOnDoc?.toLowerCase() || '';
                const isPdf = doc.docType?.toLowerCase().includes('pdf') || docName.endsWith('.pdf');
                const isImage = docName.endsWith('.jpg') || docName.endsWith('.jpeg') || docName.endsWith('.png');

                if (isPdf || isImage) {
                    const dataBuffer = await downloadFile(doc.originalFileUrl);
                    let pdfBuffer = dataBuffer;
                    let extractedText = '';

                    if (isImage) {
                        try {
                            pdfBuffer = await convertImageToPdfLocal(dataBuffer, doc.exactNameOnDoc || 'image.jpg');
                        } catch (imgErr: any) {
                            return { success: false, error: `Conversão de imagem local falhou: ${imgErr.message}` };
                        }
                    }

                    extractedText = await extractTextWithPdf2Json(pdfBuffer);
                    let cleanText = (extractedText || '').replace(/----------------Page \(\d+\) Break----------------/g, '').trim();

                    if (!cleanText || cleanText.length < 10) {
                        try {
                            const ocrBuffer = await performILovePdfOCROfficial(pdfBuffer);
                            extractedText = await extractTextWithPdf2Json(ocrBuffer);
                            cleanText = (extractedText || '').replace(/----------------Page \(\d+\) Break----------------/g, '').trim();
                        } catch (ocrError: any) {
                            return { success: false, error: `Falha no motor de OCR Oficial: ${ocrError.message}` };
                        }
                    }

                    // PASSAGEM PELO RECONSTRUTOR DE TEXTO (Sanitização)
                    extractedText = sanitizeOcrText(cleanText);

                    if (!extractedText || extractedText.length < 10) continue;

                    const result = await translator.translateText(extractedText, null, 'en-US');
                    const rawTranslatedText = Array.isArray(result) ? result.map(r => r.text).join('\n') : result.text;

                    // Formatação perfeita para o Editor da Isabele
                    const formattedHtmlText = rawTranslatedText
                        .split(/\n\n/) // Agora separa apenas pelos parágrafos reais que o reconstrutor salvou
                        .filter(line => line.trim().length > 0)
                        .map(line => `<p style="margin-bottom: 1em; line-height: 1.5;">${line.replace(/\n/g, '<br/>')}</p>`)
                        .join('');

                    await prisma.document.update({
                        where: { id: doc.id },
                        data: { translatedText: formattedHtmlText }
                    });

                    lastTranslatedText = formattedHtmlText;
                    completedCount++;
                }

            } catch (err) {
                console.error(`[AutoTranslation] Error processing document #${doc.id}:`, err);
            }
        }

        if (completedCount > 0) {
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'READY_FOR_REVIEW' }
            });
            return { success: true, count: completedCount, text: lastTranslatedText };
        } else {
            await prisma.order.update({
                where: { id: orderId },
                data: { status: 'MANUAL_TRANSLATION_NEEDED' }
            });
            return { success: false, error: 'Falha na tradução de todos os documentos.' };
        }

    } catch (error) {
        return { success: false, error: String(error) };
    }
}