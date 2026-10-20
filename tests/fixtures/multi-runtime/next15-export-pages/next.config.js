module.exports = {
  output: 'export',
  // Fixture builds must not inherit the parent repository's ESLint configuration.
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true },
};
