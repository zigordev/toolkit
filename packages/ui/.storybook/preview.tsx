import '@fontsource-variable/mona-sans/wdth.css';
import '@fontsource-variable/jetbrains-mono';
import '../src/styles/index.css';
import type { Decorator, Preview } from '@storybook/react-vite';
import { defaultTheme, modes, themeAttributes } from '@zigordev/tokens';
import { configure } from 'storybook/test';

configure({ asyncUtilTimeout: 10_000 });

const applyMode: Decorator = (Story, { globals }) => {
  document.documentElement.setAttribute(
    themeAttributes.mode,
    String(globals.mode ?? defaultTheme.mode)
  );
  return <Story />;
};

const preview: Preview = {
  decorators: [applyMode],
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
  },
  initialGlobals: { ...defaultTheme },
  parameters: {
    a11y: { test: 'error' },
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default preview;
