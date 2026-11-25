import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  logging: { browserToTerminal: false },
};

export default nextConfig;
