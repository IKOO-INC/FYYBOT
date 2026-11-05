import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['mongodb'],
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Keep route handlers light; heavy work lives in the worker process.
    serverActions: { bodySizeLimit: '12mb' },
  },
}

export default nextConfig
