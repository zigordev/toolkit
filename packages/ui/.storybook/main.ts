import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

export const prebundled = [
  '@base-ui/react/autocomplete',
  '@base-ui/react/button',
  '@base-ui/react/dialog',
  '@base-ui/react/drawer',
  '@base-ui/react/field',
  '@base-ui/react/menu',
  '@base-ui/react/use-render',
  'lucide-react',
  'react-dom/server',
];

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  core: {
    disableTelemetry: true,
  },
  viteFinal: (viteConfig) => mergeConfig(viteConfig, { optimizeDeps: { include: prebundled } }),
};

export default config;
