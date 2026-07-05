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
    // #44: this stack stores images in Backblaze B2 (logos, documents) -
    // the previous AWS/Cloudinary patterns matched nothing we serve and
    // would have blocked real B2-hosted images. Custom endpoints/CDNs
    // register their hostnames via env at build time.
    remotePatterns: [
      { protocol: 'https' as const, hostname: '**.backblazeb2.com' },
      ...(process.env['B2_PUBLIC_HOSTNAME']
        ? [{ protocol: 'https' as const, hostname: process.env['B2_PUBLIC_HOSTNAME'] }]
        : []),
      ...(process.env['B2_CDN_HOSTNAME']
        ? [{ protocol: 'https' as const, hostname: process.env['B2_CDN_HOSTNAME'] }]
        : []),
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
    // #44: the @svgr/webpack rule was removed - the loader was never in
    // package.json, so any SVG-as-component import failed the build. No
    // call sites import .svg as components today. If the need appears,
    // add @svgr/webpack as a LOCKED devDependency (the #59 lockfile pass)
    // and restore the rule in the same MR.

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
