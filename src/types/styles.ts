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
  size: string; // rem
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
  '1': '0.25rem'; // 4px
  '2': '0.5rem'; // 8px
  '3': '0.75rem'; // 12px
  '4': '1rem'; // 16px
  '6': '1.5rem'; // 24px
  '8': '2rem'; // 32px
  '9': '2.25rem'; // 36px
  '12': '3rem'; // 48px
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
  hoverRow: Hex; // Slate-50
  selectedRow: Hex; // Blue-50
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
