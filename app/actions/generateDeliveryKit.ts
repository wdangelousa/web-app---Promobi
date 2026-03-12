// app/actions/generateDeliveryKit.ts
// Promobidocs — Delivery Kit Generator (Server Action)
// Orchestrates: Fetch order → Build HTML → Call Gotenberg → Store/Return PDF

"use server";

import { prisma } from "@/lib/i18n/prisma";
import { revalidatePath } from "next/cache";

// ─────────────────────────────────────────────
// 1. TYPES
// ─────────────────────────────────────────────
interface DeliveryKitResult {
    success: boolean;
    pdfUrl?: string;
    pdfBase64?: string;
    fileName?: string;
    error?: string;
}

interface GenerateOptions {
    orderId: string;
    template?: "marriage_certificate" | "generic";
    returnBase64?: boolean; // If true, returns base64 instead of URL
}

// ─────────────────────────────────────────────
// 2. GOTENBERG CONFIG
// ─────────────────────────────────────────────
const GOTENBERG_URL =
    "http://127.0.0.1:3005/forms/chromium/convert/html";

const PDF_ENGINE = {
    paperWidth: "8.5",
    paperHeight: "11",
    marginTop: "1.8",
    marginBottom: "1.2",
    marginLeft: "0.8",
    marginRight: "0.8",
    scale: "0.85",
    printBackground: "true",
    preferCssPageSize: "false",
    skipNetworkIdleEvent: "true",
} as const;

// ─────────────────────────────────────────────
// 3. CARTÓRIO CSS (Inline — Gotenberg has no
//    access to your Next.js static files)
// ─────────────────────────────────────────────
const CARTORIO_CSS = `
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  @page { size: letter; margin: 0; }

  html, body {
    width: 100%;
    font-family: "Times New Roman", Times, serif;
    font-size: 11pt;
    line-height: 1.45;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    width: 100%;
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }

  /* Header */
  .header {
    text-align: center;
    margin-bottom: 16pt;
    padding-bottom: 10pt;
    border-bottom: 2pt solid #000;
  }
  .header .logo-line {
    font-size: 9pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1.5pt;
    color: #333;
    margin-bottom: 4pt;
  }
  .header .company-name {
    font-size: 14pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 2pt;
    margin-bottom: 2pt;
  }
  .header .tagline {
    font-size: 8.5pt;
    color: #555;
    font-style: italic;
  }
  .header .credentials {
    font-size: 8pt;
    color: #444;
    margin-top: 4pt;
  }

  /* Titles */
  .doc-title {
    text-align: center;
    font-size: 13pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1pt;
    margin: 14pt 0 10pt;
    text-decoration: underline;
  }
  .doc-subtitle {
    text-align: center;
    font-size: 10pt;
    font-style: italic;
    margin-bottom: 14pt;
    color: #333;
  }
  .section-title {
    font-size: 11pt;
    font-weight: bold;
    text-transform: uppercase;
    margin: 12pt 0 6pt;
    padding-bottom: 2pt;
    border-bottom: 1pt solid #000;
  }

  /* Tables — Cartório */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0;
    font-size: 10pt;
    page-break-inside: avoid;
  }
  table th, table td {
    border: 1pt solid #000;
    padding: 6px;
    text-align: left;
    vertical-align: top;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  table th {
    background-color: #f0f0f0;
    font-weight: bold;
    font-size: 9.5pt;
    text-transform: uppercase;
  }
  .label-cell {
    width: 35%;
    font-weight: bold;
    background-color: #fafafa;
  }
  .value-cell { width: 65%; }

  /* Body text */
  .body-text {
    text-align: justify;
    text-indent: 2em;
    margin-bottom: 8pt;
    font-size: 11pt;
  }
  .body-text.no-indent { text-indent: 0; }

  /* Certification */
  .certification-block {
    margin-top: 20pt;
    padding: 12pt;
    border: 2pt solid #000;
    background-color: #fafafa;
    page-break-inside: avoid;
  }
  .certification-block p {
    font-size: 10pt;
    margin-bottom: 6pt;
    text-align: justify;
  }

  /* Signature */
  .signature-area {
    margin-top: 30pt;
    text-align: center;
    page-break-inside: avoid;
  }
  .signature-line {
    width: 280pt;
    border-top: 1pt solid #000;
    margin: 0 auto 4pt;
    padding-top: 4pt;
  }
  .signature-name { font-weight: bold; font-size: 10pt; }
  .signature-title { font-size: 9pt; color: #333; }

  /* Footer */
  .footer {
    text-align: center;
    font-size: 7.5pt;
    color: #666;
    border-top: 1pt solid #999;
    padding-top: 6pt;
    margin-top: 16pt;
  }

  /* Seal */
  .notarial-seal {
    display: inline-block;
    width: 80pt;
    height: 80pt;
    border: 1pt dashed #999;
    border-radius: 50%;
    text-align: center;
    line-height: 80pt;
    font-size: 7pt;
    color: #999;
    margin: 10pt 0;
  }

  /* Tiptap content normalization */
  .translation-body h1,
  .translation-body h2,
  .translation-body h3 {
    font-family: "Times New Roman", Times, serif;
    margin: 10pt 0 6pt;
  }
  .translation-body p {
    margin-bottom: 6pt;
    text-align: justify;
  }
  .translation-body table {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0;
  }
  .translation-body table td,
  .translation-body table th {
    border: 1pt solid #000;
    padding: 6px;
  }
  .translation-body ul, .translation-body ol {
    margin-left: 20pt;
    margin-bottom: 8pt;
  }

  .text-center { text-align: center; }
  .text-small  { font-size: 9pt; }
  .no-break    { page-break-inside: avoid; }
`;

