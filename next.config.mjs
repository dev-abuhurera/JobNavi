/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@xenova/transformers', 'onnxruntime-node', 'pdf-parse'],
  },
  webpack: (config) => {
    config.infrastructureLogging = { level: 'error' };
    config.resolve.alias = {
      ...config.resolve.alias,
      'sharp$': false,
      'onnxruntime-node$': false,
    };
    return config;
  },
  async redirects() {
    return [{ source: '/', destination: '/dashboard', permanent: true }];
  },
};

export default nextConfig;