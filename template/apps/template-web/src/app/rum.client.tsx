'use client';

import { startRum } from '@zigordev/rum';
import { useEffect } from 'react';
import { interactions } from '../lib/interactions.ts';

export interface RumProps {
  readonly url: string;
  readonly app: string;
  readonly version?: string | undefined;
  readonly environment?: string | undefined;
}

export function Rum({ url, app, version, environment }: RumProps) {
  useEffect(() => {
    startRum({ url, app, version, environment, interactions });
  }, [url, app, version, environment]);
  return null;
}
