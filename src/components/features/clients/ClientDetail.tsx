'use client';

/**
 * Client Detail Component
 * Displays comprehensive client information and statistics
 */

import { useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { format } from 'date-fns';
import {
  Edit,
  Trash2,
  Building2,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Calendar,
  FileText,
  Plus,
  Copy,
  Check,
} from 'lucide-react';

import { deleteClient } from '@/actions/client-actions';
import { Alert, Badge, Button, Card, Modal, Skeleton, SkeletonGroup } from '@/components/ui';
import { formatCurrency, formatPercentage } from '@/lib/utils/formatting';
import type { ClientWithStats, Address } from '@/types/client';

import { ClientServices } from './ClientServices';

interface ClientDetailProps {
  client: ClientWithStats;
  canEdit: boolean;
  canDelete: boolean;
}

const CONTACT_SKELETON_IDS = ['contact-1', 'contact-2', 'contact-3', 'contact-4'] as const;
const ADDRESS_SKELETON_IDS = ['address-1', 'address-2'] as const;
const FINANCIAL_SKELETON_IDS = [
  'financial-1',
  'financial-2',
  'financial-3',
  'financial-4',
] as const;
const STATS_SKELETON_IDS = [
  'stat-total',
  'stat-active',
  'stat-completed',
  'stat-cancelled',
  'stat-divider',
  'stat-revenue',
  'stat-margin',
  'stat-avg',
] as const;
const ACTIVITY_SKELETON_IDS = ['activity-1', 'activity-2', 'activity-3'] as const;
const ACTIONS_SKELETON_IDS = ['action-1', 'action-2', 'action-3', 'action-4'] as const;
const SERVICE_SKELETON_IDS = ['service-1', 'service-2', 'service-3'] as const;

export function ClientDetailSkeleton() {
  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      aria-busy="true"
      aria-label="Loading client details"
      role="status"
    >
      {/* Main Content */}
      <div className="lg:col-span-2 space-y-6">
        {/* Header Card */}
        <div className="card p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-10 w-20 rounded-md" />
            </div>
          </div>

          {/* Contact Information Section */}
          <section className="mb-6">
            <Skeleton className="h-4 w-40 mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {CONTACT_SKELETON_IDS.map((id) => (
                <ContactItemSkeleton key={id} />
              ))}
            </div>
          </section>

          {/* Address Section */}
          <section className="mb-6">
            <Skeleton className="h-4 w-24 mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ADDRESS_SKELETON_IDS.map((id) => (
                <AddressItemSkeleton key={id} />
              ))}
            </div>
          </section>

          {/* Financial Section */}
          <section>
            <Skeleton className="h-4 w-36 mb-4" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {FINANCIAL_SKELETON_IDS.map((id) => (
                <FinancialItemSkeleton key={id} />
              ))}
            </div>
          </section>
        </div>

        {/* Services Card */}
        <div className="card">
          <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-32 rounded-md" />
              <Skeleton className="h-10 w-24 rounded-md" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <Skeleton className="h-4 w-20" />
                  </th>
                  <th>
                    <Skeleton className="h-4 w-16" />
                  </th>
                  <th>
                    <Skeleton className="h-4 w-24" />
                  </th>
                  <th>
                    <Skeleton className="h-4 w-20" />
                  </th>
                  <th>
                    <Skeleton className="h-4 w-16" />
                  </th>
                  <th>
                    <Skeleton className="h-4 w-16" />
                  </th>
                  <th>
                    <Skeleton className="h-4 w-16" />
                  </th>
                  <th>
                    <Skeleton className="h-4 w-16" />
                  </th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {SERVICE_SKELETON_IDS.map((id) => (
                  <ServiceRowSkeleton key={id} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Statistics Card */}
        <div className="card p-6">
          <Skeleton className="h-4 w-24 mb-4" />
          <SkeletonGroup className="space-y-4">
            {STATS_SKELETON_IDS.map((id) => (
              <StatItemSkeleton key={id} isDivider={id === 'stat-divider'} />
            ))}
          </SkeletonGroup>
        </div>

        {/* Activity Card */}
        <div className="card p-6">
          <Skeleton className="h-4 w-20 mb-4" />
          <SkeletonGroup className="space-y-4">
            {ACTIVITY_SKELETON_IDS.map((id) => (
              <ActivityItemSkeleton key={id} />
            ))}
          </SkeletonGroup>
        </div>

        {/* Quick Actions Card */}
        <div className="card p-6">
          <Skeleton className="h-4 w-28 mb-4" />
          <SkeletonGroup className="space-y-2">
            {ACTIONS_SKELETON_IDS.map((id) => (
              <Skeleton key={id} className="h-10 w-full rounded-md" />
            ))}
          </SkeletonGroup>
        </div>
      </div>
    </div>
  );
}

