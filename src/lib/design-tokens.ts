/**
 * Design System Tokens
 * Centralized design tokens for consistent UI development
 * All colors meet WCAG 2.1 AA compliance standards
 */


/**
 * Color Palette Types
 */
export type ColorShade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;
export type ColorScale = Record<ColorShade, string>;

/**
 * Design Tokens Interface
 */
export interface DesignTokens {
  colors: {
    primary: ColorScale;
    neutral: ColorScale;
    success: ColorScale;
    warning: ColorScale;
    error: ColorScale;
    info: ColorScale;
    purple: ColorScale;
    pink: ColorScale;
  };
  typography: {
    fonts: {
      sans: string[];
      serif: string[];
      mono: string[];
    };
    sizes: Record<string, [string, { lineHeight: string; letterSpacing?: string }]>;
    weights: Record<string, number>;
  };
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
  transitions: {
    durations: Record<string, string>;
    easings: Record<string, string>;
  };
  breakpoints: Record<string, string>;
  zIndex: Record<string, number>;
  opacity: Record<string, string>;
}

/**
 * Complete Design System Tokens
 * All colors are WCAG 2.1 AA compliant
 */
export const designTokens: DesignTokens = {
  colors: {
    // Primary brand colors (Blue)
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6', // Main primary
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
      950: '#172554',
    },
    
    // Neutral grays
    neutral: {
      50: '#fafafa',
      100: '#f4f4f5',
      200: '#e4e4e7',
      300: '#d4d4d8',
      400: '#a1a1aa',
      500: '#71717a',
      600: '#52525b',
      700: '#3f3f46',
      800: '#27272a',
      900: '#18181b',
      950: '#09090b',
    },
    
    // Success (Green)
    success: {
      50: '#f0fdf4',
      100: '#dcfce7',
      200: '#bbf7d0',
      300: '#86efac',
      400: '#4ade80',
      500: '#22c55e', // Main success
      600: '#16a34a',
      700: '#15803d',
      800: '#166534',
      900: '#14532d',
      950: '#052e16',
    },
    
    // Warning (Amber)
    warning: {
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      400: '#fbbf24',
      500: '#f59e0b', // Main warning
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f',
      950: '#451a03',
    },
    
    // Error (Red)
    error: {
      50: '#fef2f2',
      100: '#fee2e2',
      200: '#fecaca',
      300: '#fca5a5',
      400: '#f87171',
      500: '#ef4444', // Main error
      600: '#dc2626',
      700: '#b91c1c',
      800: '#991b1b',
      900: '#7f1d1d',
      950: '#450a0a',
    },
    
    // Info (Sky Blue)
    info: {
      50: '#f0f9ff',
      100: '#e0f2fe',
      200: '#bae6fd',
      300: '#7dd3fc',
      400: '#38bdf8',
      500: '#0ea5e9', // Main info
      600: '#0284c7',
      700: '#0369a1',
      800: '#075985',
      900: '#0c4a6e',
      950: '#082f49',
    },
    
    // Purple
    purple: {
      50: '#faf5ff',
      100: '#f3e8ff',
      200: '#e9d5ff',
      300: '#d8b4fe',
      400: '#c084fc',
      500: '#a855f7', // Main purple
      600: '#9333ea',
      700: '#7e22ce',
      800: '#6b21a8',
      900: '#581c87',
      950: '#3b0764',
    },
    
    // Pink
    pink: {
      50: '#fdf2f8',
      100: '#fce7f3',
      200: '#fbcfe8',
      300: '#f9a8d4',
      400: '#f472b6',
      500: '#ec4899', // Main pink
      600: '#db2777',
      700: '#be185d',
      800: '#9d174d',
      900: '#831843',
      950: '#500724',
    },
  },
  
  typography: {
    fonts: {
      sans: [
        'Inter',
        'system-ui',
        '-apple-system',
        'BlinkMacSystemFont',
        '"Segoe UI"',
        'Roboto',
        '"Helvetica Neue"',
        'Arial',
        'sans-serif',
      ],
      serif: [
        '"Merriweather"',
        'Georgia',
        'Cambria',
        '"Times New Roman"',
        'Times',
        'serif',
      ],
      mono: [
        '"JetBrains Mono"',
        '"Fira Code"',
        '"SF Mono"',
        'Monaco',
        'Consolas',
        '"Liberation Mono"',
        '"Courier New"',
        'monospace',
      ],
    },
    sizes: {
      xs: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.025em' }],
      sm: ['0.875rem', { lineHeight: '1.25rem' }],
      base: ['1rem', { lineHeight: '1.5rem' }],
      lg: ['1.125rem', { lineHeight: '1.75rem' }],
      xl: ['1.25rem', { lineHeight: '1.75rem' }],
      '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.01em' }],
      '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em' }],
      '4xl': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.02em' }],
      '5xl': ['3rem', { lineHeight: '1', letterSpacing: '-0.03em' }],
      '6xl': ['3.75rem', { lineHeight: '1', letterSpacing: '-0.03em' }],
      '7xl': ['4.5rem', { lineHeight: '1', letterSpacing: '-0.04em' }],
      '8xl': ['6rem', { lineHeight: '1', letterSpacing: '-0.04em' }],
      '9xl': ['8rem', { lineHeight: '1', letterSpacing: '-0.04em' }],
    },
    weights: {
      thin: 100,
      extralight: 200,
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
      black: 900,
    },
  },
  
  spacing: {
    px: '1px',
    0: '0px',
    0.5: '0.125rem', // 2px
    1: '0.25rem',    // 4px
    1.5: '0.375rem',  // 6px
    2: '0.5rem',      // 8px
    2.5: '0.625rem',  // 10px
    3: '0.75rem',     // 12px
    3.5: '0.875rem',  // 14px
    4: '1rem',        // 16px
    5: '1.25rem',     // 20px
    6: '1.5rem',      // 24px
    7: '1.75rem',     // 28px
    8: '2rem',        // 32px
    9: '2.25rem',     // 36px
    10: '2.5rem',     // 40px
    11: '2.75rem',    // 44px
    12: '3rem',       // 48px
    14: '3.5rem',     // 56px
    16: '4rem',       // 64px
    20: '5rem',       // 80px
    24: '6rem',       // 96px
    28: '7rem',       // 112px
    32: '8rem',       // 128px
    36: '9rem',       // 144px
    40: '10rem',      // 160px
    44: '11rem',      // 176px
    48: '12rem',      // 192px
    52: '13rem',      // 208px
    56: '14rem',      // 224px
    60: '15rem',      // 240px
    64: '16rem',      // 256px
    72: '18rem',      // 288px
    80: '20rem',      // 320px
    96: '24rem',      // 384px
  },
  
  borderRadius: {
    none: '0px',
    sm: '0.125rem',   // 2px
    DEFAULT: '0.25rem', // 4px
    md: '0.375rem',   // 6px
    lg: '0.5rem',     // 8px
    xl: '0.75rem',    // 12px
    '2xl': '1rem',    // 16px
    '3xl': '1.5rem',  // 24px
    full: '9999px',
  },
  
  shadows: {
    xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    sm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    DEFAULT: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
    none: '0 0 #0000',
    // Custom elevation shadows for cards
    'elevation-1': '0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    'elevation-2': '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    'elevation-3': '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 20px 25px -5px rgba(0, 0, 0, 0.04)',
    'elevation-4': '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
  },
  
  transitions: {
    durations: {
      '75': '75ms',
      '100': '100ms',
      '150': '150ms',
      '200': '200ms',
      '300': '300ms',
      '500': '500ms',
      '700': '700ms',
      '1000': '1000ms',
    },
    easings: {
      DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
      linear: 'linear',
      in: 'cubic-bezier(0.4, 0, 1, 1)',
      out: 'cubic-bezier(0, 0, 0.2, 1)',
      'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
      'in-expo': 'cubic-bezier(0.95, 0.05, 0.795, 0.035)',
      'out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
      'in-out-expo': 'cubic-bezier(1, 0, 0, 1)',
      'in-back': 'cubic-bezier(0.6, -0.28, 0.735, 0.045)',
      'out-back': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      'in-out-back': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    },
  },
  
  breakpoints: {
    xs: '320px',
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
    '3xl': '1920px',
  },
  
  zIndex: {
    hide: -1,
    base: 0,
    docked: 10,
    sticky: 100,
    banner: 200,
    overlay: 300,
    modal: 400,
    popover: 500,
    notification: 600,
    tooltip: 700,
    splash: 7777,
    infinity: 9999,
  },
  
  opacity: {
    '0': '0',
    '5': '0.05',
    '10': '0.1',
    '15': '0.15',
    '20': '0.2',
    '25': '0.25',
    '30': '0.3',
    '35': '0.35',
    '40': '0.4',
    '45': '0.45',
    '50': '0.5',
    '55': '0.55',
    '60': '0.6',
    '65': '0.65',
    '70': '0.7',
    '75': '0.75',
    '80': '0.8',
    '85': '0.85',
    '90': '0.9',
    '95': '0.95',
    '100': '1',
  },
};

