/**
 * The browser's own chrome — the address bar on mobile — is painted by the user
 * agent before any stylesheet runs, so `theme-color` cannot reference a CSS
 * variable. These two values are the only place in the codebase where a colour
 * is written as a literal outside `globals.css`.
 *
 * They mirror `--canvas` in each theme. Change one, change the other.
 */
export const THEME_COLOR = {
  light: '#FCFCFA',
  dark: '#161513',
} as const;
