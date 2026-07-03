'use client';

/**
 * Invoice PDF controls (#34 follow-up).
 *
 * Wires the invoice detail page into the server-side PDF pipeline
 * (generateInvoicePdf). Generate/Regenerate renders only when the caller
 * holds documents:create (capability derived server-side by the page); the
 * server action enforces invoices:view + documents:create again - the
 * button is a convenience, never the authorization. Download fetches a
 * short-lived presigned URL through the gated getDocumentDownloadUrl
 * action (INVOICE-type documents re-check invoices:view); no storage key
 * ever reaches this component. Same shape as LoadingOrderPdfPanel.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileText, RefreshCw } from 'lucide-react';

import { generateInvoicePdf, getDocumentDownloadUrl } from '@/actions/document-actions';
import { Badge, Button, Card, CardBody } from '@/components/ui';

interface InvoicePdfPanelProps {
  invoiceId: string;
  /** Live INVOICE Document row id; null until a PDF has been generated. */
  pdfDocumentId: string | null;
  canGenerate: boolean;
}

export function InvoicePdfPanel({
  invoiceId,
  pdfDocumentId,
  canGenerate,
}: Readonly<InvoicePdfPanelProps>) {
  const router = useRouter();
  const [isGenerating, startTransition] = useTransition();
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPdf = pdfDocumentId !== null;

  const handleGenerate = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateInvoicePdf(invoiceId);
      if (!result.success) {
        setError(result.error ?? 'Failed to generate the PDF');
        return;
      }
      router.refresh();
    });
  };

  const handleDownload = async () => {
    if (!pdfDocumentId) return;
    setIsDownloading(true);
    setError(null);
    try {
      const result = await getDocumentDownloadUrl(pdfDocumentId, 'download');
      if (!result.success || !result.data) {
        setError(result.error ?? 'Failed to prepare the PDF download');
        return;
      }
      window.open(result.data.url, '_blank', 'noopener,noreferrer');
    } catch (downloadError) {
      console.error('Failed to download invoice PDF:', downloadError);
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
                variant={hasPdf ? 'ghost' : undefined}
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
            No PDF has been generated for this invoice yet.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
