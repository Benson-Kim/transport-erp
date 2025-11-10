/**
 * Bulk Actions Component
 * Actions for multiple selected services
 */

'use client';

import { useState } from 'react';
import { UserRole } from '@/app/generated/prisma';
import { 
  Trash2, 
  CheckCircle, 
  FileText, 
  // X,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import { 
  bulkUpdateServices, 
  bulkDeleteServices,
  generateBulkLoadingOrders,
} from '@/actions/service-actions';
import { toast } from '@/lib/toast';
import { Alert, Button, Modal } from '@/components/ui';
import { cn } from '@/lib/utils/cn';

interface BulkActionsProps {
  selectedCount: number;
  selectedIds: string[];
  onClear: () => void;
  userRole: UserRole;
  className?: string;
}

export function BulkActions({
  selectedCount,
  selectedIds,
  onClear,
  userRole,
  className,
}: BulkActionsProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // const canEdit = hasPermission(userRole, 'services', 'edit');
  const canDelete = hasPermission(userRole, 'services', 'delete');
  const canMarkCompleted = hasPermission(userRole, 'services', 'mark_completed');
  const canGenerateOrders = hasPermission(userRole, 'loading_orders', 'create');

  const handleMarkCompleted = async () => {
    setIsProcessing(true);
    try {
      await bulkUpdateServices(selectedIds, { status: 'COMPLETED' });
      toast.success(`${selectedCount} service${selectedCount !== 1 ? 's' : ''} marked as completed`);
      onClear();
    } catch (error) {
      toast.error('Failed to update services');
      console.error('Failed to mark services as completed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateLoadingOrders = async () => {
    setIsProcessing(true);
    try {
      const result = await generateBulkLoadingOrders(selectedIds);
      toast.success(`Generated ${result.count} loading order${result.count !== 1 ? 's' : ''}`);
      onClear();
    } catch (error) {
      toast.error('Failed to generate loading orders');
      console.error('Failed to generate loading orders:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== 'DELETE') {
      toast.error('Please type DELETE to confirm');
      return;
    }

    setIsDeleting(true);
    try {
      await bulkDeleteServices(selectedIds);
      toast.success(`${selectedCount} service${selectedCount !== 1 ? 's' : ''} deleted`);
      onClear();
      setShowDeleteDialog(false);
      setDeleteConfirmText('');
    } catch (error) {
      toast.error('Failed to delete services');
      console.error('Failed to delete services:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCloseDeleteDialog = () => {
    setShowDeleteDialog(false);
    setDeleteConfirmText('');
  };

  // Don't render if nothing is selected
  if (selectedCount === 0) return null;

  // Check if any actions are available
  const hasAnyAction = canMarkCompleted || canGenerateOrders || canDelete;

  return (
    <>
      <Alert 
        variant="info"
        icon={Info}
        className={cn("animate-in slide-in-from-top-2 fade-in duration-300", className)}
        dismissible
        onDismiss={onClear}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium text-sm">
            {selectedCount} {selectedCount === 1 ? 'service' : 'services'} selected
          </span>
          
          {hasAnyAction && (
            <div className="flex flex-wrap items-center gap-2">
              {canMarkCompleted && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleMarkCompleted}
                  disabled={isProcessing}
                  className="group"
                >
                  <CheckCircle className="mr-1.5 h-4 w-4 group-hover:scale-110 transition-transform" />
                  Mark Completed
                </Button>
              )}
              
              {canGenerateOrders && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleGenerateLoadingOrders}
                  disabled={isProcessing}
                  className="group"
                >
                  <FileText className="mr-1.5 h-4 w-4 group-hover:scale-110 transition-transform" />
                  Generate Orders
                </Button>
              )}
              
              {canDelete && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isProcessing}
                  className="group"
                >
                  <Trash2 className="mr-1.5 h-4 w-4 group-hover:scale-110 transition-transform" />
                  Delete
                </Button>
              )}
            </div>
          )}
        </div>
      </Alert>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteDialog}
        onClose={handleCloseDeleteDialog}
        title="Confirm Bulk Deletion"
        description={`You are about to permanently delete ${selectedCount} service${selectedCount !== 1 ? 's' : ''}. This action cannot be undone.`}
        size="md"
        closeOnEscape={!isDeleting}
        closeOnBackdrop={!isDeleting}
      >
        <Modal.Body>
          <div className="space-y-4">
            {/* Warning Alert */}
            <Alert variant="warning" icon={AlertTriangle}>
              <div className="space-y-2">
                <p className="font-medium">
                  Warning: This will permanently delete the following:
                </p>
                <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                  <li>{selectedCount} service record{selectedCount !== 1 ? 's' : ''}</li>
                  <li>All associated data and history</li>
                  <li>Related loading orders (if any)</li>
                </ul>
              </div>
            </Alert>

            {/* Confirmation Input */}
            <div className="space-y-2">
              <label htmlFor="delete-confirmation" className="block text-sm font-medium text-neutral-700">
                Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm:
              </label>
              <input
                id="delete-confirmation"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg transition-colors",
                  "focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent",
                  deleteConfirmText === 'DELETE' 
                    ? "border-green-500 bg-green-50" 
                    : "border-neutral-300 hover:border-neutral-400"
                )}
                placeholder="Type DELETE"
                autoComplete="off"
                disabled={isDeleting}
              />
              {deleteConfirmText && deleteConfirmText !== 'DELETE' && (
                <p className="text-xs text-red-600">
                  Please type DELETE exactly to confirm
                </p>
              )}
            </div>

            {/* Service Count Reminder */}
            <div className="p-3 bg-neutral-50 rounded-lg">
              <p className="text-sm text-neutral-600">
                You are deleting <span className="font-bold text-red-600">{selectedCount}</span> service{selectedCount !== 1 ? 's' : ''}.
                {selectedCount > 10 && (
                  <span className="block mt-1 text-xs text-red-600 font-medium">
                    This is a large number of services. Please double-check before proceeding.
                  </span>
                )}
              </p>
            </div>
          </div>
        </Modal.Body>

        <Modal.Footer>
          <Button
            variant="ghost"
            onClick={handleCloseDeleteDialog}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={deleteConfirmText !== 'DELETE' || isDeleting}
            className="min-w-[120px]"
          >
            {isDeleting ? (
              <>
                <span className="inline-block animate-spin mr-2">⏳</span>
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete {selectedCount} Service{selectedCount !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}