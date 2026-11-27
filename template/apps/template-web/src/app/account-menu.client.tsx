'use client';

import { AccountMenu, type Place } from '@zigordev/ui';
import { useTransition } from 'react';
import { type Locale, locales } from '../i18n/locales.ts';
import { getAuthClient } from '../lib/auth-client.ts';
import { Link } from '../lib/link.ts';
import { type Mode, modes } from '../lib/mode.ts';
import { go } from '../lib/navigate.ts';
import { signOut } from '../lib/sign-in.ts';
import { setLanguage } from './language.ts';
import { setMode } from './mode.ts';

export interface AccountTexts {
  readonly label: string;
  readonly language: string;
  readonly appearance: string;
  readonly modes: Readonly<Record<Mode, string>>;
  readonly settings: string;
  readonly signOut: string;
}

export interface AccountProps {
  readonly name: string;
  readonly email: string;
  readonly locale: Locale;
  readonly languages: Readonly<Record<Locale, string>>;
  readonly mode: Mode;
  readonly texts: AccountTexts;
}

function link(place: Place) {
  return <Link href={place.href} />;
}

export function Account({ name, email, locale, languages, mode, texts }: AccountProps) {
  const [, startTransition] = useTransition();
  return (
    <AccountMenu
      label={texts.label}
      name={name}
      detail={email}
      choices={[
        {
          label: texts.language,
          value: locale,
          options: locales.map((option) => ({
            value: option,
            label: languages[option],
            lang: option,
          })),
          onValueChange: (value) => startTransition(() => setLanguage(value)),
        },
        {
          label: texts.appearance,
          value: mode,
          options: modes.map((option) => ({ value: option, label: texts.modes[option] })),
          onValueChange: (value) => {
            document.documentElement.dataset.mode = value;
            startTransition(() => setMode(value));
          },
        },
      ]}
      links={[{ href: '/account', label: texts.settings, icon: 'settings' }]}
      renderLink={link}
      signOutLabel={texts.signOut}
      onSignOut={() => signOut(getAuthClient(), go)}
    />
  );
}
