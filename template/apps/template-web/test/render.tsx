import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { type Locale, timeZone } from '../src/i18n/locales.ts';
import { messagesOf } from '../src/i18n/messages.ts';

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

let mounted: { readonly root: Root; readonly container: HTMLElement }[] = [];

export async function render(node: ReactNode, locale: Locale = 'en'): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale={locale} messages={messagesOf(locale)} timeZone={timeZone}>
        <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
      </NextIntlClientProvider>
    );
  });
  mounted.push({ root, container });
  return container;
}

export function cleanup(): void {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
}
