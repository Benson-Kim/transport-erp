/* eslint-disable @typescript-eslint/consistent-type-definitions */
/**
 * Design Tokens (single source of truth)
 * - Strictly typed
 * - WCAG AA compliant combinations (documented below)
 * - Mobile-first
 */

export type Hex = `#${string}`;

/** Font families */
export interface FontFamilies {
  sans: string;
  mono: string;
}

/** Font weights used in the system */
export interface FontWeights {
  regular: 400;
  medium: 500;
  semibold: 600;
}

/** Font size + line-height pairing */
export interface TypePair {
  size: string;      // rem
  lineHeight: string; // rem
  letterSpacing?: string;
  weight?: keyof FontWeights;
}

/** Typography scale */
export interface TypographyScale {
  h1: TypePair;
  h2: TypePair;
  h3: TypePair;
  body: TypePair;
  small: TypePair;
  xsmall: TypePair;
  tableHeader: TypePair;
  tableCell: TypePair;
  formLabel: TypePair;
  formHelper: TypePair;
  buttonText: TypePair;
  badgeText: TypePair;
  amount: TypePair;
  amountLarge: TypePair;
  serviceNumber: TypePair;
  vatNumber: TypePair;
}

/** Spacing scale in 4px increments (rem-based) */
export interface SpacingScale {
  '0': '0rem';
  '1': '0.25rem';  // 4px
  '2': '0.5rem';   // 8px
  '3': '0.75rem';  // 12px
  '4': '1rem';     // 16px
  '6': '1.5rem';   // 24px
  '8': '2rem';     // 32px
  '12': '3rem';    // 48px
}

/** Border radius scale */
export interface RadiusScale {
  none: '0px';
  sm: '4px';
  md: '6px';
  lg: '8px';
  xl: '12px';
  full: '9999px';
}

/** Shadow scale */
export interface ShadowScale {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  card: string;
  modal: string;
}

/** Transition durations */
export interface TransitionDurations {
  fast: '100ms';
  normal: '150ms';
  slow: '200ms';
  slower: '300ms';
}

/** Breakpoints */
export interface Breakpoints {
  mobile: '0px';
  tablet: '768px';
  desktop: '1280px';
  wide: '1920px';
}

/** Color categories */
export interface NeutralColors {
  white: Hex;
  50: Hex;
  100: Hex;
  200: Hex;
  300: Hex;
  400: Hex;
  500: Hex;
  600: Hex;
  700: Hex;
  900: Hex;
}

export interface PrimaryColors {
  DEFAULT: Hex;
  hover: Hex;
  pressed: Hex;
  disabled: Hex;
}

export interface SecondaryColors {
  DEFAULT: Hex;
  hover: Hex;
  border: Hex;
}

export interface DangerColors {
  DEFAULT: Hex;
  hover: Hex;
  pressed: Hex;
}

export interface StatusSwatch {
  bg: Hex;
  text: Hex;
  border: Hex;
}

export interface StatusColors {
  active: StatusSwatch;
  completed: StatusSwatch;
  cancelled: StatusSwatch;
  billed: StatusSwatch;
}

export interface FeedbackSwatch {
  bg: Hex;
  border: Hex;
  text: Hex;
}

export interface FeedbackColors {
  success: FeedbackSwatch;
  error: FeedbackSwatch;
  warning: FeedbackSwatch;
  info: FeedbackSwatch;
}

export interface FinancialColors {
  positive: Hex;
  negative: Hex;
  neutral: Hex;
}

export interface SupportSurfaces {
  hoverRow: Hex;     // Slate-50
  selectedRow: Hex;  // Blue-50
  cancelledRow: Hex; // Red-50
  navActiveText: Hex; // Blue-900
}

/** Color palette */
export interface ColorPalette {
  neutral: NeutralColors;
  primary: PrimaryColors;
  secondary: SecondaryColors;
  danger: DangerColors;
  status: StatusColors;
  feedback: FeedbackColors;
  financial: FinancialColors;
  support: SupportSurfaces;
}

/** Root design tokens type */
export interface DesignTokens {
  colors: ColorPalette;
  spacing: SpacingScale;
  radii: RadiusScale;
  shadows: ShadowScale;
  transitions: TransitionDurations;
  breakpoints: Breakpoints;
  fonts: FontFamilies;
  weights: FontWeights;
  typography: TypographyScale;
}

