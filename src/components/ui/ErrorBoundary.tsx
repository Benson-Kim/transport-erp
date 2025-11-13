'use client';

import React from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { Alert, Button } from '@/components/ui';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  override state: Readonly<State> = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  reset = (): void => this.setState({ hasError: false, error: null });

  override render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      // Default fallback
      return (
        <Alert
          variant="error"
          icon={<AlertCircle className="h-4 w-4" />}
          action={
            <Button
              size="sm"
              variant="secondary"
              className="ml-2"
              icon={<RefreshCcw className="h-4 w-4" />}
              onClick={this.reset}
            >
              Retry
            </Button>
          }
        >
          Something went wrong
        </Alert>
      );
    }

    return this.props.children;
  }
}
