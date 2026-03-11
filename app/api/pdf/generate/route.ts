import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export async function POST(req: Request) {
  try {
    const { htmlContent, fileName = "translation.pdf" } = await req.json();

    if (!htmlContent) return NextResponse.json({ error: "HTML content is required" }, { status: 400 });

    let letterheadBase64 = "";
    try {
      const letterheadPath = path.join(process.cwd(), 'public', 'letterhead.png');
      const imageBuffer = fs.readFileSync(letterheadPath);
      letterheadBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
    } catch (e) {
      console.warn("letterhead.png não encontrada.");
    }

    const fullHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <style>
          @page { size: Letter; margin: 0; }
          body {
            font-family: "Times New Roman", Times, serif;
            line-height: 1.2;
            color: black;
            text-align: left;
            margin: 0;
            padding: 0;
            background-image: url("${letterheadBase64}");
            background-size: 100% 100%;
            background-repeat: no-repeat;
            font-size: 9.5pt;
          }
          /* MARGENS CORRIGIDAS - Zona segura do Papel Timbrado */
          .content-wrapper {
            box-sizing: border-box;
            padding-top: 1.8in;
            padding-bottom: 1.2in;
            padding-left: 0.8in;
            padding-right: 0.8in;
            min-height: 11in;
          }
          h1, h2, h3 { text-align: center; text-transform: uppercase; font-size: 11pt; margin: 4pt 0; font-weight: bold; }
          p { margin-top: 0; margin-bottom: 3pt; }

          /* LAYOUT OFICIAL DE CERTIDÕES EM TABELAS */
          table { width: 100%; border-collapse: collapse; margin: 6pt 0; table-layout: fixed; }
          th, td { border: 0.75pt solid black; padding: 4pt; font-size: 8.5pt; vertical-align: top; word-wrap: break-word; }
          th { background-color: #f9fafb; text-align: left; font-weight: normal; font-size: 7.5pt; color: #555; text-transform: uppercase; }
          td strong { font-size: 9.5pt; display: block; margin-top: 2pt; color: #000; }

          .bracket-notation { color: #555; font-style: italic; background: #f0f0f0; border: 0.5pt solid #ccc; padding: 1px 3px; font-size: 8pt; }
          .translator-note { color: #003366; font-style: italic; background: #e6f2ff; border: 0.5pt solid #b3d1ff; padding: 1px 3px; font-size: 8pt; }
          .page-break { page-break-after: always; display: block; height: 0; border: none; margin: 0; padding: 0; }
        </style>
      </head>
      <body>
        <div class="content-wrapper">${htmlContent}</div>
      </body>
      </html>
    `;

    const formData = new FormData();
    formData.append("files", new Blob([fullHtml], { type: "text/html" }), "index.html");
    formData.append("scale", "0.82");

    const response = await fetch("http://localhost:3001/forms/chromium/convert/html", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error(`Gotenberg error: ${response.statusText}`);

    const pdfBuffer = await response.arrayBuffer();
    return new NextResponse(pdfBuffer, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileName}"` },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