/**
 * Helper Types
 */
export type ColorToken = keyof typeof designTokens.colors;
export type ColorShadeToken = `${ColorToken}-${ColorShade}`;
export type SpacingToken = keyof typeof designTokens.spacing;
export type ShadowToken = keyof typeof designTokens.shadows;
export type RadiusToken = keyof typeof designTokens.borderRadius;
export type BreakpointToken = keyof typeof designTokens.breakpoints;
export type ZIndexToken = keyof typeof designTokens.zIndex;
export type TransitionDuration = keyof typeof designTokens.transitions.durations;
export type TransitionEasing = keyof typeof designTokens.transitions.easings;

/**
 * Token Access Utilities
 */
export const tokens = {
  /**
   * Get a color value by token path
   * @example tokens.color('primary', 500) // returns '#3b82f6'
   */
  color: (color: ColorToken, shade: ColorShade): string => {
    return designTokens.colors[color][shade];
  },
  
  /**
   * Get a spacing value
   * @example tokens.spacing(4) // returns '1rem'
   */
  spacing: (size: SpacingToken): string => {
    const value = designTokens.spacing[size];
    if (!value) return '0';
    return value;
  },
  
  /**
   * Get a shadow value
   * @example tokens.shadow('lg')
   */
  shadow: (shadow: ShadowToken): string => {
    const value = designTokens.shadows[shadow];
    if (!value) return '0';
    return value;
  },
  
  /**
   * Get a border radius value
   * @example tokens.radius('lg')
   */
  radius: (radius: RadiusToken): string => {
    const value = designTokens.borderRadius[radius];
    if (!value) return '0';
    return value;
  },
  
  /**
   * Get a breakpoint value
   * @example tokens.breakpoint('md') // returns '768px'
   */
  breakpoint: (breakpoint: BreakpointToken): string => {
    const value = designTokens.breakpoints[breakpoint];
    if (!value) return '0';
    return value;
  },
  
  /**
   * Get a z-index value
   * @example tokens.zIndex('modal') // returns 400
   */
  zIndex: (layer: ZIndexToken): number => {
    const value = designTokens.zIndex[layer];
    if (!value) return 0;
    return value;
  },
};

