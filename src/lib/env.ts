/**
 * Server environment access (#58).
 *
 * Moved out of src/lib/utils/export.ts, which is a BROWSER module (toast,
 * DOM download helpers, xlsx) - server code importing getEnv from there
 * dragged that whole graph into the server bundle. utils/export.ts keeps a
 * re-export for existing imports; new server code imports from here.
 *
 * getEnv:        REQUIRED variable - throws with a precise name.
 * getOptionalEnv: optional integration - undefined when unset/empty, so
 *                 features degrade instead of crashing (the app must boot
 *                 with B2/Resend unconfigured, #58).
 */

export function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}
