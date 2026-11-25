import { getNextAuth } from '../../lib/auth.ts';
import { AccountActions } from './account-actions.tsx';

export const dynamic = 'force-dynamic';

export default async function Account() {
  const user = await getNextAuth().requireUser('/account');
  return (
    <main>
      <h1>Your account</h1>
      <p>
        {user.name}, {user.email}
      </p>
      <AccountActions />
    </main>
  );
}
