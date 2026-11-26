import { LinkButton } from '@zigordev/ui';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import styles from '../layout.module.css';
import { SignUpForm } from './sign-up-form.tsx';

export default async function SignUp() {
  const t = await getTranslations('signUp');
  return (
    <>
      <h1>{t('title')}</h1>
      <SignUpForm />
      <p className={styles.actions}>
        {t('haveAccount')}
        <LinkButton render={<Link href="/sign-in" />} variant="ghost" size="sm">
          {t('signIn')}
        </LinkButton>
      </p>
    </>
  );
}
