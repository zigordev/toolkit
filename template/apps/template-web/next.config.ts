import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ['template-api-client'],
  logging: { browserToTerminal: false },
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
