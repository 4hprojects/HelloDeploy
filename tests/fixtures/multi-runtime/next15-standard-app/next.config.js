/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fixture builds must not inherit the parent repository's ESLint configuration.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
