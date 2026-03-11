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

        // ── SCANNER DO TIMBRADO ─────────────────────────
        const publicDir = path.resolve(process.cwd(), 'public');
        const rootDir = process.cwd();
        let timbradoBytes: Buffer | null = null;
        let foundPath = '';

        const possiblePaths = [
            path.join(rootDir, 'letterhead.png'),
            path.join(publicDir, 'letterhead.png'),
            path.join(publicDir, 'letterhead promobi.png'),
            path.join(rootDir, 'letterhead promobi.png'),
        ];

        for (const p of possiblePaths) {
            try {
                timbradoBytes = await fs.readFile(p);
                foundPath = p;
                break;
            } catch (e) { }
        }

        if (!timbradoBytes) {
            throw new Error(`ERRO: Imagem do timbrado não encontrada em lado nenhum.`);
        }

        const letterheadImage = await translationPdf.embedPng(timbradoBytes);

        // A. TRADUÇÃO EXTERNA
        if (doc.externalTranslationUrl) {
            const extRes = await fetch(doc.externalTranslationUrl)
            const extBuf = Buffer.from(await extRes.arrayBuffer())
            if (!isPdf(extBuf)) throw new Error("PDF externo inválido.");

            const extPdf = await PDFDocument.load(extBuf, { ignoreEncryption: true })
            const embeddedPages = await translationPdf.embedPages(extPdf.getPages())

            for (const embeddedPage of embeddedPages) {
                const newPage = translationPdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
                const scale = Math.min(PAGE_WIDTH / embeddedPage.width, PAGE_HEIGHT / embeddedPage.height);
                newPage.drawPage(embeddedPage, {
                    x: (PAGE_WIDTH - embeddedPage.width * scale) / 2,
                    y: (PAGE_HEIGHT - embeddedPage.height * scale) / 2,
                    width: embeddedPage.width * scale,
                    height: embeddedPage.height * scale,
                });
                newPage.drawImage(letterheadImage, {
                    x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, blendMode: BlendMode.Multiply
                });
            }
            actualTranslationPageCount = embeddedPages.length
        }

        // B. TRADUÇÃO INTERNA (GOTENBERG) — PAGINAÇÃO 1-PARA-1 + TIMBRADO (MULTIPLY)
        else if (doc.translatedText && !doc.translatedText.startsWith('{"sections"') && !doc.translatedText.includes('"blocks"')) {

            const fullHtml = `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8">
                <style>
                  /* @page margin: 0 — margens reais definidas pelos params do Gotenberg abaixo */
                  @page { size: Letter; }
                  body {
                    font-family: "Times New Roman", Times, serif;
                    line-height: 1.2;
                    color: black;
                    background-color: white !important;
                    margin: 0; padding: 0;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    font-size: 9.5pt;
                  }
                  /* Paginação 1-para-1: gerado pela IA Claude (<div class="page-break">) ou manualmente (<hr>) */
                  .page-break {
                    break-after: page;
                    page-break-after: always;
                    height: 0;
                    visibility: hidden;
                    margin: 0; padding: 0;
                    display: block;
                  }
                  hr {
                    break-after: page;
                    page-break-after: always;
                    height: 0;
                    border: none;
                    margin: 0; padding: 0;
                  }
                  table { width: 100%; border-collapse: collapse; margin: 6pt 0; table-layout: fixed; }
                  th, td { border: 0.75pt solid black; padding: 4pt; font-size: 8.5pt; vertical-align: top; word-wrap: break-word; }
                  th { background-color: #f9fafb; text-align: left; font-weight: normal; font-size: 7.5pt; color: #555; text-transform: uppercase; }
                  td strong { font-size: 9.5pt; display: block; margin-top: 2pt; color: #000; }
                  h1, h2, h3 { text-align: center; text-transform: uppercase; font-size: 11pt; margin: 4pt 0; font-weight: bold; }
                  p { margin-top: 0; margin-bottom: 3pt; }
                </style>
              </head>
              <body>
                ${doc.translatedText}
              </body>
              </html>
            `;

            const formData = new FormData();
            formData.append("files", new Blob([fullHtml], { type: "text/html" }), "index.html");
            formData.append("paperWidth", "8.5");
            formData.append("paperHeight", "11");
            // Margens em polegadas = zonas seguras do timbrado (topo: logo, baixo: rodapé)
            formData.append("marginTop", "1.8");
            formData.append("marginBottom", "1.2");
            formData.append("marginLeft", "0.8");
            formData.append("marginRight", "0.8");

            const gotenbergRes = await fetch("http://localhost:3001/forms/chromium/convert/html", {
                method: "POST",
                body: formData,
            });

            if (!gotenbergRes.ok) {
                const errBody = await gotenbergRes.text().catch(() => '(sem corpo)');
                throw new Error(`Falha no Gotenberg: Status ${gotenbergRes.status} — ${errBody}`);
            }

            const gotenbergBuffer = await gotenbergRes.arrayBuffer();
            const gotenbergPdf = await PDFDocument.load(gotenbergBuffer);

            const copiedPages = await translationPdf.copyPages(gotenbergPdf, gotenbergPdf.getPageIndices());

            const now = new Date();
            const transDateStr = `Date: ${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}/${now.getFullYear()}`;

            for (const p of copiedPages) {
                const newPage = translationPdf.addPage(p);
                newPage.drawImage(letterheadImage, {
                    x: 0,
                    y: 0,
                    width: PAGE_WIDTH,
                    height: PAGE_HEIGHT,
                    // blendMode: BlendMode.Multiply
                });
                newPage.drawText(transDateStr, {
                    x: PAGE_WIDTH - 150,
                    y: PAGE_HEIGHT - 65,
                    size: 10,
                    font: await translationPdf.embedFont(StandardFonts.Helvetica),
                    color: rgb(0, 0, 0),
                });
            }
            actualTranslationPageCount = copiedPages.length;
        }

        // CAPA
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

        // ORIGINAL FILE
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