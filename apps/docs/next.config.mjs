import { createMDX } from 'fumadocs-mdx/next';

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: 'standalone',
  async redirects() {
    return [
      {
        source: '/omniscribe/:path*',
        destination: '/:path*',
        permanent: true,
      },
      {
        source: '/intro',
        destination: '/docs',
        permanent: true,
      },
      {
        source: '/sdk/:path*',
        destination: '/docs/sdk/:path*',
        permanent: true,
      },
    ];
  },
};

const withMDX = createMDX();

export default withMDX(config);
