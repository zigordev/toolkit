import { afterEach, describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => ({ cookie: undefined as string | undefined, language: '' }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'template.locale' && request.cookie !== undefined
        ? { name, value: request.cookie }
        : undefined,
  }),
  headers: async () => new Headers({ 'accept-language': request.language }),
}));

afterEach(() => {
  request.cookie = undefined;
  request.language = '';
});

async function configFor(): Promise<{ locale: string; messages: { language: { label: string } } }> {
  const { default: config } = await import('./request.ts');
  return (await (config as unknown as () => Promise<unknown>)()) as {
    locale: string;
    messages: { language: { label: string } };
  };
}

describe('the request config', () => {
  it("gives the browser's language and its messages", async () => {
    request.language = 'es-ES,es;q=0.9';

    const config = await configFor();

    expect(config.locale).toBe('es');
    expect(config.messages.language.label).toBe('Idioma');
  });

  it('gives the language the person chose in the cookie', async () => {
    request.language = 'es';
    request.cookie = 'en';

    const config = await configFor();

    expect(config.locale).toBe('en');
    expect(config.messages.language.label).toBe('Language');
  });
});
