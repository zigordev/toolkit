import { describe, expect, it } from 'vitest';
import { appOrigin, appOriginHeader } from './app-origin.ts';

type OnRequest = (request: Request, context: unknown) => Promise<{ request: Request } | undefined>;

const onRequest = appOrigin().onRequest as unknown as OnRequest;

function post(headers: Record<string, string>): Request {
  return new Request('https://notes.example.com/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email: 'ada@example.com' }),
  });
}

describe('appOrigin', () => {
  it("gives a request from the app the app's origin, and keeps its body", async () => {
    const result = await onRequest(post({ [appOriginHeader]: 'notes://' }), {});

    expect(result?.request.headers.get('origin')).toBe('notes://');
    expect(await result?.request.json()).toEqual({ email: 'ada@example.com' });
  });

  it("leaves a browser's own origin as it is", async () => {
    const result = await onRequest(
      post({ origin: 'https://notes.example.com', [appOriginHeader]: 'notes://' }),
      {}
    );

    expect(result).toBeUndefined();
  });

  it('leaves a request without the header as it is', async () => {
    expect(await onRequest(post({}), {})).toBeUndefined();
  });
});
