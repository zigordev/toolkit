type Fetch = typeof globalThis.fetch;

const lateFetch: Fetch = (input, init) => globalThis.fetch(input, init);

function headersOf(input: Parameters<Fetch>[0], init: Parameters<Fetch>[1]): Headers {
  const headers = new Headers(
    typeof input === 'object' && 'headers' in input ? input.headers : undefined
  );
  new Headers(init?.headers).forEach((value, name) => {
    headers.set(name, value);
  });
  return headers;
}

export function withSession(cookie: () => Promise<string>, fetcher: Fetch = lateFetch): Fetch {
  return async (input, init) => {
    const headers = headersOf(input, init);
    const stored = await cookie();
    if (stored !== '') {
      headers.set('cookie', stored);
    }
    return fetcher(input, { ...init, headers, credentials: 'omit' });
  };
}
