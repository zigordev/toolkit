import { Redirect } from 'expo-router';
import { type ReactNode, useEffect } from 'react';
import { authClient } from './auth-client.native';
import { statusOf } from './failure';
import { Screen } from './screen.native';

export function SignedIn({
  next,
  children,
}: {
  readonly next: string;
  readonly children: ReactNode;
}) {
  const session = authClient.useSession();
  if (session.data === null) {
    return session.isPending ? (
      <Screen />
    ) : (
      <Redirect href={{ pathname: '/sign-in', params: { next } }} />
    );
  }
  return children;
}

export function useSessionCheck(error: unknown): void {
  const { refetch } = authClient.useSession();
  const expired = statusOf(error) === 401;
  useEffect(() => {
    if (expired) {
      void refetch();
    }
  }, [expired, refetch]);
}
