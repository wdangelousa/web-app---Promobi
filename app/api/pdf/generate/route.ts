import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export async function POST(req: Request) {
  try {
    const { htmlContent, fileName = "translation.pdf" } = await req.json();

    if (!htmlContent) return NextResponse.json({ error: "HTML required" }, { status: 400 });

    let safeHtml = htmlContent
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
<body>${safeHtml}</body>
</html>`;

    const formData = new FormData();
    formData.append("files", new File([fullHtml], "index.html", { type: "text/html" }));

    // CONFIGURAÇÃO RESTRITA PARA REPLICAR O PADRÃO ANEXO
    formData.append("paperWidth", "8.5");
    formData.append("paperHeight", "11");
    formData.append("marginTop", "1.8");
    formData.append("marginBottom", "1.2");
    formData.append("marginLeft", "0.8");
    formData.append("marginRight", "0.8");
    formData.append("printBackground", "true");
    formData.append("scale", "0.85");
    formData.append("skipNetworkIdleEvent", "true");

    const gotenbergUrl = "http://127.0.0.1:3005/forms/chromium/convert/html";
    const response = await fetch(gotenbergUrl, { method: "POST", body: formData });

    if (!response.ok) throw new Error(`Gotenberg error: ${response.status}`);

    const pdfBuffer = await response.arrayBuffer();
    return new NextResponse(pdfBuffer, {
      headers: { "Content-Type": "application/pdf" },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}