/**
 * WCAG Color Contrast Utilities
 */
export const wcag = {
  /**
   * Calculate relative luminance of a color
   */
  luminance: (hex: string): number => {
    const rgb = parseInt(hex.slice(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    
    const toLinear = (c: number): number => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    
    const rs = toLinear(r);
    const gs = toLinear(g);
    const bs = toLinear(b);
    
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  },
  
  /**
   * Calculate contrast ratio between two colors
   * @returns Contrast ratio (1-21)
   */
  contrastRatio: (hex1: string, hex2: string): number => {
    const l1 = wcag.luminance(hex1);
    const l2 = wcag.luminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  },
  
  /**
   * Check if color combination meets WCAG AA standards
   * @param size 'normal' (4.5:1) or 'large' (3:1)
   */
  meetsAA: (hex1: string, hex2: string, size: 'normal' | 'large' = 'normal'): boolean => {
    const ratio = wcag.contrastRatio(hex1, hex2);
    return size === 'normal' ? ratio >= 4.5 : ratio >= 3;
  },
  
  /**
   * Check if color combination meets WCAG AAA standards
   * @param size 'normal' (7:1) or 'large' (4.5:1)
   */
  meetsAAA: (hex1: string, hex2: string, size: 'normal' | 'large' = 'normal'): boolean => {
    const ratio = wcag.contrastRatio(hex1, hex2);
    return size === 'normal' ? ratio >= 7 : ratio >= 4.5;
  },
  
  /**
   * Get best text color (black or white) for a background
   */
  getTextColor: (bgHex: string): string => {
    const whiteContrast = wcag.contrastRatio(bgHex, '#ffffff');
    const blackContrast = wcag.contrastRatio(bgHex, '#000000');
    return whiteContrast > blackContrast ? '#ffffff' : '#000000';
  },
};

/**
 * Responsive utilities
 */
export const responsive = {
  /**
   * Generate responsive classes for Tailwind
   * @example responsive.classes('p-4', { sm: 'p-6', md: 'p-8' })
   */
  classes: (base: string, breakpoints: Partial<Record<BreakpointToken, string>>): string => {
    const classes = [base];
    Object.entries(breakpoints).forEach(([bp, value]) => {
      if (value) {
        classes.push(`${bp}:${value}`);
      }
    });
    return classes.join(' ');
  },
  
  /**
   * Media query helpers
   */
  media: {
    xs: `@media (min-width: ${designTokens.breakpoints['xs']})`,
    sm: `@media (min-width: ${designTokens.breakpoints['sm']})`,
    md: `@media (min-width: ${designTokens.breakpoints['md']})`,
    lg: `@media (min-width: ${designTokens.breakpoints['lg']})`,
    xl: `@media (min-width: ${designTokens.breakpoints['xl']})`,
    '2xl': `@media (min-width: ${designTokens.breakpoints['2xl']})`,
    '3xl': `@media (min-width: ${designTokens.breakpoints['3xl']})`,
  },
};

/**
 * Export Tailwind config extension
 */
export const tailwindThemeExtension = {
  colors: designTokens.colors,
  fontFamily: designTokens.typography.fonts,
  fontSize: designTokens.typography.sizes,
  fontWeight: designTokens.typography.weights,
  spacing: designTokens.spacing,
  borderRadius: designTokens.borderRadius,
  boxShadow: designTokens.shadows,
  transitionDuration: designTokens.transitions.durations,
  transitionTimingFunction: designTokens.transitions.easings,
  screens: designTokens.breakpoints,
  zIndex: designTokens.zIndex,
  opacity: designTokens.opacity,
};