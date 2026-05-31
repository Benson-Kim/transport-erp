'use server';

import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import prisma from '@/lib/prisma/prisma';
import { generateUniqueIdentifier } from '@/lib/prisma/db-helpers';
import Papa from 'papaparse';
import { computeFinancials } from '@/lib/service-financials';

/** Maximum number of rows allowed in a single bulk upload. */
const MAX_BULK_ROWS = 500;

export interface BulkUploadResult {
  success: boolean;
  message: string;
  createdCount?: number;
  skippedCount?: number;
  errors?: Array<{ row: number; error: string }> | undefined;
}

/**
 * Processes a bulk upload of orders (Service + Shipment).
 *
 * Expected CSV headers (case-insensitive):
 *   ClientId, SupplierId, ServiceDate, DriverName, ClientRef, Description,
 *   Origin, Destination, CostAmount, SaleAmount,
 *   RecipientName, RecipientPhone, RecipientEmail,
 *   StreetName, StreetNumber, CodigoPostal, Ciudad, Provincia,
 *   DeliveryLat, DeliveryLng
 *
 * Uses a partial-success model: valid rows are processed, invalid rows are
 * returned as errors so the operator can fix and re-upload.
 */
export async function processBulkOrders(csvContent: string): Promise<BulkUploadResult> {
  const session = await requireAuth();
  await requirePermission('services', 'create');

  try {
    const parseResult = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
    });

    if (parseResult.errors.length > 0) {
      return {
        success: false,
        message: 'Failed to parse CSV content',
        errors: parseResult.errors.map(err => ({ row: err.row ?? 0, error: err.message })),
      };
    }

    const rows = parseResult.data as Record<string, string>[];

    if (rows.length === 0) {
      return { success: false, message: 'CSV contains no data rows' };
    }

    if (rows.length > MAX_BULK_ROWS) {
      return {
        success: false,
        message: `CSV contains ${rows.length} rows — maximum allowed is ${MAX_BULK_ROWS}`,
      };
    }

    // --- Validate rows (partial-success: collect errors, proceed with valid) ---
    const validationErrors: Array<{ row: number; error: string }> = [];
    const validRows: Array<{
      rowNum: number;
      raw: Record<string, string>;
      clientid: string;
      supplierid: string;
      recipientname: string;
      recipientphone: string;
      streetname: string;
      streetnumber: string;
      codigopostal: string;
      ciudad: string;
      provincia: string;
    }> = [];

    rows.forEach((row, index) => {
      const rowNum = index + 2; // +1 for 0-index, +1 for header row
      const missing: string[] = [];

      if (!row.clientid) missing.push('ClientId');
      if (!row.supplierid) missing.push('SupplierId');
      if (!row.recipientname) missing.push('RecipientName');
      if (!row.recipientphone) missing.push('RecipientPhone');
      if (!row.streetname) missing.push('StreetName');
      if (!row.streetnumber) missing.push('StreetNumber');
      if (!row.codigopostal) missing.push('CodigoPostal');
      if (!row.ciudad) missing.push('Ciudad');
      if (!row.provincia) missing.push('Provincia');

      if (missing.length > 0) {
        validationErrors.push({ row: rowNum, error: `Missing required fields: ${missing.join(', ')}` });
      } else {
        validRows.push({
          rowNum,
          raw: row,
          clientid: row.clientid!,
          supplierid: row.supplierid!,
          recipientname: row.recipientname!,
          recipientphone: row.recipientphone!,
          streetname: row.streetname!,
          streetnumber: row.streetnumber!,
          codigopostal: row.codigopostal!,
          ciudad: row.ciudad!,
          provincia: row.provincia!,
        });
      }
    });

    if (validRows.length === 0) {
      return {
        success: false,
        message: `All ${rows.length} rows failed validation`,
        errors: validationErrors,
      };
    }

    // --- Process valid rows in a transaction ---
    await prisma.$transaction(async (tx) => {
      for (const row of validRows) {
        // Generate identifiers inside the parent transaction (no nesting)
        const serviceNumber = await generateUniqueIdentifier('SRV', 'service', 'serviceNumber', tx);
        const shipmentNumber = await generateUniqueIdentifier('SHP', 'shipment', 'shipmentNumber', tx);

        // Financial calculations via single source of truth
        const costAmount = row.raw.costamount ? parseFloat(row.raw.costamount) : 0;
        const saleAmount = row.raw.saleamount ? parseFloat(row.raw.saleamount) : 0;
        const financials = computeFinancials({ costAmount, saleAmount });

        const service = await tx.service.create({
          data: {
            serviceNumber,
            date: row.raw.servicedate ? new Date(row.raw.servicedate) : new Date(),
            clientId: row.clientid,
            supplierId: row.supplierid,
            createdById: session.user.id,
            description: row.raw.description || `Bulk upload — ${serviceNumber}`,
            origin: row.raw.origin || row.ciudad || 'Pending',
            destination: row.raw.destination || `${row.streetname} ${row.streetnumber}, ${row.ciudad}`,
            driverName: row.raw.drivername || null,
            reference: row.raw.clientref || null,
            costAmount: financials.costAmount,
            saleAmount: financials.saleAmount,
            margin: financials.margin,
            marginPercentage: financials.marginPercentage,
            costVatRate: financials.costVatRate,
            saleVatRate: financials.saleVatRate,
            costVatAmount: financials.costVatAmount,
            saleVatAmount: financials.saleVatAmount,
            status: 'DRAFT',
          },
        });

        await tx.shipment.create({
          data: {
            shipmentNumber,
            serviceId: service.id,
            clientId: service.clientId,
            status: 'PENDING',
            recipientName: row.recipientname,
            recipientPhone: row.recipientphone,
            recipientEmail: row.raw.recipientemail || null,
            streetName: row.streetname,
            streetNumber: row.streetnumber,
            codigoPostal: row.codigopostal,
            ciudad: row.ciudad,
            provincia: row.provincia,
            deliveryLat: row.raw.deliverylat ? parseFloat(row.raw.deliverylat) : 0,
            deliveryLng: row.raw.deliverylng ? parseFloat(row.raw.deliverylng) : 0,
            events: {
              create: {
                status: 'PENDING',
                notes: 'Shipment created via bulk upload',
              },
            },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'IMPORT',
          tableName: 'services',
          recordId: 'bulk',
          metadata: {
            type: 'bulk_order_upload',
            totalRows: rows.length,
            processedCount: validRows.length,
            skippedCount: validationErrors.length,
            timestamp: new Date().toISOString(),
          },
        },
      });
    });

    return {
      success: true,
      message: validationErrors.length > 0
        ? `Processed ${validRows.length} orders with ${validationErrors.length} skipped`
        : `Successfully processed ${validRows.length} orders`,
      createdCount: validRows.length,
      skippedCount: validationErrors.length,
      errors: validationErrors.length > 0 ? validationErrors : undefined,
    };

  } catch (error: unknown) {
    console.error('[BulkActions] Failed to process bulk orders:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error during bulk processing',
    };
  }
}
