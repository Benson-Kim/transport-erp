// next.config.ts
import type { NextConfig } from "next";
import createBundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env['ANALYZE'] === "true",
});

// Security headers for production
const securityHeaders: { key: string; value: string }[] = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Derive the exact ImageFormat[] type from NextConfig
type NextImageFormats = NonNullable<NonNullable<NextConfig["images"]>["formats"]>;
const imageFormats: NextImageFormats = ["image/avif", "image/webp"];

const nextConfig: NextConfig = {
  // Enable React strict mode for better development warnings
  reactStrictMode: true,

  // Experimental features
  experimental: {
    // Server Actions configuration
    serverActions: {
      bodySizeLimit: "2mb",
      allowedOrigins:
        (process.env['ALLOWED_ORIGINS']?.split(",")
          .map((s) => s.trim())
          .filter(Boolean) as string[]) || ["localhost:3000"],
    },
    // Optimize package imports
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
  },

  // Image optimization configuration
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.cloudinary.com" },
    ],
    formats: imageFormats,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Headers configuration
  async headers() {
    if (process.env['NODE_ENV'] !== "production") return [];
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },

  // Redirects configuration
  async redirects() {
    return [
      {
        source: "/",
        destination: "/dashboard",
        permanent: false,
      },
    ];
  },

  // Webpack configuration
  webpack: (config, { isServer }) => {
    // Import SVGs as React components via SVGR
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      use: [
        {
          loader: "@svgr/webpack",
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
      };
    }

    return config;
  },

  // Environment variables to expose to the browser
  env: {
    NEXT_PUBLIC_APP_URL: process.env['NEXT_PUBLIC_APP_URL'],
    NEXT_PUBLIC_APP_NAME: process.env['NEXT_PUBLIC_APP_NAME'],
  },

  // PoweredByHeader removes the X-Powered-By header
  poweredByHeader: false,

  // Compress responses
  compress: true,

  // Generate ETags for pages
  generateEtags: true,

  // Page extensions
  pageExtensions: ["tsx", "ts", "jsx", "js"],

  // Trailing slash configuration
  trailingSlash: false,

  // Output configuration
  // output: "standalone",
};

export default withBundleAnalyzer(nextConfig);