// ─────────────────────────────────────────────
// 4. SOURCE LANGUAGE MAP
// ─────────────────────────────────────────────
const SOURCE_LANGUAGE_LABELS: Record<string, string> = {
    "PT_BR": "Portuguese (Brazil)",
    "ES": "Spanish",
    "EN": "English",
};

// ─────────────────────────────────────────────
// 5. HTML BUILDERS
// ─────────────────────────────────────────────
function wrapFullHtml(body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>${CARTORIO_CSS}</style>
</head>
<body>${body}</body>
</html>`;
}

function buildHeaderHtml(orderNumber: string): string {
    return `
    <div class="header">
      <div class="logo-line">Certified Translation Services</div>
      <div class="company-name">Promobidocs</div>
      <div class="tagline">Official Certified Translations &mdash; USCIS &bull; DMV &bull; Academic</div>
      <div class="credentials">
        ATA Associate Member &bull; Florida Notary Public &bull; Order #${orderNumber}
      </div>
    </div>
  `;
}

function buildCertificationHtml(sourceLanguage: string): string {
    const sourceLang = SOURCE_LANGUAGE_LABELS[sourceLanguage] ?? sourceLanguage;
    return `
    <div class="certification-block">
      <p>
        <strong>TRANSLATOR&rsquo;S CERTIFICATION:</strong> I, Isabele Bandeira de Moraes D&rsquo;Angelo,
        ATA Associate Member (Credential M-194918), do hereby certify that the foregoing is a true
        and accurate translation of the original document in ${sourceLang} into English (United States),
        to the best of my knowledge and ability.
      </p>
      <p class="text-small">
        Sworn and subscribed before me, a Notary Public in and for the State of Florida,
        on this ${new Date().getDate()} day of ${new Date().toLocaleString("en-US", { month: "long" })}, ${new Date().getFullYear()}.
      </p>
    </div>

    <div class="signature-area">
      <div class="notarial-seal">[SEAL]</div>
      <div class="signature-line">
        <div class="signature-name">Isabele Bandeira de Moraes D&rsquo;Angelo</div>
        <div class="signature-title">ATA Associate &bull; Florida Notary Public</div>
      </div>
    </div>
  `;
}

function buildFooterHtml(orderNumber: string): string {
    return `
    <div class="footer">
      Promobidocs &mdash; Certified Translation &amp; Notarization Services
      &bull; Order #${orderNumber}
      &bull; This document is not valid without the translator&rsquo;s signature and notarial seal.
    </div>
  `;
}

// ─────────────────────────────────────────────
// 6. MAIN ACTION
// ─────────────────────────────────────────────
export async function generateDeliveryKit(
    options: GenerateOptions
): Promise<DeliveryKitResult> {
    const { orderId, template = "generic", returnBase64 = false } = options;

    try {
        // ── Fetch order with documents ──
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                documents: {
                    where: { status: "TRANSLATED" }, // Only include finished docs
                    orderBy: { position: "asc" },
                },
            },
        });

        if (!order) {
            return { success: false, error: `Order not found: ${orderId}` };
        }

        if (order.documents.length === 0) {
            return {
                success: false,
                error: "No translated documents found for this order.",
            };
        }

        const orderNumber = order.orderNumber ?? order.id.slice(0, 8).toUpperCase();
        const sourceLanguage = (order as any).sourceLanguage ?? "PT_BR";
        const sourceLangLabel = SOURCE_LANGUAGE_LABELS[sourceLanguage] ?? sourceLanguage;

        // ── Build per-document pages ──
        const documentPages = order.documents.map((doc, idx) => {
            const docType = (doc as any).documentType ?? "Document";
            // translatedContent is the HTML from Tiptap editor saved in the DB
            const translatedHtml = (doc as any).translatedContent ?? (doc as any).translationHtml ?? "";

            return `
        <div class="page">
          ${buildHeaderHtml(orderNumber)}

          <div class="doc-title">
            Certified Translation &mdash; ${docType}
          </div>
          <div class="doc-subtitle">
            Translated from ${sourceLangLabel} into English (United States)
            ${order.documents.length > 1 ? `&bull; Document ${idx + 1} of ${order.documents.length}` : ""}
          </div>

          <div class="translation-body">
            ${translatedHtml}
          </div>

          ${buildCertificationHtml(sourceLanguage)}
          ${buildFooterHtml(orderNumber)}
        </div>
      `;
        });

        const fullBody = documentPages.join("\n");
        const fullHtml = wrapFullHtml(fullBody);

        // ── Call Gotenberg ──
        const formData = new FormData();
        const htmlBlob = new Blob([fullHtml], { type: "text/html" });
        formData.append("files", htmlBlob, "index.html");

        for (const [key, value] of Object.entries(PDF_ENGINE)) {
            formData.append(key, value);
        }

        const gotenbergRes = await fetch(GOTENBERG_URL, {
            method: "POST",
            body: formData,
        });

        if (!gotenbergRes.ok) {
            const errText = await gotenbergRes.text();
            console.error(
                `[DeliveryKit] Gotenberg error ${gotenbergRes.status}:`,
                errText
            );
            return {
                success: false,
                error: `Gotenberg returned ${gotenbergRes.status}: ${errText}`,
            };
        }

        const pdfBuffer = Buffer.from(await gotenbergRes.arrayBuffer());
        const fileName = `promobidocs-${orderNumber}.pdf`;

        // ── Option A: Return base64 (for preview / email) ──
        if (returnBase64) {
            return {
                success: true,
                pdfBase64: pdfBuffer.toString("base64"),
                fileName,
            };
        }

        // ── Option B: Store in Supabase Storage & return URL ──
        // Adjust this to your actual storage setup
        try {
            const { createClient } = await import("@supabase/supabase-js");
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );

            const storagePath = `deliveries/${orderId}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from("translations") // Your bucket name
                .upload(storagePath, pdfBuffer, {
                    contentType: "application/pdf",
                    upsert: true,
                });

            if (uploadError) {
                console.error("[DeliveryKit] Storage upload error:", uploadError);
                // Fallback to base64 if storage fails
                return {
                    success: true,
                    pdfBase64: pdfBuffer.toString("base64"),
                    fileName,
                };
            }

            const { data: urlData } = supabase.storage
                .from("translations")
                .getPublicUrl(storagePath);

            // ── Update order status ──
            await prisma.order.update({
                where: { id: orderId },
                data: {
                    status: "DELIVERED",
                    deliveryPdfUrl: urlData.publicUrl,
                    deliveredAt: new Date(),
                },
            });

            revalidatePath(`/admin/orders/${orderId}`);
            revalidatePath("/admin/orders");

            return {
                success: true,
                pdfUrl: urlData.publicUrl,
                fileName,
            };
        } catch (storageError) {
            console.error("[DeliveryKit] Storage error, returning base64:", storageError);
            return {
                success: true,
                pdfBase64: pdfBuffer.toString("base64"),
                fileName,
            };
        }
    } catch (error) {
        console.error("[DeliveryKit] Unexpected error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

// ─────────────────────────────────────────────
// 7. PREVIEW ACTION (for Workbench "Preview PDF")
// ─────────────────────────────────────────────
export async function previewDocumentPdf(
    documentId: string,
    translatedHtml: string,
    documentType: string = "Document",
    sourceLanguage: string = "PT_BR"
): Promise<DeliveryKitResult> {
    try {
        const sourceLangLabel = SOURCE_LANGUAGE_LABELS[sourceLanguage] ?? sourceLanguage;

        const body = `
      <div class="page">
        ${buildHeaderHtml("PREVIEW")}
        <div class="doc-title">Certified Translation &mdash; ${documentType}</div>
        <div class="doc-subtitle">
          Translated from ${sourceLangLabel} into English (United States)
        </div>
        <div class="translation-body">${translatedHtml}</div>
        ${buildCertificationHtml(sourceLanguage)}
        ${buildFooterHtml("PREVIEW")}
      </div>
    `;

        const fullHtml = wrapFullHtml(body);

        const formData = new FormData();
        formData.append("files", new Blob([fullHtml], { type: "text/html" }), "index.html");

        for (const [key, value] of Object.entries(PDF_ENGINE)) {
            formData.append(key, value);
        }

        const res = await fetch(GOTENBERG_URL, { method: "POST", body: formData });

        if (!res.ok) {
            const errText = await res.text();
            return { success: false, error: `Gotenberg ${res.status}: ${errText}` };
        }

        const pdfBuffer = Buffer.from(await res.arrayBuffer());

        return {
            success: true,
            pdfBase64: pdfBuffer.toString("base64"),
            fileName: `preview-${documentId}.pdf`,
        };
    } catch (error) {
        console.error("[PreviewPDF] Error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}