'use client';

import { Menu } from '@base-ui/react/menu';
import { Fragment, type ReactElement, useRef } from 'react';
import { Icon } from '../icon/icon.tsx';
import { classNames } from '../internal/class-names.ts';
import type { Place } from '../places/places.ts';

export interface MenuOption {
  readonly value: string;
  readonly label: string;
  readonly lang?: string;
}

export interface MenuChoice {
  readonly label: string;
  readonly value: string;
  readonly options: readonly MenuOption[];
  readonly onValueChange: (value: string) => void;
}

export interface AccountMenuProps {
  readonly label: string;
  readonly name: string;
  readonly detail?: string;
  readonly choices?: readonly MenuChoice[];
  readonly links?: readonly Place[];
  readonly renderLink?: (place: Place) => ReactElement;
  readonly signOutLabel: string;
  readonly onSignOut: () => void;
  readonly className?: string;
}

export function initialsOf(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => Array.from(word)[0]);
  const ends = letters.length > 1 ? [letters[0], letters[letters.length - 1]] : letters;
  return ends.join('').toLocaleUpperCase();
}

export function AccountMenu({
  label,
  name,
  detail,
  choices = [],
  links = [],
  renderLink,
  signOutLabel,
  onSignOut,
  className,
}: AccountMenuProps) {
  const holder = useRef<HTMLSpanElement>(null);
  return (
    <Menu.Root>
      <Menu.Trigger
        className={classNames('ds-account-menu__trigger', className)}
        aria-label={label}
      >
        <span
          className="ds-account-menu__avatar"
          aria-hidden="true"
          data-initials={initialsOf(name)}
        />
      </Menu.Trigger>
      <span ref={holder} className="ds-account-menu__holder" />
      <Menu.Portal container={holder}>
        <Menu.Positioner
          className="ds-account-menu__positioner"
          positionMethod="fixed"
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={8}
        >
          <Menu.Popup className="ds-account-menu">
            <div className="ds-account-menu__who">
              <span className="ds-account-menu__name">{name}</span>
              {detail ? <span className="ds-account-menu__detail">{detail}</span> : null}
            </div>
            {choices.map((choice) => (
              <Fragment key={choice.label}>
                <Menu.Separator className="ds-account-menu__separator" />
                <Menu.RadioGroup
                  className="ds-account-menu__group"
                  value={choice.value}
                  onValueChange={(value: string) => choice.onValueChange(value)}
                >
                  <Menu.GroupLabel className="ds-account-menu__group-label">
                    {choice.label}
                  </Menu.GroupLabel>
                  {choice.options.map((option) => (
                    <Menu.RadioItem
                      key={option.value}
                      value={option.value}
                      label={option.label}
                      closeOnClick
                      className="ds-account-menu__item"
                    >
                      <Menu.RadioItemIndicator className="ds-account-menu__icon">
                        <Icon name="check" />
                      </Menu.RadioItemIndicator>
                      <span className="ds-account-menu__label" lang={option.lang}>
                        {option.label}
                      </span>
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
              </Fragment>
            ))}
            {links.length > 0 ? <Menu.Separator className="ds-account-menu__separator" /> : null}
            {links.map((place) => (
              <Menu.LinkItem
                key={place.href}
                href={place.href}
                closeOnClick
                render={renderLink?.(place)}
                className="ds-account-menu__item"
              >
                <Icon name={place.icon} className="ds-account-menu__icon" />
                <span className="ds-account-menu__label">{place.label}</span>
              </Menu.LinkItem>
            ))}
            <Menu.Separator className="ds-account-menu__separator" />
            <Menu.Item className="ds-account-menu__item" onClick={onSignOut}>
              <Icon name="log-out" className="ds-account-menu__icon" />
              <span className="ds-account-menu__label">{signOutLabel}</span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
