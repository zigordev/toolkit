import { createElement as h, type ReactElement, type ReactNode } from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'react-email';
import { theme } from './generated/theme.ts';

export interface EmailLayoutProps {
  readonly lang?: string;
  readonly preview?: string;
  readonly footer?: ReactNode;
  readonly children?: ReactNode;
}

export function EmailLayout({
  lang = 'en',
  preview,
  footer,
  children,
}: EmailLayoutProps): ReactElement {
  return h(
    Html,
    { lang, dir: 'ltr' },
    h(Head),
    preview === undefined ? null : h(Preview, null, preview),
    h(
      Body,
      {
        style: {
          margin: 0,
          backgroundColor: theme.colors.page,
          color: theme.colors.text,
          fontFamily: theme.font,
        },
      },
      h(
        Container,
        {
          style: {
            maxWidth: theme.width,
            margin: '0 auto',
            padding: `${theme.space.lg} ${theme.space.md}`,
          },
        },
        h(
          Section,
          {
            style: {
              backgroundColor: theme.colors.raised,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radius.card,
              padding: theme.space.lg,
            },
          },
          children
        ),
        footer
      )
    )
  );
}

export function EmailHeading({ children }: { readonly children?: ReactNode }): ReactElement {
  return h(
    Heading,
    {
      as: 'h1',
      style: {
        margin: `0 0 ${theme.space.md}`,
        color: theme.colors.text,
        fontSize: theme.fontSize.xl,
        lineHeight: '1.3',
      },
    },
    children
  );
}

export function EmailText({
  children,
  tone = 'default',
}: {
  readonly children?: ReactNode;
  readonly tone?: 'default' | 'muted';
}): ReactElement {
  return h(
    Text,
    {
      style: {
        margin: `0 0 ${theme.space.md}`,
        color: tone === 'muted' ? theme.colors.muted : theme.colors.text,
        fontSize: theme.fontSize.md,
        lineHeight: '1.5',
      },
    },
    children
  );
}

export function EmailButton({
  href,
  children,
}: {
  readonly href: string;
  readonly children?: ReactNode;
}): ReactElement {
  return h(
    Button,
    {
      href,
      style: {
        display: 'inline-block',
        padding: `${theme.space.sm} ${theme.space.md}`,
        borderRadius: theme.radius.button,
        backgroundColor: theme.colors.accent,
        color: theme.colors.accentOn,
        fontSize: theme.fontSize.md,
        fontWeight: 600,
        textDecoration: 'none',
      },
    },
    children
  );
}

export function EmailFooter({ children }: { readonly children?: ReactNode }): ReactElement {
  return h(
    'div',
    null,
    h(Hr, {
      style: { margin: `${theme.space.lg} 0 ${theme.space.md}`, borderColor: theme.colors.border },
    }),
    h(
      Text,
      {
        style: {
          margin: 0,
          color: theme.colors.muted,
          fontSize: theme.fontSize.sm,
          textAlign: 'center',
        },
      },
      children
    )
  );
}
