import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getNextAuth } from '../../lib/auth.ts';
import { localPath } from '../../lib/paths.ts';
import { SignInForm } from './sign-in-form.tsx';

export const dynamic = 'force-dynamic';

interface SignInProps {
  readonly searchParams: Promise<{ readonly next?: string }>;
}

export default async function SignIn({ searchParams }: SignInProps) {
  const next = localPath((await searchParams).next);
  if ((await getNextAuth().getUser()) !== null) {
    redirect(next);
  }
  const t = await getTranslations('signIn');
  return (
    <main>
      <h1>{t('title')}</h1>
      <SignInForm next={next} />
      <p>
        {t('noAccount')} <a href="/sign-up">{t('signUp')}</a>
      </p>
    </main>
  );
}
