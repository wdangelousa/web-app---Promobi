'use server'

import * as deepl from 'deepl-node';
import prisma from '../../lib/prisma';

// --- FUNÇÕES AUXILIARES ---

async function downloadFile(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
}

async function extractTextWithPdf2Json(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PDFParser = require("pdf2json");
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser(null, 1);
        pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
        pdfParser.on("pdfParser_dataReady", () => {
            resolve(pdfParser.getRawTextContent());
        });
        pdfParser.parseBuffer(buffer);
    });
}

async function performILovePdfOCR(buffer: Buffer): Promise<Buffer> {
    const publicKey = 'project_public_b4990cf84ccd39069f02695ac36ed91a_0-GX3ce148715ca29b5801d8638aa65ec6599';

    // 1. Autenticação na iLovePDF
    let res = await fetch('https://api.ilovepdf.com/v1/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_key: publicKey })
    });
    let data = await res.json();
    if (!res.ok) throw new Error(`Auth Rejeitada: ${JSON.stringify(data)}`);
    const token = data.token;

    // 2. Iniciar Tarefa (Ferramenta OCR)
    res = await fetch('https://api.ilovepdf.com/v1/start/pdfocr', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    data = await res.json();
    if (!res.ok) throw new Error(`Start Rejeitado: ${JSON.stringify(data)}`);
    const server = data.server;
    const task = data.task;

    // 3. Upload do Arquivo
    const formData = new FormData();
    formData.append('task', task);
    formData.append('file', new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), 'document.pdf');

    res = await fetch(`https://${server}/v1/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    });
    data = await res.json();
    if (!res.ok) throw new Error(`Upload Rejeitado: ${JSON.stringify(data)}`);
    const serverFilename = data.server_filename;

    // 4. Processar o OCR (Agota blindado sem parâmetros que quebram a iLovePDF)
    res = await fetch(`https://${server}/v1/process`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            task: task,
            tool: 'pdfocr',
            files: [{ server_filename: serverFilename, filename: 'document.pdf' }]
        })
    });
    data = await res.json();
    if (!res.ok) throw new Error(`Process Rejeitado: ${JSON.stringify(data)}`);

    // 5. Baixar o novo PDF com letras digitais
    res = await fetch(`https://${server}/v1/download/${task}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Download Rejeitado: ${res.statusText}`);

    return Buffer.from(await res.arrayBuffer());
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
        if (!authKey) {
            return { success: false, error: 'Missing API Key' };
        }

        const translator = new deepl.Translator(authKey);
        let completedCount = 0;
        let lastTranslatedText = '';

        for (const doc of order.documents) {
            try {
                if (!doc.originalFileUrl || doc.originalFileUrl === 'PENDING_UPLOAD') continue;

                console.log(`[AutoTranslation] Processing Document #${doc.id}`);
                const dataBuffer = await downloadFile(doc.originalFileUrl);
                let extractedText = '';

                if (doc.docType?.toLowerCase().includes('pdf') || doc.exactNameOnDoc?.toLowerCase().endsWith('.pdf')) {

                    extractedText = await extractTextWithPdf2Json(dataBuffer);
                    let cleanText = (extractedText || '').replace(/----------------Page \(\d+\) Break----------------/g, '').trim();

                    if (!cleanText || cleanText.length < 10) {
                        console.log(`[AutoTranslation] Documento escaneado detetado (Doc #${doc.id}). Acionando OCR...`);

                        try {
                            const ocrBuffer = await performILovePdfOCR(dataBuffer);
                            console.log(`[AutoTranslation] OCR concluído. Extraindo texto...`);

                            extractedText = await extractTextWithPdf2Json(ocrBuffer);
                            cleanText = (extractedText || '').replace(/----------------Page \(\d+\) Break----------------/g, '').trim();

                        } catch (ocrError: any) {
                            console.error("[AutoTranslation] Falha no OCR:", ocrError);
                            return { success: false, error: `OCR Error: ${ocrError.message}` };
                        }
                    }

                    extractedText = cleanText;
                }

                if (!extractedText || extractedText.length < 10) {
                    console.warn(`[AutoTranslation] Texto insuficiente no Doc #${doc.id}`);
                    continue;
                }

                const result = await translator.translateText(extractedText, null, 'en-US');
                const translatedText = Array.isArray(result) ? result.map(r => r.text).join('\n') : result.text;

                await prisma.document.update({
                    where: { id: doc.id },
                    data: { translatedText }
                });

                lastTranslatedText = translatedText;
                completedCount++;

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
        console.error("[AutoTranslation] Critical Error:", error);
        return { success: false, error: String(error) };
    }
}