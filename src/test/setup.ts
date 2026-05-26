import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Cleanup DOM after each test
afterEach(() => {
  cleanup();
});
