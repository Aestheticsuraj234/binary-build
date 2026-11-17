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
  // Send API requests through this app. The browser then sees the session
  // cookie as coming from the web app itself, and never talks to the API
  // directly.
  rewrites() {
    return [{source: '/api/:path*', destination: `${API_URL}/api/:path*`}];
  },
};

export default nextConfig;
