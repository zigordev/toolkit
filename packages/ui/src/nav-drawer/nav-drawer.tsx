'use client';

import { Drawer } from '@base-ui/react/drawer';
import { type ReactElement, useState } from 'react';
import { Button } from '../button/button.tsx';
import { Icon } from '../icon/icon.tsx';
import { classNames } from '../internal/class-names.ts';
import { useMediaQuery } from '../internal/use-media-query.ts';
import { PlaceGroups } from '../places/place-groups.tsx';
import type { Place, PlaceGroup } from '../places/places.ts';

export interface NavDrawerProps {
  readonly label: string;
  readonly title: string;
  readonly menuLabel: string;
  readonly closeLabel: string;
  readonly groups: readonly PlaceGroup[];
  readonly pathname: string;
  readonly renderLink?: (place: Place) => ReactElement;
  readonly className?: string;
}

export function NavDrawer({
  label,
  title,
  menuLabel,
  closeLabel,
  groups,
  pathname,
  renderLink,
  className,
}: NavDrawerProps) {
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const phone = useMediaQuery('(width < 37.5rem)', true);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(false);
  }
  if (open && !phone) {
    setOpen(false);
  }

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} swipeDirection="left">
      <Drawer.Trigger
        render={
          <Button
            iconOnly
            aria-label={menuLabel}
            variant="ghost"
            tone="neutral"
            size="lg"
            className={classNames('ds-nav-drawer__trigger', className)}
          >
            <Icon name="menu" />
          </Button>
        }
      />
      <Drawer.Portal>
        <Drawer.Backdrop className="ds-nav-drawer__backdrop" />
        <Drawer.Viewport className="ds-nav-drawer__viewport">
          <Drawer.Popup className="ds-nav-drawer">
            <div className="ds-nav-drawer__head">
              <Drawer.Title className="ds-nav-drawer__title">{title}</Drawer.Title>
              <Drawer.Close
                render={
                  <Button iconOnly aria-label={closeLabel} variant="ghost" tone="neutral" size="lg">
                    <Icon name="x" />
                  </Button>
                }
              />
            </div>
            <nav aria-label={label} className="ds-nav-drawer__nav">
              <PlaceGroups
                groups={groups}
                pathname={pathname}
                renderLink={renderLink}
                onNavigate={() => setOpen(false)}
              />
            </nav>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
