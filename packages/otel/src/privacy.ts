import type { Attributes } from '@opentelemetry/api';
import type { SpanProcessor } from '@opentelemetry/sdk-trace';

const removed = [
  'client.address',
  'client.port',
  'network.peer.address',
  'network.peer.port',
  'url.query',
  'user_agent.original',
  'http.client_ip',
  'http.user_agent',
  'net.peer.ip',
  'net.peer.port',
  'net.sock.peer.addr',
  'net.sock.peer.port',
];

const addresses = ['url.full', 'http.url', 'http.target'];

const queryOrFragment = /[?#].*$/s;

export function removePersonalData(attributes: Attributes): void {
  for (const key of removed) {
    delete attributes[key];
  }
  for (const key of addresses) {
    const value = attributes[key];
    if (typeof value === 'string') {
      attributes[key] = value.replace(queryOrFragment, '');
    }
  }
}

export const privacySpanProcessor: SpanProcessor = {
  onStart: () => undefined,
  onEnd: (span) => removePersonalData(span.attributes),
  forceFlush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
};
