import { ConfigError, loadConfig } from '@zigordev/config';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { authConfigShape } from './config.ts';

const valid = {
  AUTH_SECRET: 'x'.repeat(32),
  AUTH_URL: 'https://gpool.example.com',
};

function issues(env: Record<string, string>, methods: ('email' | 'google')[]) {
  try {
    loadConfig(z.object(authConfigShape(methods)), { env });
    return [];
  } catch (error) {
    if (error instanceof ConfigError) {
      return error.issues.map((issue) => issue.variable);
    }
    throw error;
  }
}

describe('authConfigShape', () => {
  it('loads an email-only configuration without Google variables', () => {
    const config = loadConfig(z.object(authConfigShape(['email'])), { env: valid });

    expect(config).toEqual(valid);
  });

  it('requires both Google credentials when Google sign-in is on', () => {
    expect(issues(valid, ['email', 'google'])).toEqual([
      'AUTH_GOOGLE_CLIENT_ID',
      'AUTH_GOOGLE_CLIENT_SECRET',
    ]);
  });

  it('loads a Google configuration with a stand-in origin', () => {
    const env = {
      ...valid,
      AUTH_GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
      AUTH_GOOGLE_CLIENT_SECRET: 'secret',
      AUTH_GOOGLE_STAND_IN_URL: 'http://127.0.0.1:4010',
    };

    expect(loadConfig(z.object(authConfigShape(['google'])), { env })).toEqual(env);
  });

  it('refuses a short secret, a URL with a path and a non-HTTP stand-in', () => {
    expect(
      issues(
        {
          AUTH_SECRET: 'too-short',
          AUTH_URL: 'https://gpool.example.com/app',
          AUTH_GOOGLE_STAND_IN_URL: 'ftp://127.0.0.1',
        },
        ['email']
      )
    ).toEqual(['AUTH_SECRET', 'AUTH_URL', 'AUTH_GOOGLE_STAND_IN_URL']);
  });
});
