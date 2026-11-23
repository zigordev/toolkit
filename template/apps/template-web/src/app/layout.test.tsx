import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RootLayout, { metadata } from './layout.tsx';

describe('the root layout', () => {
  it('wraps every page in an English document', () => {
    const html = renderToStaticMarkup(<RootLayout>page</RootLayout>);

    expect(html).toBe('<html lang="en"><head></head><body>page</body></html>');
    expect(metadata.title).toBe('Template');
  });
});
