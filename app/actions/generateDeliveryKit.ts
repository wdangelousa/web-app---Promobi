'use server'

import { PDFDocument, StandardFonts, rgb, degrees, BlendMode } from 'pdf-lib'
import fs from 'fs/promises'
import path from 'path'
import prisma from '@/lib/prisma'
import { SourceLanguage } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import { Buffer } from 'buffer'

function isPdf(buffer: Buffer): boolean {
    return buffer.length > 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
}

function sanitizeForWinAnsi(text: string): string {
    if (!text) return '';
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x00-\xFF]/g, '');
}

async function _loadCertificationCover(
    targetDoc: PDFDocument,
    params: {
        docType: string;
        orderId: number;
        translatedPages: number;
        dateStr: string;
        sourceLanguage?: string | null
    }
) {
    const { docType, orderId, translatedPages, dateStr, sourceLanguage } = params
    const publicDir = path.resolve(process.cwd(), 'public')
    const fileName = sourceLanguage === 'ES' ? 'capa certificacao es-en.pdf' : 'capa certificacao pt-en.pdf'
    const capaPath = path.join(publicDir, fileName)

    try {
        const fileExists = await fs.access(capaPath).then(() => true).catch(() => false);
        if (!fileExists) return null;

        const capaBytes = await fs.readFile(capaPath)
        const templatePdf = await PDFDocument.load(capaBytes)
        const boldFont = await templatePdf.embedFont(StandardFonts.HelveticaBold)
        const page = templatePdf.getPages()[0]
        const fontSize = 11;
        const fontColor = rgb(0, 0, 0);

        const safeDocType = sanitizeForWinAnsi(docType).toUpperCase();
        page.drawText(safeDocType, { x: 153, y: 660, size: fontSize, font: boldFont, color: fontColor })
        page.drawText(String(translatedPages || 1).padStart(2, '0'), { x: 157, y: 602, size: fontSize, font: boldFont, color: fontColor })
        page.drawText(`${orderId}-USA`, { x: 105, y: 583, size: fontSize, font: boldFont, color: fontColor })
        page.drawText(dateStr, { x: 77, y: 108, size: fontSize, font: boldFont, color: fontColor })

        const [capaPage] = await targetDoc.copyPages(templatePdf, [0])
        return capaPage
    } catch (err) {
        console.error(`[DeliveryKit] Erro interno ao processar capa ${fileName}:`, err)
        return null
    }
}

