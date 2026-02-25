'use server'

import * as deepl from 'deepl-node';
import prisma from '../../lib/prisma';
import { sign as jwtSign } from 'jsonwebtoken';

// ── iLovePDF credentials ──────────────────────────────────────────────────────

const ILOVEPDF_PUBLIC = 'project_public_b4990cf84ccd39069f02695ac36ed91a_0-GX3ce148715ca29b5801d8638aa65ec6599';
const ILOVEPDF_SECRET = 'secret_key_79f694c65dcfab8bd33ec4f7e4e14321_krtE5711f9df92fb18748a59f7ab14a1bc509';

/**
 * Gera um JWT assinado com a secret_key e o troca por um token de tarefa válido
 * no endpoint /v1/auth. Isso corrige o erro 401 "Signature verification failed"
 * que ocorre quando o servidor de upload verifica requisições assinadas apenas
 * com a public_key.
 */
async function getILovePdfToken(): Promise<string> {
    // Gera JWT local: { iss: PUBLIC_KEY } assinado com SECRET_KEY (HS256)
    const selfJwt = jwtSign(
        { iss: ILOVEPDF_PUBLIC },
        ILOVEPDF_SECRET,
        { algorithm: 'HS256' }
    );

    const res = await fetch('https://api.ilovepdf.com/v1/auth', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${selfJwt}`,
        },
        body: JSON.stringify({ public_key: ILOVEPDF_PUBLIC }),
    });

    if (!res.ok) {
        throw new Error(`iLovePDF auth failed (${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    return data.token as string;
}

// ── Funções auxiliares ────────────────────────────────────────────────────────

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

/** Converte JPG/PNG para PDF via iLovePDF (imagepdf). Retorna Buffer para a cadeia pdf2json. */
async function convertImageToPdf(buffer: Buffer, filename: string): Promise<Buffer> {
    const token = await getILovePdfToken();

    // 1. Iniciar tarefa
    let res = await fetch('https://api.ilovepdf.com/v1/start/imagepdf', {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    let data = await res.json();
    if (!res.ok) throw new Error(`Start Rejeitado (Image->PDF): ${JSON.stringify(data)}`);
    const server: string = data.server;
    const task: string = data.task;

    // 2. Upload da imagem
    const formData = new FormData();
    formData.append('task', task);
    const mimeType = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    formData.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

    res = await fetch(`https://${server}/v1/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
    });
    data = await res.json();
    if (!res.ok) throw new Error(`Upload Rejeitado (Image->PDF): ${JSON.stringify(data)}`);
    const serverFilename: string = data.server_filename;

    // 3. Processar conversão
    res = await fetch(`https://${server}/v1/process`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            task,
            tool: 'imagepdf',
            files: [{ server_filename: serverFilename, filename }],
        }),
    });
    data = await res.json();
    if (!res.ok) throw new Error(`Process Rejeitado (Image->PDF): ${JSON.stringify(data)}`);

    // 4. Download do PDF gerado
    res = await fetch(`https://${server}/v1/download/${task}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Download Rejeitado (Image->PDF): ${res.statusText}`);

    return Buffer.from(await res.arrayBuffer());
}

/** Executa OCR em um PDF via iLovePDF (pdfocr). Retorna Buffer para a cadeia pdf2json. */
async function performILovePdfOCR(buffer: Buffer): Promise<Buffer> {
    const token = await getILovePdfToken();

    // 1. Iniciar tarefa
    let res = await fetch('https://api.ilovepdf.com/v1/start/pdfocr', {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    let data = await res.json();
    if (!res.ok) throw new Error(`Start Rejeitado (OCR): ${JSON.stringify(data)}`);
    const server: string = data.server;
    const task: string = data.task;

    // 2. Upload do PDF
    const formData = new FormData();
    formData.append('task', task);
    formData.append('file', new Blob([new Uint8Array(buffer)], { type: 'application/pdf' }), 'document.pdf');

    res = await fetch(`https://${server}/v1/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
    });
    data = await res.json();
    if (!res.ok) throw new Error(`Upload Rejeitado (OCR): ${JSON.stringify(data)}`);
    const serverFilename: string = data.server_filename;

    // 3. Processar OCR
    res = await fetch(`https://${server}/v1/process`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            task,
            tool: 'pdfocr',
            files: [{ server_filename: serverFilename, filename: 'document.pdf' }],
        }),
    });
    data = await res.json();
    if (!res.ok) throw new Error(`Process Rejeitado (OCR): ${JSON.stringify(data)}`);

    // 4. Download do PDF com texto
    res = await fetch(`https://${server}/v1/download/${task}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Download Rejeitado (OCR): ${res.statusText}`);

    return Buffer.from(await res.arrayBuffer());
}

// ── Função principal ──────────────────────────────────────────────────────────

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

                const docName = doc.exactNameOnDoc?.toLowerCase() || '';
                const isPdf = doc.docType?.toLowerCase().includes('pdf') || docName.endsWith('.pdf');
                const isImage = docName.endsWith('.jpg') || docName.endsWith('.jpeg') || docName.endsWith('.png');

                if (isPdf || isImage) {
                    const dataBuffer = await downloadFile(doc.originalFileUrl);
                    let pdfBuffer = dataBuffer;
                    let extractedText = '';

                    if (isImage) {
                        try {
                            pdfBuffer = await convertImageToPdf(dataBuffer, doc.exactNameOnDoc || 'image.jpg');
                        } catch (imgErr: any) {
                            return { success: false, error: `Image2PDF Error: ${imgErr.message}` };
                        }
                    }

                    extractedText = await extractTextWithPdf2Json(pdfBuffer);
                    let cleanText = (extractedText || '').replace(/----------------Page \(\d+\) Break----------------/g, '').trim();

                    if (!cleanText || cleanText.length < 10) {
                        try {
                            const ocrBuffer = await performILovePdfOCR(pdfBuffer);
                            extractedText = await extractTextWithPdf2Json(ocrBuffer);
                            cleanText = (extractedText || '').replace(/----------------Page \(\d+\) Break----------------/g, '').trim();
                        } catch (ocrError: any) {
                            return { success: false, error: `OCR Error: ${ocrError.message}` };
                        }
                    }

                    extractedText = cleanText;

                    if (!extractedText || extractedText.length < 10) continue;

                    const result = await translator.translateText(extractedText, null, 'en-US');
                    const rawTranslatedText = Array.isArray(result) ? result.map(r => r.text).join('\n') : result.text;

                    // Transforma o texto puro em parágrafos HTML para o editor web
                    const formattedHtmlText = rawTranslatedText
                        .split(/\n/)
                        .map(line => line.trim())
                        .filter(line => line.length > 0)
                        .map(line => `<p>${line}</p>`)
                        .join('<br/>');

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
