// components/features/services/RelatedDocuments.tsx
'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardBody, Button,  EmptyState } from '@/components/ui';
import { 
  FileText, 
  Download, 
  Eye,
  File,
  Calendar,
  
  FileCheck,
  Receipt,
  ScrollText,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { DocumentType } from '@prisma/client';

interface Document {
  id: string;
  documentType: DocumentType;
  documentNumber?: string | null;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  description?: string | null;
  uploadedBy: string;
  uploadedAt: string | Date;
}

interface RelatedDocumentsProps {
  serviceId: string;
  documents: Document[];
}

export function RelatedDocuments({ serviceId, documents = [] }: RelatedDocumentsProps) {
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  const handleDownload = async (doc: Document) => {
    setIsDownloading(doc.id);
    try {
      // In production, you might want to use a signed URL or API endpoint
      // For now, open the file path in a new tab
      window.open(doc.filePath, '_blank');
    } catch (error) {
      console.error('Failed to download document:', error);
    } finally {
      setIsDownloading(null);
    }
  };

  const handleView = (doc: Document) => {
    // For PDFs and images, open in new tab
    // For other types, trigger download
    if (doc.mimeType.includes('pdf') || doc.mimeType.includes('image')) {
      window.open(doc.filePath, '_blank');
    } else {
      handleDownload(doc);
    }
  };

  const getDocumentIcon = (type: DocumentType) => {
    switch (type) {
      case 'LOADING_ORDER': return FileText;
      case 'INVOICE': return FileCheck;
      case 'RECEIPT': return Receipt;
      case 'DELIVERY_NOTE': return ScrollText;
      case 'CONTRACT': return File;
      default: return File;
    }
  };

  const getDocumentColor = (type: DocumentType) => {
    switch (type) {
      case 'LOADING_ORDER': return 'text-blue-600';
      case 'INVOICE': return 'text-green-600';
      case 'RECEIPT': return 'text-purple-600';
      case 'DELIVERY_NOTE': return 'text-orange-600';
      case 'CONTRACT': return 'text-indigo-600';
      default: return 'text-gray-600';
    }
  };

  const getDocumentLabel = (type: DocumentType, documentNumber?: string | null) => {
    switch (type) {
      case 'LOADING_ORDER': return 'Loading Order';
      case 'INVOICE': return documentNumber ? `Invoice ${documentNumber}` : 'Invoice';
      case 'RECEIPT': return documentNumber ? `Receipt ${documentNumber}` : 'Receipt';
      case 'DELIVERY_NOTE': return 'Delivery Note';
      case 'CONTRACT': return 'Contract';
      default: return 'Document';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Card>
      <CardBody>
        <h3 className="font-semibold mb-4 flex items-center">
          <FileText className="h-4 w-4 mr-2" />
          Related Documents
        </h3>
        
        {documents.length === 0 ? (
          <EmptyState
            variant="custom"
            icon={<FileText className="h-8 w-8 text-neutral-400" />}
            title="No documents"
            description="No documents have been uploaded for this service yet."
          />
        ) : (
          <div className="space-y-3">
            {documents.map(doc => {
              const Icon = getDocumentIcon(doc.documentType);
              const color = getDocumentColor(doc.documentType);
              const isPDF = doc.mimeType === 'application/pdf';
              const isViewable = isPDF || doc.mimeType.includes('image');
              
              return (
                <div
                  key={doc.id}
                  className="p-3 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <Icon className={cn("h-5 w-5 mt-0.5", color)} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {getDocumentLabel(doc.documentType, doc.documentNumber)}
                        </p>
                        
                        {doc.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {doc.description}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <div className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {format(new Date(doc.uploadedAt), 'dd MMM yyyy')}
                          </div>
                          <div>
                            {formatFileSize(doc.fileSize)}
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {doc.fileName}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 ml-2">
                      {isViewable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleView(doc)}
                          title="View document"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(doc)}
                        loading={isDownloading === doc.id}
                        title="Download document"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}