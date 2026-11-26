'use client';

import { Field } from '@base-ui/react/field';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { classNames } from '../internal/class-names.ts';

interface FieldParts {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  className?: string;
}

export type TextFieldProps = FieldParts &
  Omit<ComponentPropsWithRef<'input'>, 'className' | 'children'>;

export type TextAreaProps = FieldParts &
  Omit<ComponentPropsWithRef<'textarea'>, 'className' | 'children'>;

interface FrameProps extends FieldParts {
  disabled?: boolean | undefined;
  children: ReactNode;
}

function Frame({ label, description, error, className, disabled, children }: FrameProps) {
  const invalid = error !== undefined && error !== null && error !== false && error !== '';
  return (
    <Field.Root
      className={classNames('ds-field', className)}
      invalid={invalid}
      disabled={disabled ?? false}
    >
      <Field.Label className="ds-field__label">{label}</Field.Label>
      {children}
      {description ? (
        <Field.Description className="ds-field__description">{description}</Field.Description>
      ) : null}
      {invalid ? (
        <Field.Error className="ds-field__error" match>
          {error}
        </Field.Error>
      ) : null}
    </Field.Root>
  );
}

export function TextField({ label, description, error, className, ...input }: TextFieldProps) {
  return (
    <Frame
      label={label}
      description={description}
      error={error}
      className={className}
      disabled={input.disabled}
    >
      <Field.Control {...input} className="ds-field__control" />
    </Frame>
  );
}

export function TextArea({ label, description, error, className, ...textarea }: TextAreaProps) {
  return (
    <Frame
      label={label}
      description={description}
      error={error}
      className={className}
      disabled={textarea.disabled}
    >
      <Field.Control className="ds-field__control" render={<textarea {...textarea} />} />
    </Frame>
  );
}
