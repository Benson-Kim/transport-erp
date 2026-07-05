# ADR 0007: Theme and token system

Status: Accepted (2026-07-05, Phase 7, #51)

## Decision

- `src/styles/globals.css` `:root` is the single source of design-token
  VALUES (colors, spacing, radii, shadows, layout dimensions).
- The `@theme inline` block registers the token FAMILIES with Tailwind v4
  by referencing those `:root` variables - never duplicating values:
  primary(+scale)/danger/success, foreground/muted-foreground/background,
  feedback-*-{bg,border,text}, status-*, financial-*, support-*.
  Tailwind only generates utilities for registered tokens; unregistered
  "token classes" silently compile to nothing (the #51 root cause).
- The `@layer components` classes (.button/.badge/.card/.input/.table,
  nav-item, amount, skeleton) are the shared component skins - they
  resolve and stay.
- Core Tailwind utilities are NEVER redefined (.text-sm/.text-xs/.gap-8
  were removed for hijacking core classes).
- No dynamic class construction (`bg-${x}-50`): the scanner cannot see
  template literals - use static lookup maps (#56).
- Dark mode: next-themes with attribute="class" (root layout, #58);
  `dark:` variants are real from that point on.

## Consequences

New tokens = add the `:root` value AND its `@theme inline` alias in the
same change. tests are visual/axe-level (#59 e2e pass).
