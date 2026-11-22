import { SpanKind } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { describe, expect, it } from 'vitest';
import { privacySpanProcessor, removePersonalData } from './privacy.ts';

describe('removePersonalData', () => {
  it('removes what identifies a visitor', () => {
    const attributes = {
      'client.address': '203.0.113.9',
      'client.port': 52100,
      'network.peer.address': '203.0.113.9',
      'network.peer.port': 52100,
      'user_agent.original': 'Mozilla/5.0',
      'http.client_ip': '203.0.113.9',
      'http.user_agent': 'Mozilla/5.0',
      'net.peer.ip': '203.0.113.9',
      'net.peer.port': 52100,
      'net.sock.peer.addr': '203.0.113.9',
      'net.sock.peer.port': 52100,
      'http.request.method': 'GET',
      'http.route': '/api/v1/pools/:poolId',
      'http.response.status_code': 200,
    };

    removePersonalData(attributes);

    expect(attributes).toEqual({
      'http.request.method': 'GET',
      'http.route': '/api/v1/pools/:poolId',
      'http.response.status_code': 200,
    });
  });

  it('keeps of a web address only what comes before its query', () => {
    const attributes = {
      'url.full': 'https://api.example.com/v1/users?email=ada@example.com#profile',
      'url.query': 'email=ada@example.com',
      'url.path': '/v1/users',
      'http.url': 'https://api.example.com/v1/users?email=ada@example.com',
      'http.target': '/v1/users?email=ada@example.com',
    };

    removePersonalData(attributes);

    expect(attributes).toEqual({
      'url.full': 'https://api.example.com/v1/users',
      'url.path': '/v1/users',
      'http.url': 'https://api.example.com/v1/users',
      'http.target': '/v1/users',
    });
  });

  it('leaves an address without a query, and a value that is not text, as they are', () => {
    const attributes = { 'url.full': 'https://api.example.com/v1/users', 'http.target': 404 };

    removePersonalData(attributes);

    expect(attributes).toEqual({
      'url.full': 'https://api.example.com/v1/users',
      'http.target': 404,
    });
  });
});

describe('privacySpanProcessor', () => {
  it('cleans a span before the next processor exports it', async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new TracerProvider({
      spanProcessors: [privacySpanProcessor, new SimpleSpanProcessor({ exporter })],
    });
    const span = provider.getTracer('test').startSpan('GET /v1/users', {
      kind: SpanKind.SERVER,
      attributes: { 'client.address': '203.0.113.9', 'url.path': '/v1/users' },
    });
    span.setAttribute('url.query', 'email=ada@example.com');

    span.end();
    await provider.forceFlush();

    expect(exporter.getFinishedSpans().map((finished) => finished.attributes)).toEqual([
      { 'url.path': '/v1/users' },
    ]);
    await provider.shutdown();
  });
});
