'use client';

import { useRender } from '@base-ui/react/use-render';
import type { ReactElement } from 'react';
import { Icon, type IconName } from '../icon/icon.tsx';
import { classNames } from '../internal/class-names.ts';

export interface Place {
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
}

export function isCurrentPlace(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface AppNavLinkProps {
  readonly place: Place;
  readonly current: boolean;
  readonly render: ReactElement | undefined;
}

function AppNavLink({ place, current, render }: AppNavLinkProps) {
  return useRender({
    render,
    defaultTagName: 'a',
    props: {
      href: place.href,
      className: 'ds-app-nav__link',
      'aria-current': current ? 'page' : undefined,
      children: (
        <>
          <span className="ds-app-nav__indicator">
            <Icon name={place.icon} className="ds-app-nav__icon" />
          </span>
          <span className="ds-app-nav__label">{place.label}</span>
        </>
      ),
    },
  });
}

export interface AppNavProps {
  readonly label: string;
  readonly places: readonly Place[];
  readonly pathname: string;
  readonly renderLink?: (place: Place) => ReactElement;
  readonly className?: string;
}

export function AppNav({ label, places, pathname, renderLink, className }: AppNavProps) {
  return (
    <nav aria-label={label} className={classNames('ds-app-nav', className)}>
      <ul className="ds-app-nav__list">
        {places.map((place) => (
          <li key={place.href} className="ds-app-nav__item">
            <AppNavLink
              place={place}
              current={isCurrentPlace(place.href, pathname)}
              render={renderLink?.(place)}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
