'use client';

import { type ReactElement, useId } from 'react';
import { PlaceLink } from './place-link.tsx';
import { currentHref, type Place, type PlaceGroup } from './places.ts';

export interface PlaceGroupsProps {
  readonly groups: readonly PlaceGroup[];
  readonly pathname: string;
  readonly renderLink?: ((place: Place) => ReactElement) | undefined;
  readonly onNavigate?: (() => void) | undefined;
}

function keyOf(group: PlaceGroup): string {
  return group.label ?? group.places.map((place) => place.href).join(' ');
}

export function PlaceGroups({ groups, pathname, renderLink, onNavigate }: PlaceGroupsProps) {
  const id = useId();
  const shown = groups.filter((group) => group.places.length > 0);
  const current = currentHref(
    shown.flatMap((group) => group.places.map((place) => place.href)),
    pathname
  );
  return (
    <div className="ds-nav-groups">
      {shown.map((group, index) => {
        const labelId = group.label ? `${id}-${index}` : undefined;
        return (
          <div key={keyOf(group)} className="ds-nav-groups__group">
            {group.label ? (
              <span id={labelId} className="ds-nav-groups__heading">
                {group.label}
              </span>
            ) : null}
            <ul className="ds-nav-groups__list" aria-labelledby={labelId}>
              {group.places.map((place) => (
                <li key={place.href} className="ds-nav-groups__item">
                  <PlaceLink
                    block="ds-nav-groups"
                    place={place}
                    current={place.href === current}
                    render={renderLink?.(place)}
                    onClick={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
