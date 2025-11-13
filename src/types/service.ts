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
