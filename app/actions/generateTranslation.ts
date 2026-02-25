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

// NOVA FUNÇÃO: Converte JPG/PNG para PDF antes do OCR
async function convertImageToPdf(buffer: Buffer, filename: string): Promise<Buffer> {
    const publicKey = 'project_public_b4990cf84ccd39069f02695ac36ed91a_0-GX3ce148715ca29b5801d8638aa65ec6599';

    // 1. Autenticação na iLovePDF
    let res = await fetch('https://api.ilovepdf.com/v1/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_key: publicKey })
    });
    let data = await res.json();
    if (!res.ok) throw new Error(`Auth Rejeitada (Image->PDF): ${JSON.stringify(data)}`);
    const token = data.token;

    // 2. Iniciar Tarefa (Ferramenta Image to PDF)
    res = await fetch('https://api.ilovepdf.com/v1/start/imagepdf', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    data = await res.json();
    if (!res.ok) throw new Error(`Start Rejeitado (Image->PDF): ${JSON.stringify(data)}`);
    const server = data.server;
    const task = data.task;

    // 3. Upload da Imagem
    const formData = new FormData();
    formData.append('task', task);
    const mimeType = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    formData.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

    res = await fetch(`https://${server}/v1/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    });
    data = await res.json();
    if (!res.ok) throw new Error(`Upload Rejeitado (Image->PDF): ${JSON.stringify(data)}`);
    const serverFilename = data.server_filename;

    // 4. Processar a Conversão
    res = await fetch(`https://${server}/v1/process`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            task: task,
            tool: 'imagepdf',
            files: [{ server_filename: serverFilename, filename: filename }]
        })
    });
    data = await res.json();
    if (!res.ok) throw new Error(`Process Rejeitado (Image->PDF): ${JSON.stringify(data)}`);

    // 5. Baixar o novo PDF (que contém a imagem)
    res = await fetch(`https://${server}/v1/download/${task}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Download Rejeitado (Image->PDF): ${res.statusText}`);

    return Buffer.from(await res.arrayBuffer());
}

async function performILovePdfOCR(buffer: Buffer): Promise<Buffer> {
    const publicKey = 'project_public_b4990cf84ccd39069f02695ac36ed91a_0-GX3ce148715ca29b5801d8638aa65ec6599';

    let res = await fetch('https://api.ilovepdf.com/v1/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_key: publicKey })
    });
    let data = await res.json();
    if (!res.ok) throw new Error(`Auth Rejeitada: ${JSON.stringify(data)}`);
    const token = data.token;

    res = await fetch('https://api.ilovepdf.com/v1/start/pdfocr', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    data = await res.json();
    if (!res.ok) throw new Error(`Start Rejeitado: ${JSON.stringify(data)}`);
    const server = data.server;
    const task = data.task;

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

                    // 🔥 O SEGREDO DO LAYOUT: Transforma o texto puro em parágrafos HTML para o editor web
                    const formattedHtmlText = rawTranslatedText
                        .split(/\n/)
                        .map(line => line.trim())
                        .filter(line => line.length > 0)
                        .map(line => `<p>${line}</p>`) // Adiciona as tags de parágrafo
                        .join('<br/>'); // Adiciona espaço extra entre parágrafos

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