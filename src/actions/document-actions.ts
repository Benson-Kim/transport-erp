/**
 * Document Server Actions (#34)
 *
 * The ONE authorized path between the browser and the object store:
 * - Downloads: short-lived presigned URLs minted per request AFTER the
 *   permission + object-level scoping checks. Raw B2 keys never reach the
 *   client (the RelatedDocuments window.open(key) IDOR-shape is dead).
 * - Generation: server-side PDF (puppeteer) -> real bytes uploaded to B2 ->
 *   Document rows with TRUE fileSize/mimeType written in one transaction
 *   with the parent row update and the audit row. No Document row without a
 *   backing file; no orphan file the DB does not know about (compensating
 *   delete on transaction failure).
 */

'use server';

import { revalidatePath } from 'next/cache';

import { format as formatDateFns } from 'date-fns';

import {
  AuditAction,
  DocumentType,
  InvoiceDirection,
  UserRole,
  type Prisma,
} from '@/app/generated/prisma';
import { getServerAuth } from '@/lib/auth';
import type {
  InvoicePdfData,
  LoadingOrderPdfData,
  PdfBranding,
} from '@/lib/pdf/templates';
import { RESOURCES, ACTIONS } from '@/lib/permissions';
import { decimalToNumber } from '@/lib/pricing';
import { createAuditLog, withTransaction } from '@/lib/prisma/db-helpers';
import prisma from '@/lib/prisma/prisma';
import {
  checkResourceOwnership,
  ForbiddenError,
  requirePermission,
  requireServiceAccess,
  UnauthorizedError,
} from '@/lib/rbac';
import { STORAGE_PATHS } from '@/lib/storage/constants';
import { storageService } from '@/lib/storage/service';
import {
  DEFAULT_SYSTEM_SETTINGS,
  pdfSettingsSchema,
} from '@/lib/validations/settings-schema';
// ActionResult is defined with the clients vertical (the reference
// template); consolidating the duplicated result types is #57's scope.
import type { ActionResult } from '@/types/client';
import type { PaperSize } from '@/types/settings';
import { SettingKey } from '@/types/settings';

/** Presigned URLs are short-lived and single-purpose (#34). */
const DOWNLOAD_URL_TTL_SECONDS = 300;

export interface DocumentDownload {
  url: string;
  fileName: string;
  expiresInSeconds: number;
}

/**
 * Typed authz errors surface as honest ActionResult errors (server-action
 * throws are masked in production) - the loading-order-actions.ts pattern.
 */
function toActionError(error: unknown, fallback: string): { success: false; error: string } {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return { success: false, error: error.message };
  }
  console.error(fallback, error);
  return { success: false, error: error instanceof Error ? error.message : fallback };
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(value);
}

function formatDay(date: Date): string {
  return formatDateFns(date, 'dd/MM/yyyy');
}

/**
 * Branding + paper size for the PDF pipeline: the DEFAULT Company row
 * (legal identity, logo) + the SettingKey.PDF system setting. Falls back to
 * DEFAULT_SYSTEM_SETTINGS.pdf when the row is absent or fails validation -
 * generation must not depend on the settings page having been visited.
 */
async function getPdfContext(): Promise<{ branding: PdfBranding; paperSize: PaperSize }> {
  const [company, settingRow] = await Promise.all([
    prisma.company.findFirst({ where: { code: 'DEFAULT', deletedAt: null } }),
    prisma.systemSetting.findUnique({ where: { key: SettingKey.PDF } }),
  ]);

  const parsed = pdfSettingsSchema.safeParse(settingRow?.value);
  const pdf = parsed.success ? parsed.data : DEFAULT_SYSTEM_SETTINGS.pdf;

  const addressLines = company
    ? [
        company.addressLine1,
        company.addressLine2 ?? '',
        `${company.postalCode} ${company.city}`,
        company.country,
      ].filter(Boolean)
    : [];

  return {
    branding: {
      companyName: company?.legalName ?? '',
      vatNumber: company?.vatNumber ?? '',
      addressLines,
      phone: company?.phone ?? '',
      email: company?.email ?? '',
      logoUrl: company?.logoUrl ?? null,
      includeLogo: pdf.includeLogo,
      logoPosition: pdf.logoPosition,
      footerText: pdf.footerText ?? '',
    },
    paperSize: pdf.paperSize,
  };
}

