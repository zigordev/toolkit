import { readFile } from 'node:fs/promises';
import { FlagdProvider } from '@openfeature/flagd-provider';
import { type Client, OpenFeature, ProviderStatus } from '@openfeature/server-sdk';
import type { HealthComponent } from '@zigordev/otel';
import * as z from 'zod';

export const flagsSettings = {
  FLAGS_FILE: z.string().min(1),
};

export interface FlagsOptions {
  readonly app: string;
  readonly file: string;
}

export interface Flags {
  readonly client: Client;
  readonly health: HealthComponent;
  stop(): Promise<void>;
}

async function readFlagsFile(file: string): Promise<void> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    throw new Error(`The flags file ${file} cannot be read`, { cause: error });
  }
  try {
    JSON.parse(text);
  } catch (error) {
    throw new Error(`The flags file ${file} is not JSON`, { cause: error });
  }
}

export async function startFlags(options: FlagsOptions): Promise<Flags> {
  await readFlagsFile(options.file);
  const provider = new FlagdProvider({
    resolverType: 'in-process',
    offlineFlagSourcePath: options.file,
  });
  await OpenFeature.setProviderAndWait(options.app, provider);
  const client = OpenFeature.getClient(options.app);
  return {
    client,
    health: {
      name: 'flags',
      required: false,
      check: async () => (client.providerStatus === ProviderStatus.READY ? 'up' : 'down'),
    },
    stop: async () => {
      await provider.onClose();
    },
  };
}
