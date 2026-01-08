import { designTokens } from '@/lib/design-tokens';

import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './actions/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './styles/**/*.{css}',
  ],
  theme: {
    extend: {
      colors: {
        /* Neutrals */
        neutral: {
          50: designTokens.colors.neutral[50],
          100: designTokens.colors.neutral[100],
          200: designTokens.colors.neutral[200],
          300: designTokens.colors.neutral[300],
          400: designTokens.colors.neutral[400],
          500: designTokens.colors.neutral[500],
          600: designTokens.colors.neutral[600],
          700: designTokens.colors.neutral[700],
          900: designTokens.colors.neutral[900],
        },
        primary: {
          DEFAULT: designTokens.colors.primary.DEFAULT,
          hover: designTokens.colors.primary.hover,
          pressed: designTokens.colors.primary.pressed,
          disabled: designTokens.colors.primary.disabled,
        },
        secondary: {
          DEFAULT: designTokens.colors.secondary.DEFAULT,
          hover: designTokens.colors.secondary.hover,
          border: designTokens.colors.secondary.border,
        },
        danger: {
          DEFAULT: designTokens.colors.danger.DEFAULT,
          hover: designTokens.colors.danger.hover,
          pressed: designTokens.colors.danger.pressed,
        },
        status: {
          active: {
            DEFAULT: designTokens.colors.status.active.border,
            bg: designTokens.colors.status.active.bg,
            text: designTokens.colors.status.active.text,
          },
          completed: {
            DEFAULT: designTokens.colors.status.completed.border,
            bg: designTokens.colors.status.completed.bg,
            text: designTokens.colors.status.completed.text,
          },
          cancelled: {
            DEFAULT: designTokens.colors.status.cancelled.border,
            bg: designTokens.colors.status.cancelled.bg,
            text: designTokens.colors.status.cancelled.text,
          },
          billed: {
            DEFAULT: designTokens.colors.status.billed.border,
            bg: designTokens.colors.status.billed.bg,
            text: designTokens.colors.status.billed.text,
          },
        },
        feedback: {
          success: {
            bg: designTokens.colors.feedback.success.bg,
            border: designTokens.colors.feedback.success.border,
            text: designTokens.colors.feedback.success.text,
          },
          error: {
            bg: designTokens.colors.feedback.error.bg,
            border: designTokens.colors.feedback.error.border,
            text: designTokens.colors.feedback.error.text,
          },
          warning: {
            bg: designTokens.colors.feedback.warning.bg,
            border: designTokens.colors.feedback.warning.border,
            text: designTokens.colors.feedback.warning.text,
          },
          info: {
            bg: designTokens.colors.feedback.info.bg,
            border: designTokens.colors.feedback.info.border,
            text: designTokens.colors.feedback.info.text,
          },
        },
        financial: {
          positive: designTokens.colors.financial.positive,
          negative: designTokens.colors.financial.negative,
          neutral: designTokens.colors.financial.neutral,
        },
        support: {
          rowHover: designTokens.colors.support.hoverRow,
          rowSelected: designTokens.colors.support.selectedRow,
          rowCancelled: designTokens.colors.support.cancelledRow,
          navActiveText: designTokens.colors.support.navActiveText,
        },
        white: designTokens.colors.neutral.white,
      },
      fontFamily: {
        ...Object.fromEntries(Object.entries(designTokens.fonts).map(([k, v]) => [k, v])),
      },
      spacing: {
        ...Object.fromEntries(Object.entries(designTokens.spacing).map(([k, v]) => [k, v])),
      },
      borderRadius: {
        ...Object.fromEntries(Object.entries(designTokens.radii).map(([k, v]) => [k, v])),
      },
      boxShadow: {
        ...Object.fromEntries(Object.entries(designTokens.shadows).map(([k, v]) => [k, v])),
      },
      width: {
        'icon-sm': '1.25rem', //20px
        'icon-md': '1.5rem', //24px
        'sidebar-desktop': 'var(--sidebar-desktop)',
        'sidebar-tablet': 'var(--sidebar-tablet)',
        'sidebar-collapsed': 'var(--sidebar-collapsed)',
      },
      height: {
        'icon-sm': '1.25rem', //20px
        'icon-md': '1.5rem', //24px
        header: 'var(--header-height)',
        logo: 'var(--logo-size)',
        avatar: 'var(--avatar-size)',
      },
      transitionDuration: {
        100: '100ms',
        150: '150ms',
        200: '200ms',
        300: '300ms',
      },
      keyframes: {
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        spin: 'spin 1s linear infinite',
      },
      container: {
        center: true,
        padding: {
          DEFAULT: '1rem',
          md: '1.25rem',
          xl: '1.5rem',
        },
      },
    },
    screens: {
      /* Keep Tailwind defaults for compatibility, plus "wide" */
      sm: '640px',
      md: designTokens.breakpoints.tablet, // 768px
      lg: '1024px',
      xl: designTokens.breakpoints.desktop, // 1280px
      '2xl': '1536px',
      wide: designTokens.breakpoints.wide, // 1920px
    },
  },
  plugins: [],
};
export default config;
