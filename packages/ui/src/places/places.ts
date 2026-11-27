import type { IconName } from '../icon/icon.tsx';

export interface PageLink {
  readonly href: string;
  readonly label: string;
}

export interface Place extends PageLink {
  readonly icon: IconName;
}

export interface PlaceGroup {
  readonly label?: string;
  readonly places: readonly Place[];
}

export function isCurrentPlace(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function currentHref(hrefs: readonly string[], pathname: string): string | undefined {
  let current: string | undefined;
  for (const href of hrefs) {
    if (isCurrentPlace(href, pathname) && href.length > (current?.length ?? -1)) current = href;
  }
  return current;
}