export const designTokens: DesignTokens = {
  colors: {
    neutral: {
      white: '#FFFFFF',
      50: '#F8FAFC',
      100: '#F1F5F9',
      200: '#E2E8F0',
      300: '#CBD5E1',
      400: '#94A3B8',
      500: '#64748B',
      600: '#475569',
      700: '#334155',
      900: '#0F172A',
    },
    primary: {
      DEFAULT: '#2563EB',
      hover: '#1D4ED8',
      pressed: '#1E40AF',
      disabled: '#93C5FD',
    },
    secondary: {
      DEFAULT: '#FFFFFF',
      hover: '#F8FAFC',
      border: '#CBD5E1',
    },
    danger: {
      DEFAULT: '#DC2626',
      hover: '#B91C1C',
      pressed: '#991B1B',
    },
    status: {
      active: {
        bg: '#DBEAFE',
        text: '#1E40AF',
        border: '#3B82F6',
      },
      completed: {
        bg: '#D1FAE5',
        text: '#065F46',
        border: '#10B981',
      },
      cancelled: {
        bg: '#FEE2E2',
        text: '#991B1B',
        border: '#EF4444',
      },
      billed: {
        bg: '#E9D5FF',
        text: '#6B21A8',
        border: '#8B5CF6',
      },
    },
    feedback: {
      success: {
        bg: '#DCFCE7',
        border: '#86EFAC',
        text: '#166534',
      },
      error: {
        bg: '#FEE2E2',
        border: '#FCA5A5',
        text: '#991B1B',
      },
      warning: {
        bg: '#FEF3C7',
        border: '#FCD34D',
        text: '#92400E',
      },
      info: {
        bg: '#DBEAFE',
        border: '#93C5FD',
        text: '#1E40AF',
      },
    },
    financial: {
      positive: '#059669',
      negative: '#DC2626',
      neutral: '#0F172A',
    },
    support: {
      hoverRow: '#F8FAFC',
      selectedRow: '#EFF6FF',
      cancelledRow: '#FEF2F2',
      navActiveText: '#1E3A8A',
    },
  },
  spacing: {
    '0': '0rem',
    '1': '0.25rem',
    '2': '0.5rem',
    '3': '0.75rem',
    '4': '1rem',
    '6': '1.5rem',
    '8': '2rem',
    '12': '3rem',
  },
  radii: {
    none: '0px',
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 2px 0 rgba(0,0,0,0.05)',
    md: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
    lg: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
    xl: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
    card: '0 1px 3px rgba(0,0,0,0.1)',
    modal:
      '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
  },
  transitions: {
    fast: '100ms',
    normal: '150ms',
    slow: '200ms',
    slower: '300ms',
  },
  breakpoints: {
    mobile: '0px',
    tablet: '768px',
    desktop: '1280px',
    wide: '1920px',
  },
  fonts: {
    sans:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif",
    mono:
      "'SF Mono','Consolas','Monaco','Liberation Mono',monospace",
  },
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
  },
  typography: {
    h1: { size: '1.5rem', lineHeight: '2rem', letterSpacing: '-0.01em', weight: 'semibold' },
    h2: { size: '1.125rem', lineHeight: '1.75rem', letterSpacing: '-0.005em', weight: 'semibold' },
    h3: { size: '1rem', lineHeight: '1.5rem', weight: 'semibold' },
    body: { size: '0.875rem', lineHeight: '1.25rem', weight: 'regular' },
    small: { size: '0.75rem', lineHeight: '1rem', weight: 'regular' },
    xsmall: { size: '0.6875rem', lineHeight: '0.875rem', weight: 'regular' },
    tableHeader: { size: '0.75rem', lineHeight: '1rem', weight: 'semibold', letterSpacing: '0.05em' },
    tableCell: { size: '0.875rem', lineHeight: '1.25rem', weight: 'regular' },
    formLabel: { size: '0.875rem', lineHeight: '1.25rem', weight: 'medium' },
    formHelper: { size: '0.75rem', lineHeight: '1rem', weight: 'regular' },
    buttonText: { size: '0.875rem', lineHeight: '1.25rem', weight: 'medium', letterSpacing: '0.01em' },
    badgeText: { size: '0.6875rem', lineHeight: '0.875rem', weight: 'semibold', letterSpacing: '0.05em' },
    amount: { size: '0.875rem', lineHeight: '1.25rem', weight: 'medium' },
    amountLarge: { size: '1.25rem', lineHeight: '1.75rem', weight: 'semibold' },
    serviceNumber: { size: '0.875rem', lineHeight: '1.25rem', weight: 'semibold', letterSpacing: '0.025em' },
    vatNumber: { size: '0.8125rem', lineHeight: '1.125rem', weight: 'regular', letterSpacing: '0.025em' },
  },
} as const;

