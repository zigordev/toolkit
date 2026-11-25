import { redirect } from 'next/navigation';
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
  return (
    <main>
      <h1>Sign in</h1>
      <SignInForm next={next} />
      <p>
        No account yet? <a href="/sign-up">Sign up</a>
      </p>
    </main>
  );
}
