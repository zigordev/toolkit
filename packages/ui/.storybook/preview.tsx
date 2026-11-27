import '@fontsource-variable/mona-sans/wdth.css';
import '@fontsource-variable/jetbrains-mono';
import '../src/styles/index.css';
import type { Decorator, Preview } from '@storybook/react-vite';
import { defaultTheme, modes, products, themeAttributes } from '@zigordev/tokens';
import { configure } from 'storybook/test';

configure({ asyncUtilTimeout: 10_000 });

const applyTheme: Decorator = (Story, { globals }) => {
  const root = document.documentElement;
  root.setAttribute(themeAttributes.mode, String(globals.mode ?? defaultTheme.mode));
  const product = products.find((name) => name === globals.product);
  if (product) {
    root.setAttribute(themeAttributes.product, product);
  } else {
    root.removeAttribute(themeAttributes.product);
  }
  return <Story />;
};

const preview: Preview = {
  decorators: [applyTheme],
  globalTypes: {
    mode: {
      description: 'Mode',
      toolbar: {
        title: 'Mode',
        icon: 'mirror',
        items: [...modes, 'system'].map((value) => ({ value, title: value })),
        dynamicTitle: true,
      },
    },
    product: {
      description: 'Product colours',
      toolbar: {
        title: 'Product',
        icon: 'paintbrush',
        items: [
          { value: 'template', title: 'template' },
          ...products.map((value) => ({ value, title: value })),
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { product: 'template', ...defaultTheme },
  parameters: {
    a11y: { test: 'error' },
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default preview;
