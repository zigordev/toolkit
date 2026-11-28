import type { ComponentPropsWithRef, ReactNode } from 'react';
import { classNames } from '../internal/class-names.ts';

export type PillTone = 'accent' | 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type PillProps = Omit<ComponentPropsWithRef<'span'>, 'className' | 'children'> & {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
};

export function Pill({ tone = 'accent', className, children, ...props }: PillProps) {
  return (
    <span {...props} className={classNames('ds-pill', className)} data-tone={tone}>
      {children}
    </span>
  );
}
