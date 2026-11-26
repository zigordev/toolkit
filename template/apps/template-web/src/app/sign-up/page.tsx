import { getTranslations } from 'next-intl/server';
import { SignUpForm } from './sign-up-form.tsx';

export default async function SignUp() {
  const t = await getTranslations('signUp');
  return (
    <main>
      <h1>{t('title')}</h1>
      <SignUpForm />
      <p>
        {t('haveAccount')} <a href="/sign-in">{t('signIn')}</a>
      </p>
    </main>
  );
}
