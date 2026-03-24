// lib/translationXmlToHtml.ts
// ─────────────────────────────────────────────────────────────────────────────
// Converts V2 XML semantic translation output → HTML for translatedPageTemplate.
// Deterministic: same XML always produces same HTML. No Claude involvement.
// ─────────────────────────────────────────────────────────────────────────────

import { XMLParser } from 'fast-xml-parser';

export interface XmlToHtmlResult {
  /** HTML ready for translatedPageTemplate.ts */
  html: string;
  /** Number of <page> elements found in XML */
  pageCount: number;
  /** Whether XML parsing succeeded */
  parseSuccess: boolean;
  /** Error message if parseSuccess === false */
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function textContent(node: any): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object' && '#text' in node) return String(node['#text']);
  return String(node);
}

// ── Block renderers ────────────────────────────────────────────────────────────

function renderField(field: any): string {
  const label = field?.['@_label'] ?? '';
  const value = textContent(field);
  if (label) {
    return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;
  }
  return `<p>${escapeHtml(value)}</p>`;
}

function renderRow(row: any): string {
  const cells = toArray(row?.cell);
  const tds = cells
    .map((c) => `<td style="border:1px solid #000;padding:4px">${escapeHtml(textContent(c))}</td>`)
    .join('');
  return `<tr>${tds}</tr>`;
}

function renderBlockChildren(block: any): string {
  const parts: string[] = [];

  // Render <field> children
  const fields = toArray(block?.field);
  for (const f of fields) {
    parts.push(renderField(f));
  }

  // Render <row> children (table content inside non-table blocks)
  const rows = toArray(block?.row);
  if (rows.length > 0) {
    const rowsHtml = rows.map(renderRow).join('');
    parts.push(`<table style="border-collapse:collapse;width:100%">${rowsHtml}</table>`);
  }

  // If there's direct text content and no children were rendered
  if (parts.length === 0) {
    const text = textContent(block);
    if (text.trim()) {
      parts.push(`<p>${escapeHtml(text.trim())}</p>`);
    }
  }

  return parts.join('\n');
}

function renderBlock(block: any): string {
  const type: string = block?.['@_type'] ?? 'content';
  const cssClass = `block-${type}`;

  switch (type) {
    case 'title': {
      const text = textContent(block).trim().toUpperCase();
      return `<div class="${cssClass}"><p><strong>${escapeHtml(text)}</strong></p></div>`;
    }

    case 'institution':
    case 'recipient': {
      const text = textContent(block).trim();
      return `<div class="${cssClass}"><p><strong>${escapeHtml(text)}</strong></p></div>`;
    }

    case 'prose': {
      const raw = textContent(block).trim();
      const paragraphs = raw.split(/\n\n+/).filter(Boolean);
      const pTags = paragraphs.map((p) => `<p>${escapeHtml(p.trim())}</p>`).join('\n');
      return `<div class="block-content">${pTags}</div>`;
    }

    case 'table': {
      const rows = toArray(block?.row);
      if (rows.length === 0) {
        return `<div class="block-content">${renderBlockChildren(block)}</div>`;
      }
      const rowsHtml = rows.map(renderRow).join('');
      return `<div class="block-content"><table style="border-collapse:collapse;width:100%">${rowsHtml}</table></div>`;
    }

    case 'content':
    case 'authentication': {
      const children = renderBlockChildren(block);
      return `<div class="${cssClass}">${children}</div>`;
    }

    case 'signatures':
    case 'stamps':
    case 'footer': {
      const text = textContent(block).trim();
      if (text) {
        return `<div class="${cssClass}"><p>${escapeHtml(text)}</p></div>`;
      }
      // May have structured children
      const children = renderBlockChildren(block);
      return `<div class="${cssClass}">${children}</div>`;
    }

    default: {
      const children = renderBlockChildren(block);
      return `<div class="block-content">${children}</div>`;
    }
  }
}

function renderPage(page: any): string {
  const blocks = toArray(page?.block);
  const blocksHtml = blocks.map(renderBlock).join('\n');
  return `<section class="page">\n${blocksHtml}\n</section>`;
}

// ── Fallback detection ─────────────────────────────────────────────────────────

function looksLikeHtml(text: string): boolean {
  const trimmed = text.trim();
  // Check for HTML indicators without XML wrapper
  const hasHtmlTags = /<(?:div|section|table|p|span|h[1-6])\b/i.test(trimmed);
  const lacksXmlWrapper = !/<translated-document\b/i.test(trimmed) && !/<page\b/i.test(trimmed);
  return hasHtmlTags && lacksXmlWrapper;
}

// ── Main export ────────────────────────────────────────────────────────────────

export function convertTranslationXmlToHtml(xmlString: string): XmlToHtmlResult {
  if (!xmlString || !xmlString.trim()) {
    return {
      html: '<p>[Translation failed - empty response]</p>',
      pageCount: 0,
      parseSuccess: false,
      error: 'Empty or unreadable XML response',
    };
  }

  const trimmed = xmlString.trim();

  // Detect if Claude returned HTML instead of XML
  if (looksLikeHtml(trimmed)) {
    return {
      html: trimmed,
      pageCount: 0,
      parseSuccess: false,
      error: 'Claude returned HTML instead of XML — fallback to legacy sanitizer',
    };
  }

  // Strip code fences if present
  const cleaned = trimmed
    .replace(/^```xml\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      trimValues: true,
      parseAttributeValue: false,
      // Ensure arrays for repeated elements
      isArray: (name) => ['page', 'block', 'field', 'row', 'cell'].includes(name),
    });

    const parsed = parser.parse(cleaned);
    const doc = parsed?.['translated-document'];

    if (!doc) {
      // Try to find pages directly in case wrapper is missing
      if (parsed?.page) {
        const pages = toArray(parsed.page);
        const pagesHtml = pages.map(renderPage).join('\n');
        return {
          html: `<div class="translated-document">\n${pagesHtml}\n</div>`,
          pageCount: pages.length,
          parseSuccess: true,
        };
      }

      return {
        html: cleaned,
        pageCount: 0,
        parseSuccess: false,
        error: 'XML parsed but no <translated-document> or <page> root found',
      };
    }

    const pages = toArray(doc?.page);
    if (pages.length === 0) {
      // Document has no pages — try to render blocks directly
      const blocks = toArray(doc?.block);
      if (blocks.length > 0) {
        const blocksHtml = blocks.map(renderBlock).join('\n');
        return {
          html: `<div class="translated-document">\n<section class="page">\n${blocksHtml}\n</section>\n</div>`,
          pageCount: 1,
          parseSuccess: true,
        };
      }

      return {
        html: '<p>[Translation failed - no pages in XML]</p>',
        pageCount: 0,
        parseSuccess: false,
        error: 'XML parsed but contains no <page> elements',
      };
    }

    const pagesHtml = pages.map(renderPage).join('\n');
    return {
      html: `<div class="translated-document">\n${pagesHtml}\n</div>`,
      pageCount: pages.length,
      parseSuccess: true,
    };
  } catch (err: any) {
    console.warn('[translationXmlToHtml] XML parse error:', err?.message);

    // If parsing fails, return raw content for fallback
    return {
      html: cleaned,
      pageCount: 0,
      parseSuccess: false,
      error: `XML parse failed: ${err?.message ?? 'unknown error'}`,
    };
  }
}
