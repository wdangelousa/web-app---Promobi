/**
 * Global UI layering strategy.
 *
 * 0-49   : base content
 * 50-99  : sticky headers/toolbars
 * 1000+  : modal overlays/content
 * 1100+  : toasts/alerts
 */
export const UI_Z_INDEX = {
  baseContent: 1,
  stickyToolbar: 60,
  modalOverlay: 1000,
  modalContent: 1010,
  toast: 1100,
} as const;

