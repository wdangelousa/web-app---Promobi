// lib/translationHtmlSanitizer.ts
// ─────────────────────────────────────────────────────────────────────────────
// Post-processor that normalizes HTML from Claude's translation API
// before it enters the Tiptap editor or goes to Gotenberg for PDF rendering.
//
// Goals:
//   1. Flatten <h1>/<h2>/<h3> → <p><strong>UPPERCASE</strong></p>
//   2. Flatten simple label:value <table>s → inline flowing text
//   3. Strip excessive whitespace, empty tags, and stray wrappers
//   4. Ensure the translated HTML is compact enough that 1 source page ≈ 1 PDF page
//
// This runs server-side (no DOM), using only regex-based transforms.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point — sanitizes Claude's translation HTML for Gotenberg.
 * Call this BEFORE saving to `translatedText` in the database.
 */
export function sanitizeTranslationHtml(rawHtml: string): string {
  let html = rawHtml;

  // 0. Strip markdown fences if Claude wrapped the output
  html = html.replace(/^```html?\s*/i, '').replace(/\s*```\s*$/i, '');

  // 0.4. Convert plain text (no HTML tags) → <p> tags, one per line
  html = convertPlainTextToHtml(html);

  // 0.5. Convert markdown to HTML (safety net if Claude ignores HTML instructions)
  html = convertMarkdownToHtml(html);

  // 1. Flatten headings → bold uppercase paragraphs
  html = flattenHeadings(html);

  // 2. Flatten simple label:value tables → inline text
  html = flattenSimpleTables(html);

  // 3. Compact remaining tables (reduce padding via inline styles)
  html = compactRemainingTables(html);

  // 4. Remove empty paragraphs and excessive <br> tags
  html = removeEmptyElements(html);

  // 5. Collapse multiple consecutive line breaks
  html = collapseWhitespace(html);

  return html.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 0.5. CONVERT MARKDOWN TO HTML
// Safety net: converts markdown syntax to HTML in case Claude ignores the prompt.
// Only runs if the output looks like markdown (contains ** or # lines).
// ─────────────────────────────────────────────────────────────────────────────

function convertMarkdownToHtml(input: string): string {
  // Only process if markdown markers are present — skip if already HTML
  const hasMarkdown = /\*\*|^\s*#{1,3}\s/m.test(input);
  if (!hasMarkdown) return input;

  let text = input;

  // Convert markdown headings (# / ## / ###) → <p><strong>UPPER</strong></p>
  text = text.replace(/^\s*#{1,3}\s+(.+)$/gm, (_m, content) => {
    return `<p><strong>${content.trim().toUpperCase()}</strong></p>`;
  });

  // Convert **bold** → <strong>bold</strong>
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Convert *italic* → <em>italic</em>
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Wrap bare lines (not already wrapped in a tag) in <p>
  // Split by double newlines (paragraph breaks)
  const blocks = text.split(/\n{2,}/);
  text = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    // Already an HTML block — don't re-wrap
    if (/^<[a-z]/i.test(trimmed)) return trimmed;
    // Single-line breaks within a block → <br/>
    const withBreaks = trimmed.replace(/\n/g, '<br/>');
    return `<p>${withBreaks}</p>`;
  }).filter(Boolean).join('\n');

  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. FLATTEN HEADINGS
// ─────────────────────────────────────────────────────────────────────────────

function flattenHeadings(html: string): string {
  return html.replace(
    /<h([1-3])(\s[^>]*)?>(.+?)<\/h\1>/gi,
    (_match, _level, _attrs, content) => {
      const text = content.trim();
      return `<p><strong>${text.toUpperCase()}</strong></p>`;
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. FLATTEN SIMPLE TABLES
// ─────────────────────────────────────────────────────────────────────────────
// Detects tables where every row is a simple label:value pair (2 cells per row)
// and converts them to inline flowing text.

function flattenSimpleTables(html: string): string {
  return html.replace(
    /<table(\s[^>]*)?>[\s\S]*?<\/table>/gi,
    (tableBlock) => {
      const rows = [...tableBlock.matchAll(/<tr(\s[^>]*)?>[\s\S]*?<\/tr>/gi)];
      if (rows.length === 0) return tableBlock;

      const parsedRows: Array<{ label: string; value: string }> = [];
      let isSimple = true;

      for (const rowMatch of rows) {
        const rowHtml = rowMatch[0];
        const cells = [...rowHtml.matchAll(/<(th|td)(\s[^>]*)?>[\s\S]*?<\/\1>/gi)];

        if (cells.length !== 2) {
          isSimple = false;
          break;
        }

        const hasSpan = cells.some(c =>
          /colspan|rowspan/i.test(c[2] || '')
        );
        if (hasSpan) {
          isSimple = false;
          break;
        }

        const hasNestedComplex = cells.some(c =>
          /<table|<ul|<ol|<img/i.test(c[0])
        );
        if (hasNestedComplex) {
          isSimple = false;
          break;
        }

        const label = stripTags(cells[0][0]).trim();
        const value = stripTags(cells[1][0]).trim();
        parsedRows.push({ label, value });
      }

      if (!isSimple || parsedRows.length === 0) return tableBlock;

      const lines: string[] = [];
      let currentLine: string[] = [];

      for (const row of parsedRows) {
        currentLine.push(`<strong>${row.label}</strong> ${row.value}`);

        const lineLength = currentLine.join(' ').length;
        if (currentLine.length >= 3 || lineLength > 150) {
          lines.push(currentLine.join(' '));
          currentLine = [];
        }
      }
      if (currentLine.length > 0) {
        lines.push(currentLine.join(' '));
      }

      return lines.map(line => `<p>${line}</p>`).join('\n');
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. COMPACT REMAINING TABLES
// ─────────────────────────────────────────────────────────────────────────────

function compactRemainingTables(html: string): string {
  html = html.replace(
    /<table(\s[^>]*)?>/gi,
    '<table style="margin:4pt 0;font-size:9.5pt;">'
  );
  html = html.replace(
    /<(th|td)(\s[^>]*)?>/gi,
    (_match, tag, attrs) => {
      const cleanAttrs = (attrs || '').replace(/style="[^"]*"/gi, '');
      return `<${tag}${cleanAttrs} style="padding:2px 4px;border:0.5pt solid #999;">`;
    }
  );
  return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. REMOVE EMPTY ELEMENTS
// ─────────────────────────────────────────────────────────────────────────────

function removeEmptyElements(html: string): string {
  html = html.replace(/<p(\s[^>]*)?>(\s|&nbsp;)*<\/p>/gi, '');
  html = html.replace(/(<br\s*\/?>[\s]*){2,}/gi, '<br/>');
  html = html.replace(/<div(\s[^>]*)?>(\s|&nbsp;)*<\/div>/gi, '');
  return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. COLLAPSE WHITESPACE
// ─────────────────────────────────────────────────────────────────────────────

function collapseWhitespace(html: string): string {
  html = html.replace(/\n{3,}/g, '\n\n');
  html = html.replace(/<p(\s[^>]*)?>[\s]+/gi, '<p$1>');
  html = html.replace(/[\s]+<\/p>/gi, '</p>');
  return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  let text = html.replace(/<\/?(th|td|tr|strong|b|em|i|span)(\s[^>]*)?>/gi, '');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&nbsp;/g, ' ');
  return text;
}
