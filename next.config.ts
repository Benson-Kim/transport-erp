import createBundleAnalyzer from '@next/bundle-analyzer';

import type { NextConfig } from 'next';

const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env['ANALYZE'] === 'true',
});

/**
 * Content-Security-Policy.
 *
 * Next.js App Router injects inline bootstrap/hydration scripts and styled
 * content, so 'unsafe-inline' is required for script/style until a per-request
 * nonce is wired through the middleware. This is a pragmatic baseline that
 * blocks external script injection and framing; nonce-based hardening of
 * script-src is tracked as a follow-up. connect/img allow self + B2 + Google
 * (avatars) which the app actually uses.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.backblazeb2.com https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.backblazeb2.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
]
  .join('; ');

const securityHeaders: { key: string; value: string }[] = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

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
      // Backblaze B2 is the actual object store for uploads (logos, docs).
      { protocol: 'https', hostname: '**.backblazeb2.com' },
      // Google account avatars for OAuth users.
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
    formats: imageFormats,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
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
