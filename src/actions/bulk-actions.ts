'use server';

import { requirePermission } from '@/lib/rbac';
import prisma from '@/lib/prisma/prisma';
import type { Prisma } from '@/app/generated/prisma';
import Papa from 'papaparse';
import { generateUniqueIdentifier } from '@/lib/prisma/db-helpers';

export interface BulkUploadResult {
  success: boolean;
  message: string;
  createdCount?: number;
  errors?: Array<{ row: number; error: string }>;
}

/**
 * Processes a bulk upload of orders (Service + Shipment).
 * 
 * Expected CSV headers (case-insensitive):
 * ClientId, ServiceDate, DriverName, ClientRef, ShipmentType, Weight, Address, City, PostalCode, Country
 */
export async function processBulkOrders(csvContent: string): Promise<BulkUploadResult> {
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
    const validationErrors: Array<{ row: number; error: string }> = [];
    const validRows: Array<Record<string, string> & { rowNum: number }> = [];

    // Validate rows
    rows.forEach((row, index) => {
      const rowNum = index + 2; // +1 for 0-index, +1 for header row
      
      // Basic validation
      if (!row.clientid) {
        validationErrors.push({ row: rowNum, error: 'Missing ClientId' });
      } else if (!row.address) {
        validationErrors.push({ row: rowNum, error: 'Missing Address' });
      } else {
        validRows.push({ ...row, rowNum });
      }
    });

    if (validationErrors.length > 0) {
      return {
        success: false,
        message: `Validation failed for ${validationErrors.length} rows`,
        errors: validationErrors,
      };
    }

    // Process valid rows in a transaction
    await prisma.$transaction(async (tx) => {
      for (const row of validRows) {
        // Create Service
        const serviceNumber = await generateUniqueIdentifier(tx as Prisma.TransactionClient, 'service', 'SRV', 6);
        
        const service = await tx.service.create({
          data: {
            serviceNumber,
            date: row.servicedate ? new Date(row.servicedate) : new Date(),
            clientId: row.clientid,
            driverName: row.drivername || null,
            clientRef: row.clientref || null,
            status: 'PLANNED', // Initial status
          },
        });

        // Create associated Shipment
        const trackingNumber = await generateUniqueIdentifier(tx as Prisma.TransactionClient, 'shipment', 'TRK', 8);
        
        await tx.shipment.create({
          data: {
            trackingNumber,
            serviceId: service.id,
            clientId: service.clientId,
            status: 'PENDING',
            type: row.shipmenttype || 'PARCEL',
            weight: row.weight ? parseFloat(row.weight) : 1.0,
            address: {
              street: row.address,
              city: row.city || '',
              postalCode: row.postalcode || '',
              country: row.country || 'ES',
              lat: 0, // Would need geocoding in a real scenario
              lng: 0,
            },
            timeline: {
              create: {
                status: 'PENDING',
                description: 'Shipment created via bulk upload',
              }
            }
          },
        });
      }
    });

    return {
      success: true,
      message: `Successfully processed ${validRows.length} orders`,
      createdCount: validRows.length,
    };

  } catch (error: unknown) {
    console.error('[BulkActions] Failed to process bulk orders:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error during bulk processing',
    };
  }
}
