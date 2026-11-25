import { createElement as h, type ReactElement } from 'react';
import { render } from 'react-email';
import type { EmailTemplate, Language, StandardTemplates } from './fill.ts';
import { languages, placeholdersOf } from './fill.ts';
import { VerifyEmail, verifyEmailTexts } from './messages/verify-email.ts';

export {
  EmailButton,
  EmailFooter,
  EmailHeading,
  EmailLayout,
  type EmailLayoutProps,
  EmailText,
} from './components.ts';
export type { EmailTemplate, Language, StandardTemplates } from './fill.ts';
export { languages } from './fill.ts';
export { theme } from './generated/theme.ts';
export type { EmailTheme } from './theme.ts';

const headings = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((selector) => ({
  selector,
  options: { uppercase: false },
}));

export async function renderTemplate(
  element: ReactElement,
  subject: string
): Promise<EmailTemplate> {
  const html = await render(element);
  const text = await render(element, {
    plainText: true,
    htmlToTextOptions: { selectors: headings },
  });
  const inText = placeholdersOf({ subject: '', html: '', text });
  const lost = placeholdersOf({ subject: '', html, text: '' }).filter(
    (name) => !inText.includes(name)
  );
  if (lost.length > 0) {
    throw new Error(`The plain text of the email lost the places for ${lost.join(', ')}`);
  }
  return { subject, html, text };
}

export async function renderStandardMessages(): Promise<StandardTemplates> {
  const verifyEmail = {} as Record<Language, EmailTemplate>;
  for (const lang of languages) {
    verifyEmail[lang] = await renderTemplate(
      h(VerifyEmail, { lang }),
      verifyEmailTexts[lang].subject
    );
  }
  return { verifyEmail };
}
