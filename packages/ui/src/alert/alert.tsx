import type { ComponentPropsWithRef, ReactNode } from 'react';
import { classNames } from '../internal/class-names.ts';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export type AlertProps = Omit<ComponentPropsWithRef<'div'>, 'className' | 'role' | 'title'> & {
  tone?: AlertTone;
  title?: ReactNode;
  className?: string;
  children: ReactNode;
};

const urgent: ReadonlySet<AlertTone> = new Set(['warning', 'danger']);

export function Alert({ tone = 'info', title, className, children, ...props }: AlertProps) {
  return (
    <div
      {...props}
      className={classNames('ds-alert', className)}
      data-tone={tone}
      role={urgent.has(tone) ? 'alert' : 'status'}
    >
      {title ? <p className="ds-alert__title">{title}</p> : null}
      <div className="ds-alert__body">{children}</div>
    </div>
  );
}
