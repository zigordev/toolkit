import { createElement as h, type ReactElement } from 'react';
import { render } from 'react-email';
import type { EmailTemplate, Language, StandardTemplates } from './fill.ts';
import { languages, placeholdersOf } from './fill.ts';
import { AccountExists, accountExistsTexts } from './messages/account-exists.ts';
import { DeleteAccount, deleteAccountTexts } from './messages/delete-account.ts';
import { ResetPassword, resetPasswordTexts } from './messages/reset-password.ts';
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

const standardMessages = {
  verifyEmail: { component: VerifyEmail, texts: verifyEmailTexts },
  resetPassword: { component: ResetPassword, texts: resetPasswordTexts },
  accountExists: { component: AccountExists, texts: accountExistsTexts },
  deleteAccount: { component: DeleteAccount, texts: deleteAccountTexts },
} as const;

export async function renderStandardMessages(): Promise<StandardTemplates> {
  const rendered = {} as Record<keyof typeof standardMessages, Record<Language, EmailTemplate>>;
  for (const [name, { component, texts }] of Object.entries(standardMessages)) {
    const byLanguage = {} as Record<Language, EmailTemplate>;
    for (const lang of languages) {
      byLanguage[lang] = await renderTemplate(h(component, { lang }), texts[lang].subject);
    }
    rendered[name as keyof typeof standardMessages] = byLanguage;
  }
  return rendered;
}
