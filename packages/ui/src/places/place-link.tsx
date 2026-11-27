'use client';

import { useRender } from '@base-ui/react/use-render';
import type { MouseEventHandler, ReactElement } from 'react';
import { Icon } from '../icon/icon.tsx';
import type { Place } from './places.ts';

export interface PlaceLinkProps {
  readonly block: string;
  readonly place: Place;
  readonly current: boolean;
  readonly render: ReactElement | undefined;
  readonly onClick?: MouseEventHandler<HTMLAnchorElement> | undefined;
}

export function PlaceLink({ block, place, current, render, onClick }: PlaceLinkProps) {
  return useRender({
    render,
    defaultTagName: 'a',
    props: {
      href: place.href,
      className: `${block}__link`,
      'aria-current': current ? 'page' : undefined,
      onClick,
      children: (
        <>
          <span className={`${block}__indicator`}>
            <Icon name={place.icon} className={`${block}__icon`} />
          </span>
          <span className={`${block}__label`}>{place.label}</span>
        </>
      ),
    },
  });
}
