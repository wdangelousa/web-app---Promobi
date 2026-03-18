/**
 * lib/translatedPageSafeArea.ts
 * ---------------------------------------------------------------------------
 * Canonical translated-page safe area for branded letterhead output.
 *
 * This is the single source of truth used by translated preview/delivery flows
 * and shared translated page wrappers.
 * ---------------------------------------------------------------------------
 */

export type TranslatedPageOrientation = 'portrait' | 'landscape';
export type TranslatedPageOrientationInput =
  | TranslatedPageOrientation
  | 'unknown'
  | null
  | undefined;

export interface TranslatedPageSafeArea {
  orientation: TranslatedPageOrientation;
  paperWidthIn: string;
  paperHeightIn: string;
  marginTopIn: string;
  marginRightIn: string;
  marginBottomIn: string;
  marginLeftIn: string;
}

const TRANSLATED_PAGE_SAFE_AREA_BY_ORIENTATION: Record<
  TranslatedPageOrientation,
  Omit<TranslatedPageSafeArea, 'orientation'>
> = {
  portrait: {
    paperWidthIn: '8.5',
    paperHeightIn: '11',
    marginTopIn: '1.85',
    marginRightIn: '0.7',
    marginBottomIn: '0.75',
    marginLeftIn: '1.0',
  },
  landscape: {
    paperWidthIn: '11',
    paperHeightIn: '8.5',
    marginTopIn: '1.85',
    marginRightIn: '0.7',
    marginBottomIn: '0.75',
    marginLeftIn: '1.0',
  },
};

const SAFE_AREA_STYLE_ID = 'translated-page-safe-area-policy';

export function normalizeTranslatedPageOrientation(
  orientation: TranslatedPageOrientationInput,
): TranslatedPageOrientation {
  return orientation === 'landscape' ? 'landscape' : 'portrait';
}

export function getTranslatedPageSafeArea(
  orientation: TranslatedPageOrientationInput,
): TranslatedPageSafeArea {
  const normalized = normalizeTranslatedPageOrientation(orientation);
  const base = TRANSLATED_PAGE_SAFE_AREA_BY_ORIENTATION[normalized];
  return {
    orientation: normalized,
    ...base,
  };
}

export function buildTranslatedSafeAreaPageCss(
  orientation: TranslatedPageOrientationInput,
): string {
  const safeArea = getTranslatedPageSafeArea(orientation);
  const pageSize =
    safeArea.orientation === 'landscape'
      ? 'letter landscape'
      : 'letter portrait';

  return `@page {
  size: ${pageSize};
  margin-top: ${safeArea.marginTopIn}in;
  margin-right: ${safeArea.marginRightIn}in;
  margin-bottom: ${safeArea.marginBottomIn}in;
  margin-left: ${safeArea.marginLeftIn}in;
}`;
}

export function buildTranslatedGotenbergSettings(
  orientation: TranslatedPageOrientationInput,
  options: { scale?: string } = {},
): Record<string, string> {
  const safeArea = getTranslatedPageSafeArea(orientation);
  const settings: Record<string, string> = {
    paperWidth: safeArea.paperWidthIn,
    paperHeight: safeArea.paperHeightIn,
    marginTop: safeArea.marginTopIn,
    marginBottom: safeArea.marginBottomIn,
    marginLeft: safeArea.marginLeftIn,
    marginRight: safeArea.marginRightIn,
    printBackground: 'true',
    preferCssPageSize: 'false',
    skipNetworkIdleEvent: 'true',
  };

  if (options.scale) {
    settings.scale = options.scale;
  }

  return settings;
}

export function injectTranslatedPageSafeArea(
  html: string,
  orientation: TranslatedPageOrientationInput,
): string {
  if (!html || html.includes(`id="${SAFE_AREA_STYLE_ID}"`)) {
    return html;
  }

  const styleTag = `<style id="${SAFE_AREA_STYLE_ID}">
${buildTranslatedSafeAreaPageCss(orientation)}
html, body { margin: 0; padding: 0; }
</style>`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${styleTag}\n</head>`);
  }

  if (/<html\b[^>]*>/i.test(html)) {
    if (/<body\b[^>]*>/i.test(html)) {
      return html.replace(
        /<body\b[^>]*>/i,
        `<head>\n${styleTag}\n</head>\n$&`,
      );
    }

    return html.replace(
      /<html\b[^>]*>/i,
      `$&\n<head>\n${styleTag}\n</head>`,
    );
  }

  if (/<body\b[^>]*>/i.test(html)) {
    return html.replace(
      /<body\b[^>]*>/i,
      `${styleTag}\n$&`,
    );
  }

  return `<!DOCTYPE html>
<html>
<head>
${styleTag}
</head>
<body>
${html}
</body>
</html>`;
}
