'use client';

import { Autocomplete } from '@base-ui/react/autocomplete';
import { Dialog } from '@base-ui/react/dialog';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '../button/button.tsx';
import { Icon, type IconName } from '../icon/icon.tsx';
import { classNames } from '../internal/class-names.ts';

export interface Command {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  readonly keywords?: readonly string[];
  readonly lang?: string;
  readonly onSelect: () => void;
}

export interface CommandGroup {
  readonly label: string;
  readonly commands: readonly Command[];
}

export interface CommandPaletteProps {
  readonly label: string;
  readonly placeholder: string;
  readonly emptyLabel: string;
  readonly closeLabel: string;
  readonly groups: readonly CommandGroup[];
  readonly className?: string;
}

interface Section {
  readonly value: string;
  readonly items: readonly Command[];
}

type Keystroke = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'repeat'
>;

const appleSystems = /Mac|iPhone|iPad|iPod/;

export function isPaletteShortcut(keystroke: Keystroke): boolean {
  return (
    (keystroke.metaKey || keystroke.ctrlKey) &&
    !keystroke.altKey &&
    !keystroke.shiftKey &&
    !keystroke.repeat &&
    keystroke.key.toLowerCase() === 'k'
  );
}

export function shortcutKeys(userAgent: string): string {
  return appleSystems.test(userAgent) ? '⌘K' : 'Ctrl K';
}

function unchanging() {
  return () => {};
}

function keysOfThisDevice() {
  return shortcutKeys(navigator.userAgent);
}

function keysUnknown() {
  return undefined;
}

export function CommandPalette({
  label,
  placeholder,
  emptyLabel,
  closeLabel,
  groups,
  className,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const keys = useSyncExternalStore(unchanging, keysOfThisDevice, keysUnknown);
  const sections = useMemo<Section[]>(
    () =>
      groups
        .filter((group) => group.commands.length > 0)
        .map((group) => ({ value: group.label, items: group.commands })),
    [groups]
  );
  const { contains } = Autocomplete.useFilter();

  useEffect(() => {
    function toggle(event: KeyboardEvent) {
      if (!isPaletteShortcut(event)) return;
      event.preventDefault();
      setOpen((current) => !current);
    }
    document.addEventListener('keydown', toggle);
    return () => document.removeEventListener('keydown', toggle);
  }, []);

  function matches(command: Command, query: string): boolean {
    return [command.label, ...(command.keywords ?? [])].some((text) => contains(text, query));
  }

  function choose(command: Command) {
    setOpen(false);
    command.onSelect();
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={classNames('ds-command-palette__trigger', className)}
        aria-label={label}
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Icon name="search" className="ds-command-palette__trigger-icon" />
        <span className="ds-command-palette__trigger-label">{label}</span>
        <span className="ds-command-palette__keys" aria-hidden="true" data-keys={keys} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="ds-command-palette__backdrop" />
        <Dialog.Viewport className="ds-command-palette__viewport">
          <Dialog.Popup className="ds-command-palette" aria-label={label} initialFocus={input}>
            <Autocomplete.Root
              open
              inline
              items={sections}
              filter={matches}
              autoHighlight="always"
              keepHighlight
            >
              <div className="ds-command-palette__header">
                <Autocomplete.InputGroup className="ds-command-palette__search">
                  <Icon name="search" className="ds-command-palette__search-icon" />
                  <Autocomplete.Input
                    ref={input}
                    className="ds-command-palette__input"
                    aria-label={label}
                    placeholder={placeholder}
                  />
                </Autocomplete.InputGroup>
                <Dialog.Close
                  render={
                    <Button
                      iconOnly
                      aria-label={closeLabel}
                      variant="ghost"
                      tone="neutral"
                      size="sm"
                    >
                      <Icon name="x" />
                    </Button>
                  }
                />
              </div>
              <div className="ds-command-palette__results">
                <Autocomplete.Empty>
                  <p className="ds-command-palette__empty">{emptyLabel}</p>
                </Autocomplete.Empty>
                <Autocomplete.List className="ds-command-palette__list">
                  {(section: Section) => (
                    <Autocomplete.Group
                      key={section.value}
                      items={section.items}
                      className="ds-command-palette__group"
                    >
                      <Autocomplete.GroupLabel className="ds-command-palette__group-label">
                        {section.value}
                      </Autocomplete.GroupLabel>
                      <Autocomplete.Collection>
                        {(command: Command) => (
                          <Autocomplete.Item
                            key={command.id}
                            value={command}
                            className="ds-command-palette__item"
                            onClick={() => choose(command)}
                          >
                            {command.icon ? (
                              <Icon name={command.icon} className="ds-command-palette__item-icon" />
                            ) : null}
                            <span className="ds-command-palette__item-label" lang={command.lang}>
                              {command.label}
                            </span>
                          </Autocomplete.Item>
                        )}
                      </Autocomplete.Collection>
                    </Autocomplete.Group>
                  )}
                </Autocomplete.List>
              </div>
            </Autocomplete.Root>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
