import { CircleUser, House, type LucideIcon, NotebookPen } from 'lucide-react';
import { classNames } from '../internal/class-names.ts';

const glyphs = {
  'circle-user': CircleUser,
  house: House,
  'notebook-pen': NotebookPen,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof glyphs;

export const iconNames = Object.keys(glyphs) as IconName[];

export interface IconProps {
  readonly name: IconName;
  readonly className?: string;
}

export function Icon({ name, className }: IconProps) {
  const Glyph = glyphs[name];
  return <Glyph className={classNames('ds-icon', className)} aria-hidden="true" />;
}
