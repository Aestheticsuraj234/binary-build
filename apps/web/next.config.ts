import type {NextConfig} from 'next';

import {API_URL} from './lib/api-url';

const nextConfig: NextConfig = {
  cacheComponents: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  // Send auth requests to the API through this app. The browser then sees the
  // session cookie as coming from the web app itself.
  rewrites() {
    return [
      {source: '/api/auth/:path*', destination: `${API_URL}/api/auth/:path*`},
    ];
  },
};

export default nextConfig;
