/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@google/generative-ai'],
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
