import {
  ChevronLeft,
  ChevronRight,
  CircleUser,
  House,
  Languages,
  type LucideIcon,
  Menu,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { classNames } from '../internal/class-names.ts';

const glyphs = {
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'circle-user': CircleUser,
  house: House,
  languages: Languages,
  menu: Menu,
  'notebook-pen': NotebookPen,
  'panel-left-close': PanelLeftClose,
  'panel-left-open': PanelLeftOpen,
  search: Search,
  settings: Settings,
  x: X,
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