/**
 * Mint a short-lived presigned download/view URL for a Document row.
 *
 * Authorization (#34, the IDOR fix):
 * - documents:view is required for every caller.
 * - Service-linked documents re-run requireServiceAccess('view') - for
 *   OPERATOR that means ownership of the service (#16), so another
 *   operator's route documents are rejected, not just un-linked.
 * - INVOICE-type documents additionally require invoices:view: invoice
 *   PDFs carry pricing, and the documents matrix admits roles (OPERATOR)
 *   that the invoices matrix does not.
 *
 * mode 'view' presigns without a content-disposition filename (renders
 * inline); 'download' forces an attachment with the stored fileName.
 */
export async function getDocumentDownloadUrl(
  documentId: string,
  mode: 'view' | 'download' = 'download'
): Promise<ActionResult<DocumentDownload>> {
  try {
    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    await requirePermission(RESOURCES.DOCUMENTS, ACTIONS.VIEW);

    const document = await prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
      select: {
        id: true,
        documentType: true,
        fileName: true,
        filePath: true,
        serviceId: true,
      },
    });

    if (!document) {
      return { success: false, error: 'Document not found' };
    }

    if (document.documentType === DocumentType.INVOICE) {
      await requirePermission(RESOURCES.INVOICES, ACTIONS.VIEW);
    }

    if (document.serviceId) {
      await requireServiceAccess('view', document.serviceId);
    }

    const url = await storageService.getPresignedDownloadUrl(
      document.filePath,
      DOWNLOAD_URL_TTL_SECONDS,
      mode === 'download' ? document.fileName : undefined
    );

    return {
      success: true,
      data: { url, fileName: document.fileName, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS },
    };
  } catch (error) {
    return toActionError(error, 'Failed to prepare the document download');
  }
}

/**
 * Presign the stored PDF of a loading order (same gates as
 * getLoadingOrderById: loading_orders:view + OPERATOR ownership scoping).
 */
export async function getLoadingOrderPdfUrl(
  loadingOrderId: string
): Promise<ActionResult<DocumentDownload>> {
  try {
    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    await requirePermission(RESOURCES.LOADING_ORDERS, ACTIONS.VIEW);

    if (session.user.role === UserRole.OPERATOR) {
      const owns = await checkResourceOwnership('loading_orders', loadingOrderId);
      if (!owns) {
        return {
          success: false,
          error: 'Forbidden: you do not have access to this loading order',
        };
      }
    }

    const order = await prisma.loadingOrder.findFirst({
      where: { id: loadingOrderId, deletedAt: null },
      select: { orderNumber: true, pdfPath: true },
    });

    if (!order) {
      return { success: false, error: 'Loading order not found' };
    }
    if (!order.pdfPath) {
      return { success: false, error: 'No PDF has been generated for this loading order yet' };
    }

    const fileName = `${order.orderNumber}.pdf`;
    const url = await storageService.getPresignedDownloadUrl(
      order.pdfPath,
      DOWNLOAD_URL_TTL_SECONDS,
      fileName
    );

    return { success: true, data: { url, fileName, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS } };
  } catch (error) {
    return toActionError(error, 'Failed to prepare the PDF download');
  }
}

/**
 * Generate (or regenerate) the loading-order PDF.
 *
 * Pipeline: render (carrier-facing template - no pricing, no client
 * identity) -> upload real bytes to B2 -> ONE transaction updating
 * LoadingOrder.pdfPath/pdfGeneratedAt/pdfSize, superseding the previous
 * Document rows, creating a Document row per member service with the TRUE
 * size/mime (the phantom fileSize: 0 rows are exactly what #34 forbids),
 * and writing the audit row (#27). If the transaction fails after the
 * upload, the object is deleted (compensation) so no orphan file exists.
 * Regeneration uploads under a fresh key - the previous object is only
 * removed after the new state is committed.
 */
