/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@google/generative-ai'],
  },
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
