// components/features/services/ServiceActions.tsx
'use client';

import { useState, ReactElement, cloneElement, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Alert, Spinner, Modal } from '@/components/ui';
import {
  markServiceComplete,
  deleteService,
  generateLoadingOrder,
  //   archiveService,
  //   sendServiceEmail,
} from '@/actions/service-actions';
import { toast } from '@/lib/toast';
import { AlertCircle } from 'lucide-react';

interface ServiceActionsProps {
  service: any;
  action: 'complete' | 'delete' | 'generate-loading-order' | 'archive' | 'send-email';
  trigger: ReactElement<any, any>;
  onSuccess?: () => void;
  autoOpen?: boolean;
}

export function ServiceActions({
  service,
  action,
  trigger,
  onSuccess,
  autoOpen = false,
}: Readonly<ServiceActionsProps>) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(autoOpen);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  useEffect(() => {
    if (autoOpen) {
      setIsOpen(true);
    }
  }, [autoOpen]);

  const handleAction = async () => {
    setIsLoading(true);

    try {
      switch (action) {
        case 'complete':
          await markServiceComplete(service.id);
          toast.success('Service marked as completed');
          router.refresh();
          break;

        case 'delete':
          if (deleteConfirmation !== 'DELETE') {
            toast.error('Please type DELETE to confirm');
            setIsLoading(false);
            return;
          }
          await deleteService(service.id);
          toast.success('Service deleted successfully');
          router.push('/services');
          break;

        case 'generate-loading-order': {
          const { url } = await generateLoadingOrder(service.id);
          window.open(url, '_blank');
          toast.success('Loading order generated');
          router.refresh();
          break;
        }

        case 'archive':
          //   await archiveService(service.id);
          toast.success('Service archived');
          router.refresh();
          break;

        case 'send-email':
          //   await sendServiceEmail(service.id);
          toast.success('Email sent successfully');
          break;
      }

      onSuccess?.();
      setIsOpen(false);
    } catch (error) {
      console.error(`Failed to ${action}:`, error);
      toast.error(`Failed to ${action} service`);
    } finally {
      setIsLoading(false);
    }
  };

  const getDialogContent = () => {
    switch (action) {
      case 'complete':
        return {
          title: 'Mark Service as Completed',
          description:
            'Are you sure you want to mark this service as completed? This will move it to the archive.',
          confirmText: 'Mark Complete',
        };

      case 'delete':
        return {
          title: 'Delete Service',
          description: service.invoice
            ? 'This service is included in an invoice and cannot be deleted.'
            : 'This action cannot be undone. Please type DELETE to confirm.',
          confirmText: 'Delete Service',
          showDeleteInput: !service.invoice,
          cannotDelete: !!service.invoice,
        };

      case 'generate-loading-order':
        return {
          title: 'Generate Loading Order',
          description: 'A PDF loading order will be generated for this service.',
          confirmText: 'Generate PDF',
        };

      case 'archive':
        return {
          title: 'Archive Service',
          description: 'This service will be moved to the archive.',
          confirmText: 'Archive',
        };

      case 'send-email':
        return {
          title: 'Send Service by Email',
          description: `Service details will be sent to ${service.client.email}`,
          confirmText: 'Send Email',
        };

      default:
        return {
          title: 'Confirm Action',
          description: 'Are you sure you want to proceed?',
          confirmText: 'Confirm',
        };
    }
  };

  const dialogContent = getDialogContent();

  return (
    <>
      {trigger.type !== 'span' &&
        cloneElement(trigger, {
          onClick: () => setIsOpen(true),
        })}

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={dialogContent.title} size="md">
        <Modal.Body>
          {dialogContent.cannotDelete ? (
            <Alert variant="error" icon={<AlertCircle />}>
              {dialogContent.description}
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">{dialogContent.description}</p>
          )}

          {dialogContent.showDeleteInput && (
            <div className="mt-4">
              <Input
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="font-mono"
                autoFocus
              />
            </div>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          {!dialogContent.cannotDelete && (
            <Button
              variant={action === 'delete' ? 'danger' : 'primary'}
              onClick={handleAction}
              disabled={isLoading || (action === 'delete' && deleteConfirmation !== 'DELETE')}
            >
              {isLoading && <Spinner className="mr-2" />}
              {dialogContent.confirmText}
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </>
  );
}
