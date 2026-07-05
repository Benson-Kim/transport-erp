/**
 * Structured logging (#42).
 *
 * JSON-lines logger with level filtering and context binding; the ONE
 * logging seam for server code. requestLogger() binds the x-request-id
 * minted by src/proxy.ts (#21) so log lines correlate with audit rows.
 *
 * DECISION (#42): package-lock.json cannot be regenerated in this
 * environment (the same constraint recorded for ts-jest in #59), so pino
 * and @sentry/nextjs are not installable as locked dependencies yet. All
 * call sites go through this module; swapping emit() for pino and adding a
 * Sentry transport in #59's locked-dependency pass changes nothing else.
 * console.* is sanctioned in exactly one place: emit() below - everywhere
 * else it is a leak (see the console-leak-gate CI job).
 */

import { getRequestId } from '@/lib/request-context';

type Level = 'debug' | 'info' | 'warn' | 'error';
type Context = Record<string, unknown>;

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): Level {
  const configured = process.env.LOG_LEVEL;
  if (configured === 'debug' || configured === 'info' || configured === 'warn' || configured === 'error') {
    return configured;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function emit(level: Level, message: string, context: Context): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel()]) return;

  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg: message,
    ...context,
  });

  // The ONE sanctioned console call (structured JSON only - never raw
  // values, roles, or secrets).
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export interface Logger {
  debug(message: string, context?: Context): void;
  info(message: string, context?: Context): void;
  warn(message: string, context?: Context): void;
  error(message: string, context?: Context): void;
  /** New logger with `context` merged into every line. */
  child(context: Context): Logger;
}

function makeLogger(base: Context): Logger {
  return {
    debug: (message, context = {}) => emit('debug', message, { ...base, ...context }),
    info: (message, context = {}) => emit('info', message, { ...base, ...context }),
    warn: (message, context = {}) => emit('warn', message, { ...base, ...context }),
    error: (message, context = {}) => emit('error', message, { ...base, ...context }),
    child: (context) => makeLogger({ ...base, ...context }),
  };
}

/** Process-scoped logger (background jobs, module-level code). */
export const logger = makeLogger({});

/**
 * Request-scoped logger: binds the proxy-minted x-request-id (#21/#42) so
 * every line written during a server action correlates with the audit rows
 * createAuditLog writes for the same request. Falls back to the plain
 * logger outside a request scope (tests, jobs).
 */
export async function requestLogger(context: Context = {}): Promise<Logger> {
  const requestId = await getRequestId();
  return makeLogger(requestId ? { requestId, ...context } : context);
}
