import { cloneElement, type ReactElement, type ReactNode } from 'react';
import { Icon } from '../icon/icon.tsx';
import { classNames } from '../internal/class-names.ts';
import type { PageLink } from '../places/places.ts';

export interface BreadcrumbsProps {
  readonly label: string;
  readonly links: readonly PageLink[];
  readonly current: string;
  readonly renderLink?: (link: PageLink) => ReactElement;
  readonly className?: string;
}

interface LinkElementProps {
  readonly className?: string;
  readonly children?: ReactNode;
}

function crumb(link: PageLink, renderLink: BreadcrumbsProps['renderLink']) {
  const children = (
    <>
      <Icon name="chevron-left" className="ds-breadcrumbs__back" />
      <span className="ds-breadcrumbs__text">{link.label}</span>
    </>
  );
  if (!renderLink) {
    return (
      <a href={link.href} className="ds-breadcrumbs__link">
        {children}
      </a>
    );
  }
  const element = renderLink(link) as ReactElement<LinkElementProps>;
  return cloneElement(element, {
    className: classNames(element.props.className, 'ds-breadcrumbs__link'),
    children,
  });
}

export function Breadcrumbs({ label, links, current, renderLink, className }: BreadcrumbsProps) {
  if (links.length === 0) return null;
  return (
    <nav aria-label={label} className={classNames('ds-breadcrumbs', className)}>
      <ol className="ds-breadcrumbs__list">
        {links.map((link) => (
          <li key={link.href} className="ds-breadcrumbs__item">
            {crumb(link, renderLink)}
            <Icon name="chevron-right" className="ds-breadcrumbs__separator" />
          </li>
        ))}
        <li className="ds-breadcrumbs__item">
          <span className="ds-breadcrumbs__current" aria-current="page">
            {current}
          </span>
        </li>
      </ol>
    </nav>
  );
}
