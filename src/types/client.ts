

import type { Client, ClientContact, ServiceStatus } from '@/app/generated/prisma';

/** Address structure stored as JSON */
export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}

/** Client with related data */
export interface ClientWithRelations extends Client {
  company?: {
    id: string;
    legalName: string;
  } | null;
  contacts?: ClientContact[];
  _count?: {
    services: number;
    documents: number;
  };
}

/** Client with service statistics */
export interface ClientWithStats extends ClientWithRelations {
  stats: ClientStats;
}

/** Computed statistics for a client */
export interface ClientStats {
  totalServices: number;
  activeServices: number;
  completedServices: number;
  cancelledServices: number;
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  averageMarginPercentage: number;
  lastServiceDate: Date | null;
}

/** Client list item for table display */
export interface ClientListItem {
  id: string;
  clientCode: string;
  name: string;
  tradeName: string | null;
  vatNumber: string | null;
  billingEmail: string;
  contactPhone: string | null;
  country: string;
  isActive: boolean;
  currency: string;
  servicesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Filter options for client list */
export interface ClientFilters {
  search?: string;
  country?: string;
  isActive?: boolean;
  currency?: string;
  tags?: string[];
}

/** Sort options for client list */
export interface ClientSort {
  field: 'name' | 'clientCode' | 'country' | 'servicesCount' | 'createdAt' | 'updatedAt';
  direction: 'asc' | 'desc';
}

/** Paginated client response */
export interface PaginatedClients {
  data: ClientListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/** Client form data for create/edit */
export interface ClientFormData {
  // Basic Information
  name: string;
  tradeName?: string;
  vatNumber?: string;
  
  // Billing Address
  billingAddress: Address;
  
  // Shipping Address (optional)
  useShippingAddress: boolean;
  shippingAddress?: Address;
  
  // Contact Information
  billingEmail: string;
  trafficEmail?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactMobile?: string;
  
  // Financial Settings
  creditLimit?: number;
  paymentTerms: number;
  discount?: number;
  currency: string;
  
  // Settings
  language: string;
  sendReminders: boolean;
  autoInvoice: boolean;
  
  // Metadata
  notes?: string;
  tags: string[];
  isActive: boolean;
}

/** Client service for detail view */
export interface ClientService {
  id: string;
  serviceNumber: string;
  date: Date;
  description: string;
  origin: string;
  destination: string;
  supplier: {
    id: string;
    name: string;
  };
  costAmount: number;
  saleAmount: number;
  margin: number;
  marginPercentage: number;
  status: ServiceStatus;
}

/** Export column configuration */
export interface ExportColumn {
  key: string;
  header: string;
  width?: number;
  formatter?: (value: unknown) => string;
}

/** Action result type */
export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  errors?: Record<string, string[]>;
}