/**
 * Contact info item skeleton
 */
function ContactItemSkeleton() {
  return (
    <div className="flex items-start gap-3">
      <Skeleton className="w-5 h-5 rounded" variant="rectangular" />
      <div className="flex-1 space-y-1">
        <Skeleton className="h-3 w-20" variant="text" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

/**
 * Address item skeleton
 */
function AddressItemSkeleton() {
  return (
    <div className="flex items-start gap-3">
      <Skeleton className="w-5 h-5 rounded" variant="rectangular" />
      <div className="flex-1 space-y-1">
        <Skeleton className="h-3 w-24" variant="text" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-28" />
      </div>
    </div>
  );
}

/**
 * Financial info item skeleton
 */
function FinancialItemSkeleton() {
  return (
    <div className="space-y-1">
      <Skeleton className="h-3 w-16" variant="text" />
      <Skeleton className="h-5 w-20" />
    </div>
  );
}

/**
 * Statistics item skeleton
 */
function StatItemSkeleton({ isDivider = false }: { isDivider?: boolean }) {
  if (isDivider) {
    return <hr className="border-neutral-200" />;
  }

  return (
    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-24" variant="text" />
      <Skeleton className="h-4 w-16" />
    </div>
  );
}

/**
 * Activity item skeleton
 */
function ActivityItemSkeleton() {
  return (
    <div className="flex items-start gap-3">
      <Skeleton className="w-4 h-4 rounded" variant="rectangular" />
      <div className="flex-1 space-y-1">
        <Skeleton className="h-3 w-20" variant="text" />
        <Skeleton className="h-4 w-28" />
      </div>
    </div>
  );
}

/**
 * Service table row skeleton
 */
function ServiceRowSkeleton() {
  return (
    <tr>
      <td>
        <Skeleton className="h-4 w-24" />
      </td>
      <td>
        <Skeleton className="h-4 w-20" />
      </td>
      <td>
        <Skeleton className="h-4 w-32" />
      </td>
      <td>
        <Skeleton className="h-4 w-24" />
      </td>
      <td>
        <Skeleton className="h-4 w-16" />
      </td>
      <td>
        <Skeleton className="h-4 w-16" />
      </td>
      <td>
        <Skeleton className="h-4 w-20" />
      </td>
      <td>
        <Skeleton className="h-6 w-16 rounded-full" />
      </td>
      <td>
        <Skeleton className="w-8 h-8 rounded-md" />
      </td>
    </tr>
  );
}

export function ClientDetail({ client, canEdit, canDelete }: ClientDetailProps) {
  const router = useRouter();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const billingAddress = client.billingAddress as Address;
  const shippingAddress = client.shippingAddress as Address | null;

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDelete = () => {
    void (async () => {
      const result = await deleteClient(client.id);
      if (result.success) {
        router.push('/clients');
      }
    })();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Content */}
      <div className="lg:col-span-2 space-y-6">
        {/* Client Info Card */}
        <Card padding="none">
          <div className="flex items-start justify-between p-6 border-b border-neutral-200">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-neutral-900 m-0">{client.name}</h1>
                {client.tradeName && <p className="text-sm text-neutral-500">{client.tradeName}</p>}
                <p className="text-sm font-mono text-neutral-400 mt-1">{client.clientCode}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={client.isActive ? 'completed' : 'cancelled'} size="sm">
                {client.isActive ? 'Active' : 'Inactive'}
              </Badge>
              {canEdit && (
                <Button variant="secondary" size="md" icon={<Edit className="w-4 h-4" />} asChild>
                  <Link href={`/clients/${client.id}/edit`}>Edit</Link>
                </Button>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Contact Information */}
            <section>
              <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-4">
                Contact Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-neutral-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-neutral-500">Billing Email</p>
                    <div className="flex items-center gap-2">
                      <a
                        href={`mailto:${client.billingEmail}`}
                        className="text-primary hover:underline"
                      >
                        {client.billingEmail}
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(client.billingEmail, 'billingEmail')}
                        icon={
                          copiedField === 'billingEmail' ? (
                            <Check className="w-3 h-3 text-status-completed-text" />
                          ) : (
                            <Copy className="w-3 h-3 text-neutral-400" />
                          )
                        }
                        iconPosition="center"
                        title="Copy email"
                      />
                    </div>
                  </div>
                </div>

                {client.trafficEmail && (
                  <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 text-neutral-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-neutral-500">Traffic Email</p>
                      <a
                        href={`mailto:${client.trafficEmail}`}
                        className="text-primary hover:underline"
                      >
                        {client.trafficEmail}
                      </a>
                    </div>
                  </div>
                )}

                {client.contactPhone && (
                  <div className="flex items-start gap-3">
                    <Phone className="w-5 h-5 text-neutral-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-neutral-500">Phone</p>
                      <div className="flex items-center gap-2">
                        <a
                          href={`tel:${client.contactPhone}`}
                          className="text-neutral-900 hover:text-primary"
                        >
                          {client.contactPhone}
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(client.contactPhone!, 'phone')}
                          icon={
                            copiedField === 'phone' ? (
                              <Check className="w-3 h-3 text-status-completed-text" />
                            ) : (
                              <Copy className="w-3 h-3 text-neutral-400" />
                            )
                          }
                          iconPosition="center"
                          title="Copy phone"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {client.contactPerson && (
                  <div className="flex items-start gap-3">
                    <Building2 className="w-5 h-5 text-neutral-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-neutral-500">Contact Person</p>
                      <p className="text-neutral-900">{client.contactPerson}</p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Address */}
            <section>
              <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-4">
                Address
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-neutral-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-neutral-500">Billing Address</p>
                    <address className="text-neutral-900 not-italic">
                      {billingAddress.line1}
                      {billingAddress.line2 && <>, {billingAddress.line2}</>}
                      <br />
                      {billingAddress.city}, {billingAddress.postalCode}
                      <br />
                      {billingAddress.state && <>{billingAddress.state}, </>}
                      {billingAddress.country}
                    </address>
                  </div>
                </div>

                {shippingAddress && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-neutral-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-neutral-500">Shipping Address</p>
                      <address className="text-neutral-900 not-italic">
                        {shippingAddress.line1}
                        {shippingAddress.line2 && <>, {shippingAddress.line2}</>}
                        <br />
                        {shippingAddress.city}, {shippingAddress.postalCode}
                        <br />
                        {shippingAddress.state && <>{shippingAddress.state}, </>}
                        {shippingAddress.country}
                      </address>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Financial */}
            <section>
              <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-4">
                Financial Settings
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-neutral-500">Currency</p>
                  <p className="font-medium">{client.currency}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Payment Terms</p>
                  <p className="font-medium">{client.paymentTerms} days</p>
                </div>
                {client.creditLimit && (
                  <div>
                    <p className="text-xs text-neutral-500">Credit Limit</p>
                    <p className="font-medium">{formatCurrency(Number(client.creditLimit))}</p>
                  </div>
                )}
                {client.discount && (
                  <div>
                    <p className="text-xs text-neutral-500">Discount</p>
                    <p className="font-medium">{Number(client.discount)}%</p>
                  </div>
                )}
              </div>
            </section>

            {/* VAT */}
            {client.vatNumber && (
              <section>
                <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-4">
                  Tax Information
                </h2>
                <div className="flex items-start gap-3">
                  <CreditCard className="w-5 h-5 text-neutral-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-neutral-500">VAT Number</p>
                    <p className="font-mono text-neutral-900">{client.vatNumber}</p>
                  </div>
                </div>
              </section>
            )}

            {/* Notes */}
            {client.notes && (
              <section>
                <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-4">
                  Notes
                </h2>
                <p className="text-neutral-700 whitespace-pre-wrap">{client.notes}</p>
              </section>
            )}
          </div>
        </Card>

        {/* Services */}
        <ClientServices clientId={client.id} />
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Statistics */}
        <Card>
          <Card.Body>
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-4">
              Statistics
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Total Services</span>
                <span className="font-semibold">{client.stats.totalServices}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Active</span>
                <span className="font-semibold text-status-active-text">
                  {client.stats.activeServices}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Completed</span>
                <span className="font-semibold text-status-completed-text">
                  {client.stats.completedServices}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Cancelled</span>
                <span className="font-semibold text-status-cancelled-text">
                  {client.stats.cancelledServices}
                </span>
              </div>
              <hr className="border-neutral-200" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Total Revenue</span>
                <span className="font-semibold text-financial-positive">
                  {formatCurrency(client.stats.totalRevenue)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Total Margin</span>
                <span className="font-semibold">{formatCurrency(client.stats.totalMargin)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Avg. Margin</span>
                <span className="font-semibold">
                  {formatPercentage(client.stats.averageMarginPercentage)}%
                </span>
              </div>
            </div>
          </Card.Body>
        </Card>
        {/* Activity */}
        <Card>
          <Card.Body>
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-4">
              Activity
            </h2>
            <div className="space-y-4">
              {client.stats.lastServiceDate && (
                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-neutral-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-neutral-500">Last Service</p>
                    <p className="text-sm">
                      {format(new Date(client.stats.lastServiceDate), 'dd/MM/yyyy')}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-neutral-400 mt-0.5" />
                <div>
                  <p className="text-xs text-neutral-500">Created</p>
                  <p className="text-sm">
                    {format(new Date(client.createdAt), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-neutral-400 mt-0.5" />
                <div>
                  <p className="text-xs text-neutral-500">Last Modified</p>
                  <p className="text-sm">
                    {format(new Date(client.updatedAt), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
              </div>
            </div>
          </Card.Body>
        </Card>
        {/* Quick Actions */}
        <Card>
          <Card.Body>
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-4">
              Quick Actions
            </h2>
            <div className="space-y-2">
              <Button
                variant="primary"
                fullWidth
                icon={<Plus className="w-4 h-4" />}
                className="justify-start"
                asChild
              >
                <Link href={`/services/new?clientId=${client.id}`}>New Service</Link>
              </Button>
              {canEdit && (
                <Button
                  variant="secondary"
                  fullWidth
                  icon={<Edit className="w-4 h-4" />}
                  className="justify-start"
                  asChild
                >
                  <Link href={`/clients/${client.id}/edit`}>Edit Client</Link>
                </Button>
              )}
              <Button
                variant="secondary"
                fullWidth
                icon={<FileText className="w-4 h-4" />}
                className="justify-start"
                asChild
              >
                <Link href={`/invoices?clientId=${client.id}`}>View Invoices</Link>
              </Button>
              {canDelete && (
                <Button
                  variant="secondary"
                  fullWidth
                  icon={<Trash2 className="w-4 h-4" />}
                  className="justify-start text-danger hover:bg-danger/5"
                  onClick={() => setDeleteModalOpen(true)}
                >
                  Delete Client
                </Button>
              )}
            </div>
          </Card.Body>
        </Card>
      </div>

      {/* Delete Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Client"
        size="sm"
      >
        <Modal.Body>
          <Alert variant="warning">
            Are you sure you want to delete &quot;{client.name}&quot;?
            {client.stats.totalServices > 0 && (
              <p className="mt-2">
                This client has {client.stats.totalServices} services associated with it.
              </p>
            )}
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete Client
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
