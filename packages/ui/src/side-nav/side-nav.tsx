'use client';

import { type ReactElement, useState } from 'react';
import { Button } from '../button/button.tsx';
import { Icon } from '../icon/icon.tsx';
import { classNames } from '../internal/class-names.ts';
import { useMediaQuery } from '../internal/use-media-query.ts';
import { PlaceGroups } from '../places/place-groups.tsx';
import type { Place, PlaceGroup } from '../places/places.ts';
import { sideNavCookie } from './side-nav-cookie.ts';

export interface SideNavProps {
  readonly label: string;
  readonly toggleLabel: string;
  readonly groups: readonly PlaceGroup[];
  readonly pathname: string;
  readonly defaultOpen?: boolean | undefined;
  readonly renderLink?: (place: Place) => ReactElement;
  readonly className?: string;
}

const aYear = 365 * 24 * 60 * 60 * 1000;

function stateOf(choice: boolean | undefined) {
  if (choice === undefined) return undefined;
  return choice ? 'open' : 'closed';
}

function remember(open: boolean) {
  globalThis.cookieStore
    ?.set({
      name: sideNavCookie,
      value: open ? 'open' : 'closed',
      path: '/',
      sameSite: 'lax',
      expires: Date.now() + aYear,
    })
    .catch(() => undefined);
}

export function SideNav({
  label,
  toggleLabel,
  groups,
  pathname,
  defaultOpen,
  renderLink,
  className,
}: SideNavProps) {
  const [choice, setChoice] = useState(defaultOpen);
  const wide = useMediaQuery('(width >= 75rem)', true);
  const open = choice ?? wide;

  function toggle() {
    setChoice(!open);
    remember(!open);
  }

  return (
    <nav
      aria-label={label}
      className={classNames('ds-side-nav', className)}
      data-state={stateOf(choice)}
    >
      <div className="ds-side-nav__head">
        <Button
          iconOnly
          aria-label={toggleLabel}
          aria-expanded={open}
          variant="ghost"
          tone="neutral"
          className="ds-side-nav__toggle"
          onClick={toggle}
        >
          <Icon name={open ? 'panel-left-close' : 'panel-left-open'} />
        </Button>
      </div>
      <PlaceGroups groups={groups} pathname={pathname} renderLink={renderLink} />
    </nav>
  );
}