/* ---------------------------------- */
/* Typed token access helpers         */
/* ---------------------------------- */

type Primitive = string | number | boolean | null | undefined;

/** Dot-notation path for nested object */
type DotPrefix<S extends string> = S extends '' ? '' : `.${S}`;

/** Produce all possible dot paths for object T */
export type TokenPath<T> = T extends Primitive
  ? ''
  : {
      [K in Extract<keyof T, string>]: `${K}${DotPrefix<TokenPath<T[K]>>}`;
    }[Extract<keyof T, string>];

/** Resolve the value at dot path P within object T */
export type PathValue<T, P extends string> =
  P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
      ? PathValue<T[K], Rest>
      : never
    : P extends keyof T
      ? T[P]
      : never;

/**
 * Deeply get a value by a dot-path with runtime checks.
 * Throws an Error if the path is invalid at runtime.
 */
export function getToken<P extends TokenPath<DesignTokens>>(
  path: P,
): PathValue<DesignTokens, P> {
  const segments = (path as string).split('.');
  let current: unknown = designTokens as unknown;

  for (const seg of segments) {
    if (!seg) continue;
    if (typeof current !== 'object' || current === null) {
      throw new Error(`Invalid token path: ${path}`);
    }
    current = (current as Record<string, unknown>)[seg];
    if (typeof current === 'undefined') {
      throw new Error(`Token not found: ${path}`);
    }
  }
  return current as PathValue<DesignTokens, P>;
}

/** Convenience getters with better autocompletion */
export type BreakpointName = keyof DesignTokens['breakpoints'];
export function getBreakpoint(name: BreakpointName): string {
  return designTokens.breakpoints[name];
}

export type StatusName = keyof DesignTokens['colors']['status'];
export function getStatus(name: StatusName): StatusSwatch {
  return designTokens.colors.status[name];
}

export type PrimaryVariant = keyof DesignTokens['colors']['primary'];
export function getPrimary(variant: PrimaryVariant): Hex {
  return designTokens.colors.primary[variant];
}

/** Numeric helpers */
function parsePx(value: string): number {
  return Number(String(value).replace('px', ''));
}
function toPx(value: number): string {
  return `${value}px`;
}

/* ---------------------------------- */
/* Responsive helpers                 */
/* ---------------------------------- */

/**
 * Media query helpers. Subtracts 0.02px on max-width to avoid overlap.
 */
export const media = {
  up: (bp: BreakpointName): string => {
    const min = getBreakpoint(bp);
    return `@media (min-width: ${min})`;
  },
  down: (bp: BreakpointName): string => {
    const maxVal = Math.max(parsePx(getBreakpoint(bp)) - 0.02, 0);
    return `@media (max-width: ${toPx(maxVal)})`;
  },
  between: (minBp: BreakpointName, maxBp: BreakpointName): string => {
    const min = parsePx(getBreakpoint(minBp));
    const max = parsePx(getBreakpoint(maxBp)) - 0.02;
    return `@media (min-width: ${toPx(min)}) and (max-width: ${toPx(max)})`;
  },
  only: (bp: BreakpointName): string => {
    const keys = Object.keys(designTokens.breakpoints) as BreakpointName[];
    const sorted = keys.sort(
      (a, b) =>
        parsePx(designTokens.breakpoints[a]) -
        parsePx(designTokens.breakpoints[b]),
    );
    const index = sorted.indexOf(bp);
    const min = parsePx(getBreakpoint(bp));
    const next = sorted[index + 1];
    if (!next) {
      return `@media (min-width: ${toPx(min)})`;
    }
    const max = parsePx(getBreakpoint(next)) - 0.02;
    return `@media (min-width: ${toPx(min)}) and (max-width: ${toPx(max)})`;
  },
} as const;

/* ---------------------------------- */
/* Spacing/typography convenience     */
/* ---------------------------------- */

export type SpacingKey = keyof DesignTokens['spacing'];
export function space(key: SpacingKey): string {
  return designTokens.spacing[key];
}

export function fontSans(): string {
  return designTokens.fonts.sans;
}
export function fontMono(): string {
  return designTokens.fonts.mono;
}

/* ---------------------------------- */
/* WCAG Reference (documenting intent) */
/* ---------------------------------- */
/**
 * Verified AA or AAA (normal text) combinations:
 * - Slate-900 on White
 * - Slate-700 on White
 * - Slate-600 on White
 * - Blue-600 on White (links)
 * - White on Blue-600 (buttons)
 * - Blue-800 on Blue-100 (status)
 * - Green-800 on Green-100 (status)
 * - Red-800 on Red-100 (status)
 */