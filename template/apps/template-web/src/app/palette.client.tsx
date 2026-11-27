'use client';

import { type CommandGroup, CommandPalette, type Place } from '@zigordev/ui';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { type Locale, locales } from '../i18n/locales.ts';
import { setLanguage } from './language.ts';

export interface PaletteTexts {
  readonly label: string;
  readonly placeholder: string;
  readonly empty: string;
  readonly close: string;
  readonly places: string;
  readonly language: string;
}

export interface PaletteProps {
  readonly places: readonly Place[];
  readonly locale: Locale;
  readonly languages: Readonly<Record<Locale, string>>;
  readonly texts: PaletteTexts;
}

export function Palette({ places, locale, languages, texts }: PaletteProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const groups: CommandGroup[] = [
    {
      label: texts.places,
      commands: places.map((place) => ({
        id: place.href,
        label: place.label,
        icon: place.icon,
        onSelect: () => router.push(place.href),
      })),
    },
    {
      label: texts.language,
      commands: locales
        .filter((other) => other !== locale)
        .map((other) => ({
          id: `language-${other}`,
          label: languages[other],
          icon: 'languages',
          lang: other,
          keywords: [texts.language],
          onSelect: () => startTransition(() => setLanguage(other)),
        })),
    },
  ];
  return (
    <CommandPalette
      label={texts.label}
      placeholder={texts.placeholder}
      emptyLabel={texts.empty}
      closeLabel={texts.close}
      groups={groups}
    />
  );
}
