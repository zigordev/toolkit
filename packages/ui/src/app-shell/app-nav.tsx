'use client';

import type { ReactElement } from 'react';
import { classNames } from '../internal/class-names.ts';
import { PlaceLink } from '../places/place-link.tsx';
import { currentHref, type Place } from '../places/places.ts';

export interface AppNavProps {
  readonly label: string;
  readonly places: readonly Place[];
  readonly pathname: string;
  readonly renderLink?: (place: Place) => ReactElement;
  readonly className?: string;
}

export function AppNav({ label, places, pathname, renderLink, className }: AppNavProps) {
  const current = currentHref(
    places.map((place) => place.href),
    pathname
  );
  return (
    <nav aria-label={label} className={classNames('ds-app-nav', className)}>
      <ul className="ds-app-nav__list">
        {places.map((place) => (
          <li key={place.href} className="ds-app-nav__item">
            <PlaceLink
              block="ds-app-nav"
              place={place}
              current={place.href === current}
              render={renderLink?.(place)}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