export async function generateDeliveryKit(
    orderId: number,
    documentId: number,
    options?: { preview?: boolean; coverLanguage?: string }
) {
    const isPreview = options?.preview ?? false
    try {
        const doc = await prisma.document.findUnique({
            where: { id: documentId },
            include: { order: true },
        })

        if (!doc) throw new Error('Documento não encontrado.')

        if (options?.coverLanguage) {
            await prisma.document.update({
                where: { id: documentId },
                data: { sourceLanguage: options.coverLanguage as SourceLanguage }
            });
            doc.sourceLanguage = options.coverLanguage as SourceLanguage;
        }

        const finalPdf = await PDFDocument.create()
        const translationPdf = await PDFDocument.create()
        let actualTranslationPageCount = 0

        const PAGE_WIDTH = 612;
        const PAGE_HEIGHT = 792;

        const publicDir = path.resolve(process.cwd(), 'public');
        const rootDir = process.cwd();
        let timbradoBytes: Buffer | null = null;

        const possiblePaths = [
            path.join(rootDir, 'letterhead.png'),
            path.join(publicDir, 'letterhead.png'),
            path.join(publicDir, 'letterhead promobi.png'),
        ];

        for (const p of possiblePaths) {
            try {
                timbradoBytes = await fs.readFile(p);
                break;
            } catch (e) { }
        }

        if (!timbradoBytes) throw new Error(`Timbrado não encontrado.`);
        const letterheadImage = await translationPdf.embedPng(timbradoBytes);

        if (doc.translatedText) {
            let cleanHtml = doc.translatedText
                .replace(/```html/gi, '')
                .replace(/```/gi, '')
                .trim();

            const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: Letter; margin: 0; }
    body {
      margin: 0; padding: 0;
      font-family: "Times New Roman", Times, serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #000;
      background: white;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: "Times New Roman", Times, serif !important;
      text-align: center !important;
      text-transform: uppercase !important;
      font-weight: bold !important;
      font-size: 11pt !important;
      margin: 8px 0 2px 0 !important;
    }
    p {
      font-family: "Times New Roman", Times, serif !important;
      font-size: 11pt !important;
      margin: 2px 0;
      line-height: 1.4;
    }
    strong, b { font-weight: bold !important; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin: 4px 0;
      font-size: 10pt;
    }
    th, td {
      border: 1pt solid black;
      padding: 4px 6px;
      vertical-align: top;
      word-wrap: break-word;
      overflow-wrap: break-word;
      font-family: "Times New Roman", Times, serif !important;
      font-size: 10pt !important;
    }
  </style>
</head>
<body>${cleanHtml}</body>
</html>`;

            const formData = new FormData();
            formData.append("files", new File([fullHtml], "index.html", { type: "text/html" }));

            // CONFIGURAÇÃO DE ALTA PRECISÃO GOTENBERG
            formData.append("paperWidth", "8.5");
            formData.append("paperHeight", "11");
            formData.append("marginTop", "1.8");    // Margem superior para o logo
            formData.append("marginBottom", "1.2"); // Margem inferior para o rodapé
            formData.append("marginLeft", "0.8");
            formData.append("marginRight", "0.8");
            formData.append("printBackground", "true"); // Ativa bordas e cores de fundo
            formData.append("scale", "0.85");           // Ajuste de escala para evitar transbordo
            formData.append("skipNetworkIdleEvent", "true");

            const gotenbergUrl = "http://127.0.0.1:3005/forms/chromium/convert/html";
            const gotenbergRes = await fetch(gotenbergUrl, { method: "POST", body: formData });

            if (!gotenbergRes.ok) throw new Error(`Gotenberg Error: ${gotenbergRes.status}`);

            const gotenbergBuffer = await gotenbergRes.arrayBuffer();
            const gotenbergPdf = await PDFDocument.load(gotenbergBuffer);
            const copiedPages = await translationPdf.copyPages(gotenbergPdf, gotenbergPdf.getPageIndices());

            for (const p of copiedPages) {
                const newPage = translationPdf.addPage(p);
                newPage.drawImage(letterheadImage, {
                    x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, blendMode: BlendMode.Multiply
                });
            }
            actualTranslationPageCount = copiedPages.length;
        }

        const now = new Date();
        const dateStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}/${now.getFullYear()}`;

        const capaPage = await _loadCertificationCover(finalPdf, {
            docType: doc.exactNameOnDoc || doc.docType || 'Official Document',
            orderId,
            translatedPages: actualTranslationPageCount || 1,
            dateStr,
            sourceLanguage: options?.coverLanguage || doc.sourceLanguage || doc.order.sourceLanguage
        })

        if (capaPage) finalPdf.addPage(capaPage)

        if (translationPdf.getPageCount() > 0) {
            const transPages = await finalPdf.copyPages(translationPdf, translationPdf.getPageIndices())
            transPages.forEach(p => finalPdf.addPage(p))
        }

        if (doc.originalFileUrl && doc.originalFileUrl !== 'PENDING_UPLOAD') {
            const originalRes = await fetch(doc.originalFileUrl)
            const originalBuf = Buffer.from(await originalRes.arrayBuffer())

            if (isPdf(originalBuf)) {
                const originalPdf = await PDFDocument.load(originalBuf, { ignoreEncryption: true })
                const copiedOrig = await finalPdf.copyPages(originalPdf, originalPdf.getPageIndices())
                copiedOrig.forEach((p, idx) => {
                    const rotationsMap = (doc.pageRotations as any) || {};
                    const rot = rotationsMap[String(idx)] || p.getRotation().angle;
                    p.setRotation(degrees(rot));
                    finalPdf.addPage(p)
                })
            }
        }

        const pdfBytes = await finalPdf.save()

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !supabaseServiceKey) throw new Error('ERRO: Chaves Supabase ausentes.');

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const safeName = `kit_${orderId}_${documentId}_${Date.now()}.pdf`
        const pathPrefix = isPreview ? 'orders/previews/' : 'orders/completed/'

        await supabase.storage.from('documents').upload(pathPrefix + safeName, Buffer.from(pdfBytes), {
            contentType: 'application/pdf', duplex: 'half'
        } as any)

        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(pathPrefix + safeName)

        if (!isPreview) {
            await prisma.document.update({
                where: { id: documentId },
                data: { delivery_pdf_url: urlData.publicUrl, translation_status: 'approved' }
            })
        }

        return { success: true, deliveryUrl: urlData.publicUrl }
    } catch (error: any) {
        console.error('[DeliveryKit] Erro:', error)
        return { success: false, error: error.message }
    }
}