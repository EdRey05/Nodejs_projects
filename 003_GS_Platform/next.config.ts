import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['192.168.2.14'],

  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },

};

export default nextConfig;
