import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['mongodb'],
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
