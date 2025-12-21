/**
 * Service Types
 */
import { ServiceStatus } from '@/app/generated/prisma';

export interface ServiceData {
  id: string;
  serviceNumber: string;
  date: string;
  clientId: string;
  clientName: string;
  clientCode: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  driverName: string | null;
  vehiclePlate: string | null;
  origin: string;
  destination: string;
  costAmount: number;
  saleAmount: number;
  margin: number;
  marginPercentage: number;
  status: ServiceStatus;
  createdAt?: string;
  updatedAt?: string;
  notes?: string;
}

export interface ClientData {
  id: string;
  name: string;
  clientCode: string;
}

export interface SupplierData {
  id: string;
  name: string;
  supplierCode: string;
}

export interface ServicesPageProps {
  searchParams: Promise<{
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    clientId?: string;
    supplierId?: string;
    driver?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: string;
    pageSize?: string;
  }>;
}

export interface ServicesFiltersProps {
  clients: ClientData[];
  suppliers: SupplierData[];
  currentFilters: {
    search: string;
    dateFrom: string;
    dateTo: string;
    status: string;
    clientId: string;
    supplierId: string;
    driver: string;
  };
  activeCount: number;
  totalCount?: number;
  filteredCount?: number;
  selectedServices?: string[];
  onSelectionChange?: (ids: string[]) => void;
  onBulkAction?: (action: 'update' | 'delete' | 'loadingOrder', data?: any) => Promise<void>;
  onSaveFilter?: (name: string, filters: any) => void;
  savedFilters?: Array<{ id: string; name: string; filters: any }>;
}

export interface ServiceFiltersAPI {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: ServiceStatus | undefined;
  clientId?: string;
  supplierId?: string;
  driver?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}
