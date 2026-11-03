/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Playwright and axe-core as Node server dependencies. Bundling them
  // can inject CommonJS `module` references into axe's browser-side script.
  serverExternalPackages: ['@axe-core/playwright', 'playwright', 'axe-core'],
};

export default nextConfig;