export async function generateLoadingOrderPdf(
  loadingOrderId: string
): Promise<ActionResult<{ orderNumber: string }>> {
  try {
    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    await requirePermission(RESOURCES.LOADING_ORDERS, ACTIONS.VIEW);
    await requirePermission(RESOURCES.DOCUMENTS, ACTIONS.CREATE);

    if (session.user.role === UserRole.OPERATOR) {
      const owns = await checkResourceOwnership('loading_orders', loadingOrderId);
      if (!owns) {
        return {
          success: false,
          error: 'Forbidden: you do not have access to this loading order',
        };
      }
    }

    const order = await prisma.loadingOrder.findFirst({
      where: { id: loadingOrderId, deletedAt: null },
      include: {
        services: {
          orderBy: { position: 'asc' },
          include: {
            service: {
              select: {
                id: true,
                serviceNumber: true,
                date: true,
                origin: true,
                destination: true,
                vehiclePlate: true,
                driverName: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return { success: false, error: 'Loading order not found' };
    }

    const { branding, paperSize } = await getPdfContext();

    const data: LoadingOrderPdfData = {
      orderNumber: order.orderNumber,
      generatedAt: formatDay(new Date()),
      notes: order.notes,
      services: order.services.map((link) => ({
        position: link.position,
        serviceNumber: link.service.serviceNumber,
        date: formatDay(link.service.date),
        origin: link.service.origin,
        destination: link.service.destination,
        vehiclePlate: link.service.vehiclePlate,
        driverName: link.service.driverName,
      })),
    };

    // Lazy imports keep puppeteer out of every other action's module graph.
    const [{ loadingOrderHtml }, { renderHtmlToPdf }] = await Promise.all([
      import('@/lib/pdf/templates'),
      import('@/lib/pdf/render'),
    ]);

    const pdfBuffer = await renderHtmlToPdf(loadingOrderHtml(data, branding), paperSize);

    const fileName = `${order.orderNumber}.pdf`;
    const previousPdfPath = order.pdfPath;
    const uploaded = await storageService.uploadFile(pdfBuffer, fileName, {
      path: STORAGE_PATHS.LOADING_ORDERS,
      // Fresh key per generation: regeneration never overwrites the object a
      // committed row still points at.
      fileName: `${order.orderNumber}-${Date.now()}.pdf`,
      contentType: 'application/pdf',
      metadata: { loadingOrderId: order.id },
    });

    try {
      await withTransaction(async (tx) => {
        await tx.loadingOrder.update({
          where: { id: order.id },
          data: {
            pdfPath: uploaded.key,
            pdfGeneratedAt: new Date(),
            pdfSize: uploaded.size,
          },
        });

        // Supersede the previous generation's rows (regeneration).
        await tx.document.updateMany({
          where: {
            documentType: DocumentType.LOADING_ORDER,
            documentNumber: order.orderNumber,
            deletedAt: null,
          },
          data: { deletedAt: new Date() },
        });

        // One row per member service - the SAME stored artifact surfaced in
        // each service's RelatedDocuments, with the real size and mime.
        const documentRows: Prisma.DocumentCreateManyInput[] = order.services.map((link) => ({
          documentType: DocumentType.LOADING_ORDER,
          documentNumber: order.orderNumber,
          serviceId: link.service.id,
          fileName,
          filePath: uploaded.key,
          fileSize: uploaded.size,
          mimeType: 'application/pdf',
          description: `Loading order ${order.orderNumber}`,
          uploadedBy: session.user.id,
        }));
        await tx.document.createMany({ data: documentRows });

        await createAuditLog(
          {
            userId: session.user.id,
            action: AuditAction.GENERATE_DOCUMENT,
            tableName: 'loading_orders',
            recordId: order.id,
            metadata: {
              orderNumber: order.orderNumber,
              filePath: uploaded.key,
              fileSize: uploaded.size,
              regenerated: previousPdfPath !== null,
            },
          },
          tx
        );
      });
    } catch (dbError) {
      // Compensation: never leave an orphan object the DB knows nothing about.
      await storageService.deleteFile(uploaded.key).catch((cleanupError) => {
        console.error('Failed to clean up uploaded PDF after DB failure:', cleanupError);
      });
      throw dbError;
    }

    // The previous object is unreferenced only now that the new state is
    // committed; best-effort removal.
    if (previousPdfPath && previousPdfPath !== uploaded.key) {
      await storageService.deleteFile(previousPdfPath).catch((cleanupError) => {
        console.error('Failed to remove superseded loading-order PDF:', cleanupError);
      });
    }

    revalidatePath('/documents/loading-orders');
    revalidatePath(`/documents/loading-orders/${order.id}`);
    for (const link of order.services) {
      revalidatePath(`/services/${link.service.id}`);
    }

    return { success: true, data: { orderNumber: order.orderNumber } };
  } catch (error) {
    return toActionError(error, 'Failed to generate the loading order PDF');
  }
}

/**
 * Generate (or regenerate) an invoice PDF. Same pipeline and compensation
 * pattern as generateLoadingOrderPdf; totals are the STORED invoice figures
 * (subtotal/taxAmount/irpfAmount/totalAmount already satisfy the #11
 * composition CHECK) - the PDF never recomputes money.
 */
export async function generateInvoicePdf(
  invoiceId: string
): Promise<ActionResult<{ invoiceNumber: string }>> {
  try {
    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    await requirePermission(RESOURCES.INVOICES, ACTIONS.VIEW);
    await requirePermission(RESOURCES.DOCUMENTS, ACTIONS.CREATE);

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      include: {
        client: { select: { id: true, name: true, vatNumber: true } },
        supplier: { select: { id: true, name: true, vatNumber: true } },
        items: { orderBy: { id: 'asc' } },
      },
    });

    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    const party =
      invoice.direction === InvoiceDirection.SALES ? invoice.client : invoice.supplier;
    if (!party) {
      return { success: false, error: 'Invoice party not found' };
    }

    const { branding, paperSize } = await getPdfContext();

    const money = (value: unknown): string =>
      formatMoney(decimalToNumber(value as never), invoice.currency);

    const itemRates = new Set(invoice.items.map((item) => item.taxRate.toString()));
    const taxLabel =
      itemRates.size === 1 && invoice.items[0]
        ? `VAT (${decimalToNumber(invoice.items[0].taxRate)}%)`
        : 'VAT';

    const data: InvoicePdfData = {
      title:
        invoice.direction === InvoiceDirection.SALES
          ? 'Invoice'
          : 'Registered supplier invoice',
      invoiceNumber: invoice.invoiceNumber,
      externalReference: invoice.externalReference,
      invoiceDate: formatDay(invoice.invoiceDate),
      dueDate: formatDay(invoice.dueDate),
      partyLabel: invoice.direction === InvoiceDirection.SALES ? 'Bill to' : 'Supplier',
      partyName: party.name,
      partyVatNumber: party.vatNumber,
      items: invoice.items.map((item) => ({
        description: item.description,
        quantity: String(decimalToNumber(item.quantity)),
        unitPrice: money(item.unitPrice),
        amount: money(item.amount),
      })),
      subtotal: money(invoice.subtotal),
      taxLabel,
      taxAmount: money(invoice.taxAmount),
      irpfLabel: invoice.irpfRate ? `IRPF (${decimalToNumber(invoice.irpfRate)}%)` : null,
      irpfAmount: invoice.irpfAmount ? money(invoice.irpfAmount) : null,
      totalAmount: money(invoice.totalAmount),
      notes: invoice.notes,
      termsConditions: invoice.termsConditions,
    };

    const [{ invoiceHtml }, { renderHtmlToPdf }] = await Promise.all([
      import('@/lib/pdf/templates'),
      import('@/lib/pdf/render'),
    ]);

    const pdfBuffer = await renderHtmlToPdf(invoiceHtml(data, branding), paperSize);

    const fileName = `${invoice.invoiceNumber}.pdf`;
    const previousPdfPath = invoice.pdfPath;
    const uploaded = await storageService.uploadFile(pdfBuffer, fileName, {
      path: STORAGE_PATHS.INVOICES,
      fileName: `${invoice.invoiceNumber}-${Date.now()}.pdf`,
      contentType: 'application/pdf',
      metadata: { invoiceId: invoice.id },
    });

    try {
      await withTransaction(async (tx) => {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { pdfPath: uploaded.key, pdfGeneratedAt: new Date() },
        });

        await tx.document.updateMany({
          where: {
            documentType: DocumentType.INVOICE,
            documentNumber: invoice.invoiceNumber,
            deletedAt: null,
          },
          data: { deletedAt: new Date() },
        });

        await tx.document.create({
          data: {
            documentType: DocumentType.INVOICE,
            documentNumber: invoice.invoiceNumber,
            clientId: invoice.direction === InvoiceDirection.SALES ? invoice.clientId : null,
            supplierId:
              invoice.direction === InvoiceDirection.PURCHASE ? invoice.supplierId : null,
            fileName,
            filePath: uploaded.key,
            fileSize: uploaded.size,
            mimeType: 'application/pdf',
            description: `Invoice ${invoice.invoiceNumber}`,
            uploadedBy: session.user.id,
          },
        });

        await createAuditLog(
          {
            userId: session.user.id,
            action: AuditAction.GENERATE_DOCUMENT,
            tableName: 'invoices',
            recordId: invoice.id,
            metadata: {
              invoiceNumber: invoice.invoiceNumber,
              filePath: uploaded.key,
              fileSize: uploaded.size,
              regenerated: previousPdfPath !== null,
            },
          },
          tx
        );
      });
    } catch (dbError) {
      await storageService.deleteFile(uploaded.key).catch((cleanupError) => {
        console.error('Failed to clean up uploaded PDF after DB failure:', cleanupError);
      });
      throw dbError;
    }

    if (previousPdfPath && previousPdfPath !== uploaded.key) {
      await storageService.deleteFile(previousPdfPath).catch((cleanupError) => {
        console.error('Failed to remove superseded invoice PDF:', cleanupError);
      });
    }

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${invoice.id}`);

    return { success: true, data: { invoiceNumber: invoice.invoiceNumber } };
  } catch (error) {
    return toActionError(error, 'Failed to generate the invoice PDF');
  }
}
