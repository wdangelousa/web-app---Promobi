// app/api/pdf/generate/route.ts
// Promobidocs — Gotenberg 8 PDF Generation (Cartório Standard)
// Endpoint: POST /api/pdf/generate

import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────
// 1. GOTENBERG ENGINE CONFIG
// ─────────────────────────────────────────────
const GOTENBERG_URL =
  "http://127.0.0.1:3005/forms/chromium/convert/html";

const PDF_CONFIG = {
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
// 2. CARTÓRIO CSS — Authority Style
// ─────────────────────────────────────────────
const CARTORIO_CSS = `
  /* ── Reset & Base ── */
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  @page {
    size: letter;
    margin: 0;
  }

  html, body {
    width: 100%;
    height: 100%;
    font-family: "Times New Roman", Times, serif;
    font-size: 11pt;
    line-height: 1.45;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Page Container ── */
  .page {
    width: 100%;
    padding: 0;
    page-break-after: always;
    position: relative;
  }

  .page:last-child {
    page-break-after: auto;
  }

  /* ── Header / Letterhead ── */
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

  /* ── Document Title ── */
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

  /* ── Section Headers ── */
  .section-title {
    font-size: 11pt;
    font-weight: bold;
    text-transform: uppercase;
    margin: 12pt 0 6pt;
    padding-bottom: 2pt;
    border-bottom: 1pt solid #000;
  }

  /* ── Tables — Cartório Standard ── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0;
    font-size: 10pt;
    page-break-inside: avoid;
  }

  table th,
  table td {
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

  /* Label/value pattern: label left, value right */
  table .label-cell {
    width: 35%;
    font-weight: bold;
    background-color: #fafafa;
  }

  table .value-cell {
    width: 65%;
  }

  /* ── Body Text ── */
  .body-text {
    text-align: justify;
    text-indent: 2em;
    margin-bottom: 8pt;
    font-size: 11pt;
  }

  .body-text.no-indent {
    text-indent: 0;
  }

  /* ── Certification Block ── */
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

  /* ── Signature Area ── */
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

  .signature-name {
    font-weight: bold;
    font-size: 10pt;
  }

  .signature-title {
    font-size: 9pt;
    color: #333;
  }

  /* ── Footer ── */
  .footer {
    text-align: center;
    font-size: 7.5pt;
    color: #666;
    border-top: 1pt solid #999;
    padding-top: 6pt;
    margin-top: 16pt;
  }

  /* ── Notarial Seal placeholder ── */
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

  /* ── Utility ── */
  .text-center { text-align: center; }
  .text-right  { text-align: right; }
  .text-bold   { font-weight: bold; }
  .text-italic { font-style: italic; }
  .text-small  { font-size: 9pt; }
  .text-upper  { text-transform: uppercase; }
  .mt-4  { margin-top: 4pt; }
  .mt-8  { margin-top: 8pt; }
  .mt-12 { margin-top: 12pt; }
  .mb-4  { margin-bottom: 4pt; }
  .mb-8  { margin-bottom: 8pt; }
  .no-break { page-break-inside: avoid; }
`;

// ─────────────────────────────────────────────
// 3. HTML WRAPPER — Wraps translation content
// ─────────────────────────────────────────────
function wrapHtmlForGotenberg(bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${CARTORIO_CSS}</style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}

// ─────────────────────────────────────────────
// 4. MARRIAGE CERTIFICATE TEMPLATE (Example)
// ─────────────────────────────────────────────
interface MarriageCertData {
  orderNumber: string;
  registryOffice: string;
  bookNumber: string;
  pageNumber: string;
  registrationNumber: string;
  spouse1: {
    fullName: string;
    nationality: string;
    dateOfBirth: string;
    placeOfBirth: string;
    occupation: string;
    idDocument: string;
    fatherName: string;
    motherName: string;
  };
  spouse2: {
    fullName: string;
    nationality: string;
    dateOfBirth: string;
    placeOfBirth: string;
    occupation: string;
    idDocument: string;
    fatherName: string;
    motherName: string;
  };
  marriageDate: string;
  propertyRegime: string;
  officiantName: string;
  notes?: string;
}

function buildMarriageCertificateHtml(data: MarriageCertData): string {
  const buildSpouseTable = (label: string, spouse: MarriageCertData["spouse1"]) => `
    <div class="section-title">${label}</div>
    <table>
      <tr><td class="label-cell">Full Name</td><td class="value-cell">${spouse.fullName}</td></tr>
      <tr><td class="label-cell">Nationality</td><td class="value-cell">${spouse.nationality}</td></tr>
      <tr><td class="label-cell">Date of Birth</td><td class="value-cell">${spouse.dateOfBirth}</td></tr>
      <tr><td class="label-cell">Place of Birth</td><td class="value-cell">${spouse.placeOfBirth}</td></tr>
      <tr><td class="label-cell">Occupation</td><td class="value-cell">${spouse.occupation}</td></tr>
      <tr><td class="label-cell">ID Document</td><td class="value-cell">${spouse.idDocument}</td></tr>
      <tr><td class="label-cell">Father&rsquo;s Name</td><td class="value-cell">${spouse.fatherName}</td></tr>
      <tr><td class="label-cell">Mother&rsquo;s Name</td><td class="value-cell">${spouse.motherName}</td></tr>
    </table>
  `;

  const bodyContent = `
    <div class="page">
      <!-- ── HEADER / LETTERHEAD ── -->
      <div class="header">
        <div class="logo-line">Certified Translation Services</div>
        <div class="company-name">Promobidocs</div>
        <div class="tagline">Official Certified Translations &mdash; USCIS &bull; DMV &bull; Academic</div>
        <div class="credentials">
          ATA Associate Member &bull; Florida Notary Public &bull; Order #${data.orderNumber}
        </div>
      </div>

      <!-- ── DOCUMENT TITLE ── -->
      <div class="doc-title">Certified Translation &mdash; Marriage Certificate</div>
      <div class="doc-subtitle">
        Translated from Portuguese (Brazil) into English (United States)
      </div>

      <!-- ── REGISTRY INFO ── -->
      <div class="section-title">Registry Information</div>
      <table>
        <tr>
          <td class="label-cell">Registry Office</td>
          <td class="value-cell">${data.registryOffice}</td>
        </tr>
        <tr>
          <td class="label-cell">Book / Page</td>
          <td class="value-cell">Book ${data.bookNumber}, Page ${data.pageNumber}</td>
        </tr>
        <tr>
          <td class="label-cell">Registration No.</td>
          <td class="value-cell">${data.registrationNumber}</td>
        </tr>
        <tr>
          <td class="label-cell">Date of Marriage</td>
          <td class="value-cell">${data.marriageDate}</td>
        </tr>
      </table>

      <!-- ── SPOUSE 1 ── -->
      ${buildSpouseTable("1st Spouse", data.spouse1)}

      <!-- ── SPOUSE 2 ── -->
      ${buildSpouseTable("2nd Spouse", data.spouse2)}

      <!-- ── PROPERTY REGIME ── -->
      <div class="section-title">Property Regime</div>
      <p class="body-text no-indent">${data.propertyRegime}</p>

      <!-- ── OFFICIANT ── -->
      <div class="section-title">Officiant</div>
      <p class="body-text no-indent">${data.officiantName}</p>

      ${data.notes ? `
      <div class="section-title">Annotations / Notes</div>
      <p class="body-text no-indent">${data.notes}</p>
      ` : ""}

      <!-- ── CERTIFICATION BLOCK ── -->
      <div class="certification-block">
        <p>
          <strong>TRANSLATOR&rsquo;S CERTIFICATION:</strong> I, Isabele Bandeira de Moraes D&rsquo;Angelo,
          ATA Associate Member (Credential M-194918), do hereby certify that the foregoing is a true
          and accurate translation of the original document in Portuguese into English, to the best
          of my knowledge and ability.
        </p>
        <p class="text-small">
          Sworn and subscribed before me, a Notary Public in and for the State of Florida,
          on this _____ day of ______________, 20____.
        </p>
      </div>

      <!-- ── SIGNATURE ── -->
      <div class="signature-area">
        <div class="notarial-seal">[SEAL]</div>
        <div class="signature-line">
          <div class="signature-name">Isabele Bandeira de Moraes D&rsquo;Angelo</div>
          <div class="signature-title">ATA Associate &bull; Florida Notary Public</div>
        </div>
      </div>

      <!-- ── FOOTER ── -->
      <div class="footer">
        Promobidocs &mdash; Certified Translation &amp; Notarization Services
        &bull; Order #${data.orderNumber}
        &bull; This document is not valid without the translator&rsquo;s signature and notarial seal.
      </div>
    </div>
  `;

  return bodyContent;
}

// ─────────────────────────────────────────────
// 5. GENERIC TEMPLATE — For any translation
// ─────────────────────────────────────────────
interface GenericTranslationData {
  orderNumber: string;
  documentType: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatedContent: string; // Pre-formatted HTML from Tiptap/workbench
}

function buildGenericTranslationHtml(data: GenericTranslationData): string {
  return `
    <div class="page">
      <div class="header">
        <div class="logo-line">Certified Translation Services</div>
        <div class="company-name">Promobidocs</div>
        <div class="tagline">Official Certified Translations &mdash; USCIS &bull; DMV &bull; Academic</div>
        <div class="credentials">
          ATA Associate Member &bull; Florida Notary Public &bull; Order #${data.orderNumber}
        </div>
      </div>

      <div class="doc-title">Certified Translation &mdash; ${data.documentType}</div>
      <div class="doc-subtitle">
        Translated from ${data.sourceLanguage} into ${data.targetLanguage}
      </div>

      <!-- Translated content injected from workbench -->
      <div class="translation-body">
        ${data.translatedContent}
      </div>

      <div class="certification-block">
        <p>
          <strong>TRANSLATOR&rsquo;S CERTIFICATION:</strong> I, Isabele Bandeira de Moraes D&rsquo;Angelo,
          ATA Associate Member (Credential M-194918), do hereby certify that the foregoing is a true
          and accurate translation of the original document in ${data.sourceLanguage} into
          ${data.targetLanguage}, to the best of my knowledge and ability.
        </p>
        <p class="text-small">
          Sworn and subscribed before me, a Notary Public in and for the State of Florida,
          on this _____ day of ______________, 20____.
        </p>
      </div>

      <div class="signature-area">
        <div class="notarial-seal">[SEAL]</div>
        <div class="signature-line">
          <div class="signature-name">Isabele Bandeira de Moraes D&rsquo;Angelo</div>
          <div class="signature-title">ATA Associate &bull; Florida Notary Public</div>
        </div>
      </div>

      <div class="footer">
        Promobidocs &mdash; Certified Translation &amp; Notarization Services
        &bull; Order #${data.orderNumber}
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────
// 6. API ROUTE HANDLER
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      template,       // "marriage_certificate" | "generic"
      data,           // Template-specific data
    } = body;

    // Build HTML based on template type
    let innerHtml: string;

    switch (template) {
      case "marriage_certificate":
        innerHtml = buildMarriageCertificateHtml(data as MarriageCertData);
        break;
      case "generic":
        innerHtml = buildGenericTranslationHtml(data as GenericTranslationData);
        break;
      default:
        // Fallback: if raw HTML is sent, wrap it directly
        if (body.rawHtml) {
          innerHtml = body.rawHtml;
        } else {
          return NextResponse.json(
            { error: `Unknown template: "${template}"` },
            { status: 400 }
          );
        }
    }

    const fullHtml = wrapHtmlForGotenberg(innerHtml);

    // ── Build FormData for Gotenberg ──
    const formData = new FormData();

    // The HTML file — Gotenberg expects a file named "index.html"
    const htmlBlob = new Blob([fullHtml], { type: "text/html" });
    formData.append("files", htmlBlob, "index.html");

    // Engine parameters
    for (const [key, value] of Object.entries(PDF_CONFIG)) {
      formData.append(key, value);
    }

    // ── Call Gotenberg ──
    const gotenbergResponse = await fetch(GOTENBERG_URL, {
      method: "POST",
      body: formData,
    });

    if (!gotenbergResponse.ok) {
      const errorText = await gotenbergResponse.text();
      console.error("[Gotenberg] Error:", gotenbergResponse.status, errorText);
      return NextResponse.json(
        {
          error: "PDF generation failed",
          details: errorText,
          status: gotenbergResponse.status,
        },
        { status: 502 }
      );
    }

    // ── Return PDF ──
    const pdfBuffer = await gotenbergResponse.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="promobidocs-${body.data?.orderNumber ?? "document"}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[PDF Generate] Unexpected error:", error);
    return NextResponse.json(
      {
        error: "Internal server error during PDF generation",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}