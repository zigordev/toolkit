import { LinkButton } from '@zigordev/ui';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getNextAuth } from '../../lib/auth.ts';
import { localPath } from '../../lib/paths.ts';
import styles from '../layout.module.css';
import { SignInForm } from './sign-in-form.client.tsx';

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
    <>
      <h1>{t('title')}</h1>
      <SignInForm next={next} />
      <p className={styles.actions}>
        {t('noAccount')}
        <LinkButton render={<Link href="/sign-up" />} variant="ghost" size="sm">
          {t('signUp')}
        </LinkButton>
      </p>
    </>
  );
}
