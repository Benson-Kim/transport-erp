import type { Config } from 'jest';

/**
 * Jest configuration.
 *
 * - `node` test environment: these suites exercise server code and the database
 *   layer, not the DOM.
 * - ts-jest transforms TypeScript (installed --no-save in CI's test-db job;
 *   see .gitlab-ci.yml - pending a local package-lock.json regeneration).
 * - The `@/` path alias mirrors tsconfig.json so imports resolve in tests.
 *
 * The database integration suite lives under tests/db and requires a live
 * Postgres (DATABASE_URL). It is run explicitly via `npm run test:db`.
 */
const config: Config = {
  testEnvironment: 'node',
  preset: 'ts-jest',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
};

export default config;
