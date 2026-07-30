/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
  webpack: (config) => {
    config.infrastructureLogging = { level: 'error' };
    return config;
  },
  async redirects() {
    return [{ source: '/', destination: '/dashboard', permanent: true }]
  },
};

export default nextConfig;