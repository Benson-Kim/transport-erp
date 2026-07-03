/**
 * Supplier Detail (#29) - server component: streams with the page, ships no
 * client JS. Receives PLAIN values (Decimals already converted).
 */

import Link from 'next/link';

import { formatCurrency, formatPercentPoints } from '@/lib/utils/formatting';
import type { SupplierService, SupplierStats } from '@/types/supplier';

export interface SupplierDetailView {
  id: string;
  supplierCode: string;
  name: string;
  tradeName: string | null;
  vatNumber: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string | null;
  postalCode: string;
  country: string;
  email: string;
  phone: string | null;
  contactPerson: string | null;
  contactMobile: string | null;
  irpfRate: number | null;
  vatRate: number;
  paymentTerms: number;
  paymentMethod: string | null;
  bankName: string | null;
  iban: string | null;
  currency: string;
  isActive: boolean;
  notes: string | null;
  stats: SupplierStats;
}

interface SupplierDetailProps {
  supplier: SupplierDetailView;
  services: SupplierService[];
  servicesTotal: number;
  canEdit: boolean;
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-sm font-medium text-right">{value ?? '—'}</dd>
    </div>
  );
}

// eslint-disable-next-line max-lines-per-function
export function SupplierDetail({ supplier, services, servicesTotal, canEdit }: SupplierDetailProps) {
  const { stats } = supplier;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{supplier.name}</h1>
          <p className="text-sm text-gray-500">
            {supplier.supplierCode}
            {supplier.tradeName ? ` · ${supplier.tradeName}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge ${supplier.isActive ? 'badge-success' : 'badge-gray'}`}>
            {supplier.isActive ? 'Active' : 'Inactive'}
          </span>
          {canEdit && (
            <Link href={`/suppliers/${supplier.id}/edit`} className="button button-primary">
              Edit supplier
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-sm text-gray-500">Total services</p>
          <p className="text-2xl font-semibold">{stats.totalServices}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-semibold">{stats.activeServices}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">Completed</p>
          <p className="text-2xl font-semibold">{stats.completedServices}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">Total cost</p>
          <p className="text-2xl font-semibold">{formatCurrency(stats.totalCost)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Identity + contact */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Details</h2>
          <dl>
            <InfoRow label="VAT number" value={supplier.vatNumber} />
            <InfoRow
              label="Address"
              value={[
                supplier.addressLine1,
                supplier.addressLine2,
                `${supplier.postalCode} ${supplier.city}`,
                supplier.state,
                supplier.country,
              ]
                .filter(Boolean)
                .join(', ')}
            />
            <InfoRow label="Email" value={supplier.email} />
            <InfoRow label="Phone" value={supplier.phone} />
            <InfoRow label="Contact person" value={supplier.contactPerson} />
            <InfoRow label="Mobile" value={supplier.contactMobile} />
          </dl>
        </div>

        {/* Financial terms */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Financial terms</h2>
          <dl>
            <InfoRow label="VAT rate" value={formatPercentPoints(supplier.vatRate)} />
            <InfoRow
              label="IRPF retention"
              value={supplier.irpfRate != null ? formatPercentPoints(supplier.irpfRate) : null}
            />
            <InfoRow label="Payment terms" value={`${supplier.paymentTerms} days`} />
            <InfoRow label="Payment method" value={supplier.paymentMethod} />
            <InfoRow label="Currency" value={supplier.currency} />
            <InfoRow label="Bank" value={supplier.bankName} />
            <InfoRow label="IBAN" value={supplier.iban} />
          </dl>
        </div>
      </div>

      {supplier.notes && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Notes</h2>
          <p className="text-sm whitespace-pre-wrap">{supplier.notes}</p>
        </div>
      )}

      {/* Latest services */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between p-6 pb-2">
          <h2 className="text-lg font-semibold">Services ({servicesTotal})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Number</th>
                <th scope="col">Date</th>
                <th scope="col">Route</th>
                <th scope="col">Client</th>
                <th scope="col">Cost</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {services.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    No services with this supplier yet.
                  </td>
                </tr>
              )}
              {services.map((service) => (
                <tr key={service.id}>
                  <td>
                    <Link
                      href={`/services/${service.id}`}
                      className="font-medium text-primary-600 hover:underline"
                    >
                      {service.serviceNumber}
                    </Link>
                  </td>
                  <td>{service.date.toLocaleDateString('es-ES')}</td>
                  <td>
                    {service.origin} → {service.destination}
                  </td>
                  <td>
                    <Link
                      href={`/clients/${service.client.id}`}
                      className="text-primary-600 hover:underline"
                    >
                      {service.client.name}
                    </Link>
                  </td>
                  <td>{formatCurrency(service.costAmount)}</td>
                  <td>
                    <span className="badge">{service.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
