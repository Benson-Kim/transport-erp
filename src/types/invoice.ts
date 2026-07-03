/**
 * Invoice DTO types (#30). Money crosses to these DTOs as `number` via
 * pricing.ts decimalToNumber ONLY at the action boundary - never for
 * arithmetic.
 */

import type {
  InvoiceDirection,
  InvoiceStatus,
  PaymentStatus,
  ServiceStatus,
} from '@/app/generated/prisma';

// ActionResult is defined with the clients vertical (the reference
// template); consolidating the duplicated result types is #57's scope.
export type { ActionResult } from '@/types/client';

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  direction: InvoiceDirection;
  externalReference: string | null;
  partyName: string;
  invoiceDate: Date;
  dueDate: Date;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  totalAmount: number;
  paidAmount: number;
  currency: string;
  itemsCount: number;
}

export interface PaginatedInvoices {
  data: InvoiceListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface InvoiceItemDto {
  id: string;
  description: string;
  serviceId: string | null;
  serviceNumber: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number;
  taxAmount: number;
}

export interface InvoicePaymentDto {
  id: string;
  paymentNumber: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: string;
  reference: string | null;
  status: PaymentStatus;
}

export interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  direction: InvoiceDirection;
  externalReference: string | null;
  invoiceDate: Date;
  dueDate: Date;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  subtotal: number;
  taxAmount: number;
  irpfRate: number | null;
  irpfAmount: number | null;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paidAt: Date | null;
  currency: string;
  description: string | null;
  notes: string | null;
  sentAt: Date | null;
  party: { id: string; name: string; type: 'client' | 'supplier' };
  createdByName: string;
  createdAt: Date;
  items: InvoiceItemDto[];
  payments: InvoicePaymentDto[];
}

/** Row in the invoiceable-services selection on /invoices/new. */
export interface InvoiceableService {
  id: string;
  serviceNumber: string;
  date: Date;
  description: string;
  origin: string;
  destination: string;
  status: ServiceStatus;
  /** Net line amount for the chosen direction (sale or cost side). */
  amount: number;
}

/** Party option for the create flow selector (capped list; #47 replaces). */
export interface InvoicePartyOption {
  id: string;
  name: string;
}
