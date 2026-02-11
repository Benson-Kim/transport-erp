/**
 * Prisma Configuration
 * Environment-aware datasource configuration for dev, staging, and production
 */

import { defineConfig, env } from 'prisma/config';


export default defineConfig({

    datasource: {
        // Primary URL — used for queries
        url: env("DATABASE_URL"),
        directUrl: env("DIRECT_URL"),
    },

    schema: './prisma/schema.prisma',

    migrations: {
        path: './prisma/migrations',
    },
});