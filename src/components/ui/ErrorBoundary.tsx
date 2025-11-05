'use client';

import React from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
            {this.props.fallback || 'Something went wrong'}
            <Button
              size="sm"
              variant="secondary"
              className="ml-2"
              onClick={() => this.setState({ hasError: false })}
            >
              Retry
            </Button>
        </Alert>
      );
    }

    return this.props.children;
  }
}