/**
 * Centralized feature flags for Promobidocs.
 * All flags default to false/disabled unless explicitly set via environment variables.
 */
export const FEATURE_FLAGS = {
  /**
   * When true, enables the parallel structured pipeline for supported families.
   * The legacy translation response remains the user-facing output; structured
   * artifacts run in parallel for preview/rendering workflows.
   * Default: false (legacy pipeline only).
   */
  USE_STRUCTURED_TRANSLATION: process.env.USE_STRUCTURED_TRANSLATION === 'true',

  /**
   * When true, the structured pipeline saves a preview HTML (and optional PDF)
   * of the structured certificate to Supabase Storage for internal inspection.
   * Saved under orders/previews/ — never written to the database, never exposed
   * to the client. Has zero effect when false (default).
   * Requires USE_STRUCTURED_TRANSLATION=true to have any effect.
   */
  ENABLE_STRUCTURED_PREVIEW: process.env.ENABLE_STRUCTURED_PREVIEW === 'true',

  /**
   * When true, the structured pipeline assembles a 3-part preview kit PDF:
   *   Part 1: Certification cover page (portrait)
   *   Part 2: Translated document (structured HTML + letterhead, orientation-aware)
   *   Part 3: Original source document (appended as-is if PDF)
   * Saved under orders/previews/ — never written to the database, never exposed
   * to the client. Has zero effect when false (default).
   * Requires USE_STRUCTURED_TRANSLATION=true to have any effect.
   * Supported document families: all supported structured families registered in
   * services/structuredDocumentRenderer.ts.
   */
  ENABLE_STRUCTURED_PREVIEW_KIT: process.env.ENABLE_STRUCTURED_PREVIEW_KIT === 'true',
} as const;
