import type { InvoiceDirection, InvoiceStatus, PaymentStatus } from '@/app/generated/prisma';

export type { ActionResult } from '@/types/client';

/** Invoice list row (plain - Decimals already converted at the boundary). */
export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  direction: InvoiceDirection;
  partyName: string;
  partyId: string;
  externalReference: string | null;
  invoiceDate: Date;
  dueDate: Date;
  totalAmount: number;
  paidAmount: number;
  currency: string;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
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

export interface InvoiceItemView {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number;
  taxAmount: number;
  serviceId: string | null;
  serviceNumber: string | null;
}

export interface PaymentView {
  id: string;
  paymentNumber: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: string;
  reference: string | null;
  status: PaymentStatus;
  notes: string | null;
}

/** Full invoice detail (plain). */
export interface InvoiceDetailView {
  id: string;
  invoiceNumber: string;
  direction: InvoiceDirection;
  externalReference: string | null;
  party: { id: string; name: string; kind: 'client' | 'supplier' };
  invoiceDate: Date;
  dueDate: Date;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  outstanding: number;
  irpfRate: number | null;
  irpfAmount: number | null;
  currency: string;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  paidAt: Date | null;
  sentAt: Date | null;
  description: string | null;
  notes: string | null;
  items: InvoiceItemView[];
  payments: PaymentView[];
  createdBy: { id: string; name: string };
  createdAt: Date;
}

/** Party options for the invoice form selects. */
export interface InvoiceParties {
  clients: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}
