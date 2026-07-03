'use client';

/**
 * Loading-order PDF controls (#34).
 *
 * Generate/Regenerate is rendered only when the caller holds
 * documents:create (capability derived server-side by the page from the
 * PERMISSION_MATRIX); the server action enforces the same gate again -
 * the button is a convenience, never the authorization. Download fetches a
 * short-lived presigned URL through the gated action; no storage key ever
 * reaches this component.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileText, RefreshCw } from 'lucide-react';

import { generateLoadingOrderPdf, getLoadingOrderPdfUrl } from '@/actions/document-actions';
import { Badge, Button, Card, CardBody } from '@/components/ui';

interface LoadingOrderPdfPanelProps {
  loadingOrderId: string;
  hasPdf: boolean;
  canGenerate: boolean;
}

export function LoadingOrderPdfPanel({
  loadingOrderId,
  hasPdf,
  canGenerate,
}: Readonly<LoadingOrderPdfPanelProps>) {
  const router = useRouter();
  const [isGenerating, startTransition] = useTransition();
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateLoadingOrderPdf(loadingOrderId);
      if (!result.success) {
        setError(result.error ?? 'Failed to generate the PDF');
        return;
      }
      router.refresh();
    });
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    setError(null);
    try {
      const result = await getLoadingOrderPdfUrl(loadingOrderId);
      if (!result.success || !result.data) {
        setError(result.error ?? 'Failed to prepare the PDF download');
        return;
      }
      window.open(result.data.url, '_blank', 'noopener,noreferrer');
    } catch (downloadError) {
      console.error('Failed to download loading order PDF:', downloadError);
      setError('Failed to prepare the PDF download');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <h3 className="font-semibold">PDF document</h3>
            {hasPdf ? <Badge variant="completed">Available</Badge> : <Badge>Not generated</Badge>}
          </div>

          <div className="flex items-center gap-2">
            {hasPdf && (
              <Button size="sm" onClick={handleDownload} loading={isDownloading}>
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            )}
            {canGenerate && (
              <Button
                size="sm"
                variant={hasPdf ? 'ghost' : 'primary'}
                onClick={handleGenerate}
                loading={isGenerating}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                {hasPdf ? 'Regenerate' : 'Generate PDF'}
              </Button>
            )}
          </div>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {!hasPdf && !canGenerate && (
          <p className="mt-2 text-sm text-muted-foreground">
            No PDF has been generated for this loading order yet.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
