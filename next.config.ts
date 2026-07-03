import type { NextConfig } from 'next';
import createBundleAnalyzer from '@next/bundle-analyzer';

import { securityHeadersForEnv } from './src/lib/security-headers';

const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env['ANALYZE'] === 'true',
});

type NextImageFormats = NonNullable<NonNullable<NextConfig['images']>['formats']>;
const imageFormats: NextImageFormats = ['image/avif', 'image/webp'];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
      allowedOrigins: (process.env['ALLOWED_ORIGINS']
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) as string[]) || ['localhost:3000'],
    },
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns'],
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudinary.com' },
    ],
    formats: imageFormats,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  async headers() {
    // #24: headers apply in EVERY environment so CSP breakage surfaces in
    // dev; HSTS alone is production-only (it would pin http://localhost to
    // HTTPS). securityHeadersForEnv is the unit-tested authority.
    return [
      {
        source: '/:path*',
        headers: securityHeadersForEnv(process.env['NODE_ENV'] === 'production'),
      },
    ];
  },

  async redirects() {
    return [
      {
        source: '/',
        destination: '/dashboard',
        permanent: false,
      },
    ];
  },

  webpack: (config, { isServer }) => {
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      use: [
        {
          loader: '@svgr/webpack',
          options: { svgo: true, titleProp: true, ref: true },
        },
      ],
    });

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
      };
    }

    config.plugins.push(
      new (require('webpack').NormalModuleReplacementPlugin)(/^node:/, (resource: any) => {
        resource.request = resource.request.replace(/^node:/, '');
      })
    );

    return config;
  },

  env: {
    NEXT_PUBLIC_APP_URL: process.env['NEXT_PUBLIC_APP_URL'],
    NEXT_PUBLIC_APP_NAME: process.env['NEXT_PUBLIC_APP_NAME'],
  },

  poweredByHeader: false,

  compress: true,

  generateEtags: true,

  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],

  trailingSlash: false,

  output: "standalone",
};

export default withBundleAnalyzer(nextConfig);
