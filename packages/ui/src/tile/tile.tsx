import type { ComponentPropsWithRef, ReactNode } from 'react';
import { classNames } from '../internal/class-names.ts';

export type TilesProps = Omit<ComponentPropsWithRef<'dl'>, 'className' | 'children'> & {
  className?: string;
  children: ReactNode;
};

export type TileProps = Omit<ComponentPropsWithRef<'div'>, 'className' | 'children'> & {
  label: ReactNode;
  value: ReactNode;
  className?: string;
};

export function Tiles({ className, children, ...props }: TilesProps) {
  return (
    <dl {...props} className={classNames('ds-tiles', className)}>
      {children}
    </dl>
  );
}

export function Tile({ label, value, className, ...props }: TileProps) {
  return (
    <div {...props} className={classNames('ds-tile', className)}>
      <dt className="ds-tile__label">{label}</dt>
      <dd className="ds-tile__value">{value}</dd>
    </div>
  );
}
