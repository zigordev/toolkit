'use client';

import { Drawer } from '@base-ui/react/drawer';
import { useRender } from '@base-ui/react/use-render';
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '../button/button.tsx';
import { Icon } from '../icon/icon.tsx';
import { classNames } from '../internal/class-names.ts';
import { useMediaQuery } from '../internal/use-media-query.ts';
import { currentHref, type PageLink } from '../places/places.ts';

export interface HeaderNavProps {
  readonly label: string;
  readonly links: readonly PageLink[];
  readonly pathname: string;
  readonly title: string;
  readonly menuLabel: string;
  readonly closeLabel: string;
  readonly footer?: ReactNode;
  readonly renderLink?: (link: PageLink) => ReactElement;
  readonly className?: string;
}

interface HeaderLinkProps {
  readonly block: string;
  readonly link: PageLink;
  readonly current: boolean;
  readonly render: ReactElement | undefined;
  readonly onClick?: (() => void) | undefined;
}

function HeaderLink({ block, link, current, render, onClick }: HeaderLinkProps) {
  return useRender({
    render,
    defaultTagName: 'a',
    props: {
      href: link.href,
      className: `${block}__link`,
      'aria-current': current ? 'page' : undefined,
      onClick,
      children: link.label,
    },
  });
}

export function HeaderNav({
  label,
  links,
  pathname,
  title,
  menuLabel,
  closeLabel,
  footer,
  renderLink,
  className,
}: HeaderNavProps) {
  const box = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLUListElement>(null);
  const [folded, setFolded] = useState(false);
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  const phone = useMediaQuery('(width < 37.5rem)', true);
  const current = currentHref(
    links.map((link) => link.href),
    pathname
  );
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(false);
  }
  if (open && !phone && !folded) {
    setOpen(false);
  }

  useEffect(() => {
    const room = box.current;
    const list = row.current;
    if (!room || !list) return;
    const observer = new ResizeObserver(() => setFolded(list.scrollWidth > room.clientWidth));
    observer.observe(room);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={box}
      className={classNames('ds-header-nav', className)}
      data-folded={folded ? '' : undefined}
    >
      <nav aria-label={label} className="ds-header-nav__links">
        <ul ref={row} className="ds-header-nav__list">
          {links.map((link) => (
            <li key={link.href} className="ds-header-nav__item">
              <HeaderLink
                block="ds-header-nav"
                link={link}
                current={link.href === current}
                render={renderLink?.(link)}
              />
            </li>
          ))}
        </ul>
      </nav>
      <Drawer.Root open={open} onOpenChange={setOpen} swipeDirection="up">
        <Drawer.Trigger
          render={
            <Button
              iconOnly
              aria-label={menuLabel}
              variant="ghost"
              tone="neutral"
              size="lg"
              className="ds-header-nav__menu"
            >
              <Icon name="menu" />
            </Button>
          }
        />
        <Drawer.Portal>
          <Drawer.Viewport className="ds-menu-sheet__viewport">
            <Drawer.Popup className="ds-menu-sheet">
              <div className="ds-menu-sheet__head">
                <Drawer.Title className="ds-menu-sheet__title">{title}</Drawer.Title>
                <Drawer.Close
                  render={
                    <Button
                      iconOnly
                      aria-label={closeLabel}
                      variant="ghost"
                      tone="neutral"
                      size="lg"
                    >
                      <Icon name="x" />
                    </Button>
                  }
                />
              </div>
              <nav aria-label={label} className="ds-menu-sheet__nav">
                <ul className="ds-menu-sheet__list">
                  {links.map((link) => (
                    <li key={link.href} className="ds-menu-sheet__item">
                      <HeaderLink
                        block="ds-menu-sheet"
                        link={link}
                        current={link.href === current}
                        render={renderLink?.(link)}
                        onClick={() => setOpen(false)}
                      />
                    </li>
                  ))}
                </ul>
              </nav>
              {footer ? <div className="ds-menu-sheet__foot">{footer}</div> : null}
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}
