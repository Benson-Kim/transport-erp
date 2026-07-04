/**
 * HTML -> PDF rendering (#34).
 *
 * Server-only puppeteer wrapper. The browser is a lazy module singleton
 * (launching Chromium is expensive; the globalThis stash survives dev
 * hot-reload, the prisma.ts pattern). Templates are pure functions in
 * src/lib/pdf/templates.ts - this module only turns their HTML into bytes.
 *
 * The renderer NEVER navigates to an app URL: content is injected directly
 * with page.setContent, so no request, session or cookie is involved and
 * the render cannot depend on (or leak through) the auth layer.
 */

import puppeteer, { type Browser, type PaperFormat } from 'puppeteer';

import type { PaperSize } from '@/types/settings';

const PAPER_FORMATS: Record<PaperSize, PaperFormat> = {
  A4: 'a4',
  Letter: 'letter',
  Legal: 'legal',
};

const globalForPdf = globalThis as unknown as { pdfBrowser?: Promise<Browser> };

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    // Container-safe flags: the app runs in Docker (see docker-compose),
    // where Chromium's sandbox is unavailable without extra capabilities.
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

async function getBrowser(): Promise<Browser> {
  const existing = globalForPdf.pdfBrowser;
  if (existing) {
    const browser = await existing.catch(() => null);
    if (browser?.connected) return browser;
  }
  globalForPdf.pdfBrowser = launchBrowser();
  return globalForPdf.pdfBrowser;
}

/** Render an HTML string to PDF bytes. */
export async function renderHtmlToPdf(html: string, paperSize: PaperSize): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // 'load' still waits for subresources (the branding logo <img>);
    // 'networkidle0' is not part of setContent's LifecycleEvent union here.
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: PAPER_FORMATS[paperSize],
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '15mm', right: '15mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}
