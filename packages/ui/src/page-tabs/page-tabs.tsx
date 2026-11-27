'use client';

import { useRender } from '@base-ui/react/use-render';
import { type ReactElement, useEffect, useRef } from 'react';
import { classNames } from '../internal/class-names.ts';
import { currentHref, type PageLink } from '../places/places.ts';

export interface PageTabsProps {
  readonly label: string;
  readonly tabs: readonly PageLink[];
  readonly pathname: string;
  readonly renderLink?: (link: PageLink) => ReactElement;
  readonly className?: string;
}

interface PageTabProps {
  readonly tab: PageLink;
  readonly current: boolean;
  readonly render: ReactElement | undefined;
}

export function scrollToShow(scroll: number, view: number, start: number, size: number): number {
  if (start < scroll) return start;
  if (start + size > scroll + view) return Math.min(start, start + size - view);
  return scroll;
}

function PageTab({ tab, current, render }: PageTabProps) {
  return useRender({
    render,
    defaultTagName: 'a',
    props: {
      href: tab.href,
      className: 'ds-page-tabs__link',
      'aria-current': current ? 'page' : undefined,
      children: tab.label,
    },
  });
}

export function PageTabs({ label, tabs, pathname, renderLink, className }: PageTabsProps) {
  const list = useRef<HTMLUListElement>(null);
  const current = currentHref(
    tabs.map((tab) => tab.href),
    pathname
  );

  useEffect(() => {
    const scroller = list.current;
    const tab = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
    if (current === undefined || !scroller || !tab) return;
    scroller.scrollLeft = scrollToShow(
      scroller.scrollLeft,
      scroller.clientWidth,
      tab.offsetLeft,
      tab.offsetWidth
    );
  }, [current]);

  return (
    <nav aria-label={label} className={classNames('ds-page-tabs', className)}>
      <ul ref={list} className="ds-page-tabs__list">
        {tabs.map((tab) => (
          <li key={tab.href} className="ds-page-tabs__item">
            <PageTab tab={tab} current={tab.href === current} render={renderLink?.(tab)} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
