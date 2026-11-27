import type { ReactNode } from 'react';
import { classNames } from '../internal/class-names.ts';

export interface SkipLinkProps {
  readonly href: string;
  readonly children: ReactNode;
}

export function SkipLink({ href, children }: SkipLinkProps) {
  return (
    <a className="ds-skip-link" href={href}>
      {children}
    </a>
  );
}

export interface TopBarProps {
  readonly start: ReactNode;
  readonly nav?: ReactNode;
  readonly end?: ReactNode;
  readonly className?: string;
}

export function TopBar({ start, nav, end, className }: TopBarProps) {
  return (
    <header className={classNames('ds-top-bar', className)}>
      <div className="ds-top-bar__start">{start}</div>
      {nav ? <div className="ds-top-bar__nav">{nav}</div> : null}
      {end ? <div className="ds-top-bar__end">{end}</div> : null}
    </header>
  );
}

export interface AppShellProps {
  readonly skipLinkLabel: string;
  readonly topBar?: ReactNode;
  readonly nav?: ReactNode;
  readonly mainId?: string;
  readonly className?: string;
  readonly children: ReactNode;
}

export function AppShell({
  skipLinkLabel,
  topBar,
  nav,
  mainId = 'main',
  className,
  children,
}: AppShellProps) {
  return (
    <div className={classNames('ds-app-shell', className)}>
      <SkipLink href={`#${mainId}`}>{skipLinkLabel}</SkipLink>
      {topBar ? <div className="ds-app-shell__top">{topBar}</div> : null}
      {nav ? <div className="ds-app-shell__nav">{nav}</div> : null}
      <main id={mainId} tabIndex={-1} className="ds-app-shell__main">
        {children}
      </main>
    </div>
  );
}
