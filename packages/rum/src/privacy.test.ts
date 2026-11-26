import { type Meta, type TransportItem, TransportItemType } from '@grafana/faro-web-sdk';
import { describe, expect, it } from 'vitest';
import { protectItem, scrubUrl } from './privacy.ts';

const meta: Meta = {
  app: { name: 'template-web', version: '1.2.3', environment: 'test' },
  page: { url: 'https://template.test/notes/7?email=jane%40example.com#token=secret' },
  user: { email: 'jane@example.com', id: '7' },
};

const interactions = new Set(['note.created']);

function event(
  name: string,
  attributes?: Record<string, string>,
  action?: { name: string; parentId: string }
): TransportItem {
  return {
    type: TransportItemType.EVENT,
    payload: { name, timestamp: '2026-11-20T19:00:00.000Z', attributes, action },
    meta,
  };
}

function trace(attributes: { key: string; value: { stringValue?: string; intValue?: number } }[]) {
  return {
    type: TransportItemType.TRACE,
    payload: {
      resourceSpans: [
        {
          resource: { attributes: [], droppedAttributesCount: 0 },
          scopeSpans: [
            {
              scope: { name: '@opentelemetry/instrumentation-fetch' },
              spans: [
                {
                  traceId: '0cd36ca3fdebb7ba3115d5b6e69b184c',
                  spanId: '9c68c64327778da7',
                  name: 'GET',
                  kind: 3,
                  startTimeUnixNano: '1795201989039000000',
                  endTimeUnixNano: '1795201989044000000',
                  attributes,
                  droppedAttributesCount: 0,
                  events: [],
                  droppedEventsCount: 0,
                  status: { code: 0 },
                  links: [],
                  droppedLinksCount: 0,
                },
              ],
            },
          ],
        },
      ],
    },
    meta,
  } satisfies TransportItem;
}

function names(items: (TransportItem | null)[]): string[] {
  return items.flatMap((item) => (item ? [(item.payload as { name: string }).name] : []));
}

describe('scrubUrl', () => {
  it('keeps only the origin and path of a web address', () => {
    expect(scrubUrl('https://jane:pw@template.test/notes/7?email=jane%40example.com#x')).toBe(
      'https://template.test/notes/7'
    );
    expect(scrubUrl('HTTP://template.test')).toBe('http://template.test/');
  });

  it('leaves anything else alone', () => {
    expect(scrubUrl('/notes/7?email=jane%40example.com')).toBe('/notes/7?email=jane%40example.com');
    expect(scrubUrl('inline')).toBe('inline');
    expect(scrubUrl('http://')).toBe('http://');
  });
});

describe('protectItem', () => {
  it('sends only the interactions the app lists', () => {
    const items = [event('note.created', { plan: 'free' }), event('note.exported')];

    expect(names(items.map((item) => protectItem(item, interactions)))).toEqual(['note.created']);
  });

  it("keeps Faro's own events", () => {
    const items = [
      'session_start',
      'session_resume',
      'session_extend',
      'view_changed',
      'securitypolicyviolation',
      'faro.performance.resource',
      'faro.tracing.fetch',
    ].map((name) => event(name));

    expect(names(items.map((item) => protectItem(item, new Set())))).toHaveLength(7);
  });

  it('judges user actions by their name', () => {
    const listed = event('faro.user.action', { userActionName: 'note.created' });
    const unlisted = event('faro.user.action', { userActionName: 'note.exported' });

    expect(protectItem(listed, interactions)).not.toBeNull();
    expect(protectItem(unlisted, interactions)).toBeNull();
    expect(protectItem(event('faro.user.action'), interactions)).toBeNull();
  });

  it('keeps what happened during an unlisted action, without naming it', () => {
    const during = (name: string) =>
      protectItem(event('faro.tracing.fetch', {}, { name, parentId: 'a1' }), interactions);

    expect(during('note.created')?.payload).toHaveProperty('action.name', 'note.created');
    expect(during('note.exported')?.payload).not.toHaveProperty('action');
  });

  it('never identifies the user', () => {
    const fetched = event('faro.tracing.fetch', {
      'user.email': 'jane@example.com',
      status: '200',
    });
    const span = trace([
      { key: 'user.id', value: { stringValue: '7' } },
      { key: 'user_agent.original', value: { stringValue: 'Firefox' } },
    ]);

    expect(protectItem(fetched, interactions)).toMatchObject({
      meta: { app: meta.app },
      payload: { attributes: { status: '200' } },
    });
    expect(protectItem(fetched, interactions)?.meta).not.toHaveProperty('user');
    expect(JSON.stringify(protectItem(fetched, interactions))).not.toContain('user.email');
    expect(JSON.stringify(protectItem(span, interactions))).not.toContain('user.id');
    expect(JSON.stringify(protectItem(span, interactions))).toContain('user_agent.original');
  });

  it('removes the query and fragment from every address it sends', () => {
    const fetched = trace([
      { key: 'url.full', value: { stringValue: 'https://api.template.test/notes?owner=jane' } },
      { key: 'http.response.status_code', value: { intValue: 200 } },
    ]);

    const protectedItem = protectItem(fetched, interactions);

    expect(protectedItem?.meta.page?.url).toBe('https://template.test/notes/7');
    expect(JSON.stringify(protectedItem)).not.toMatch(/jane|secret/);
    expect(JSON.stringify(protectedItem)).toContain('"intValue":200');
  });
});
