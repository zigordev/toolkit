import type { ComponentPropsWithRef, ReactNode } from 'react';
import { classNames } from '../internal/class-names.ts';

export type CardProps = Omit<ComponentPropsWithRef<'div'>, 'className' | 'title' | 'children'> & {
  label?: ReactNode;
  title?: ReactNode;
  end?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export function Card({ label, title, end, className, children, ...props }: CardProps) {
  const row = title || end;
  return (
    <div {...props} className={classNames('ds-card', className)}>
      {label ? <div className="ds-card__label">{label}</div> : null}
      {row ? (
        <div className="ds-card__row">
          {title ? <div className="ds-card__title">{title}</div> : null}
          {end ? <div className="ds-card__end">{end}</div> : null}
        </div>
      ) : null}
      {children ? <div className="ds-card__body">{children}</div> : null}
    </div>
  );
}
