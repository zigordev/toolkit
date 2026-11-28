import { type ComponentPropsWithRef, cloneElement, type ReactElement, type ReactNode } from 'react';
import { classNames } from '../internal/class-names.ts';

export type SegmentedControlProps = Omit<
  ComponentPropsWithRef<'fieldset'>,
  'className' | 'aria-label' | 'children'
> & {
  label: string;
  className?: string;
  children: ReactNode;
};

export type SegmentButtonProps = Omit<
  ComponentPropsWithRef<'button'>,
  'className' | 'children' | 'aria-pressed'
> & {
  current?: boolean;
  className?: string;
  children: ReactNode;
  render?: never;
};

export interface SegmentLinkProps {
  current?: boolean;
  className?: string;
  children: ReactNode;
  render: ReactElement;
}

export type SegmentProps = SegmentButtonProps | SegmentLinkProps;

interface LinkElementProps {
  readonly className?: string;
  readonly children?: ReactNode;
  readonly 'aria-current'?: 'page';
}

export function SegmentedControl({ label, className, children, ...props }: SegmentedControlProps) {
  return (
    <fieldset {...props} aria-label={label} className={classNames('ds-segmented', className)}>
      {children}
    </fieldset>
  );
}

function linkSegment({ render, current = false, className, children }: SegmentLinkProps) {
  const element = render as ReactElement<LinkElementProps>;
  return cloneElement(element, {
    className: classNames(element.props.className, 'ds-segment', className),
    'aria-current': current ? 'page' : undefined,
    children,
  });
}

function buttonSegment({
  current = false,
  className,
  children,
  type = 'button',
  ...props
}: SegmentButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-pressed={current}
      className={classNames('ds-segment', className)}
    >
      {children}
    </button>
  );
}

export function Segment(props: SegmentProps) {
  return props.render === undefined ? buttonSegment(props) : linkSegment(props);
}
