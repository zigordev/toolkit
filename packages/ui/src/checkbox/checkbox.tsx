'use client';

import { type ComponentPropsWithRef, type ReactNode, useId } from 'react';
import { classNames } from '../internal/class-names.ts';

export type CheckboxProps = Omit<
  ComponentPropsWithRef<'input'>,
  'type' | 'className' | 'children'
> & {
  label: ReactNode;
  description?: ReactNode;
  className?: string;
};

export function Checkbox({
  label,
  description,
  className,
  id,
  'aria-describedby': describedBy,
  ...props
}: CheckboxProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const descriptions = [describedBy, descriptionId].filter(Boolean).join(' ');
  return (
    <div className={classNames('ds-checkbox', className)}>
      <input
        {...props}
        id={inputId}
        type="checkbox"
        className="ds-checkbox__input"
        aria-describedby={descriptions === '' ? undefined : descriptions}
      />
      <label className="ds-checkbox__label" htmlFor={inputId}>
        {label}
      </label>
      {description ? (
        <p className="ds-checkbox__description" id={descriptionId}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
