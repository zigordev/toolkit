import {
  EVENT_SESSION_EXTEND,
  EVENT_SESSION_RESUME,
  EVENT_SESSION_START,
  EVENT_VIEW_CHANGED,
  type EventEvent,
  type TransportItem,
  TransportItemType,
} from '@grafana/faro-web-sdk';

const faroLifecycleEvents = new Set([
  EVENT_SESSION_START,
  EVENT_SESSION_RESUME,
  EVENT_SESSION_EXTEND,
  EVENT_VIEW_CHANGED,
  'securitypolicyviolation',
]);

const userActionEvent = 'faro.user.action';

export function scrubUrl(value: string): string {
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

function isUserKey(key: unknown): boolean {
  return typeof key === 'string' && key.startsWith('user.');
}

function isUserAttribute(entry: unknown): boolean {
  return typeof entry === 'object' && entry !== null && 'key' in entry && isUserKey(entry.key);
}

function scrub(value: unknown): unknown {
  if (typeof value === 'string') return scrubUrl(value);
  if (Array.isArray(value)) return value.filter((entry) => !isUserAttribute(entry)).map(scrub);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isUserKey(key))
        .map(([key, entry]) => [key, scrub(entry)])
    );
  }
  return value;
}

function interactionName(item: TransportItem): string | undefined {
  if (item.type !== TransportItemType.EVENT) return undefined;
  const { name, attributes } = item.payload as EventEvent;
  if (name === userActionEvent) return attributes?.userActionName ?? '';
  if (name.startsWith('faro.') || faroLifecycleEvents.has(name)) return undefined;
  return name;
}

export function protectItem(
  item: TransportItem,
  interactions: ReadonlySet<string>
): TransportItem | null {
  const name = interactionName(item);
  if (name !== undefined && !interactions.has(name)) return null;
  const { user: _user, ...meta } = item.meta;
  const { action, ...payload } = item.payload as Pick<EventEvent, 'action'>;
  const listedAction = action && interactions.has(action.name) ? { action } : {};
  return scrub({ ...item, meta, payload: { ...payload, ...listedAction } }) as TransportItem;
}
