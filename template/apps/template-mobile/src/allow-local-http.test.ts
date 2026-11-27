import { afterEach, describe, expect, it, vi } from 'vitest';
import allowLocalHttp from '../plugins/allow-local-http.cjs';

interface Application {
  readonly $: Record<string, string>;
}

interface Manifest {
  readonly manifest: { readonly application: Application[] };
}

type ManifestMod = (config: Record<string, unknown>) => Promise<{ modResults: Manifest }>;

const appConfig = { name: 'Template', slug: 'template' };

function generatedManifest(): Manifest {
  return { manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] } };
}

async function manifestFor(flag: string | undefined): Promise<Manifest> {
  vi.stubEnv('EXPO_ALLOW_LOCAL_HTTP', flag);
  const config = allowLocalHttp({ ...appConfig });
  const mod = config.mods?.android?.manifest as ManifestMod | undefined;
  if (mod === undefined) {
    return generatedManifest();
  }
  const result = await mod({
    ...config,
    modRequest: {
      platform: 'android',
      modName: 'manifest',
      projectRoot: '/app',
      introspect: false,
    },
    modResults: generatedManifest(),
  });
  return result.modResults;
}

function cleartextOf(manifest: Manifest): string | undefined {
  return manifest.manifest.application[0]?.$['android:usesCleartextTraffic'];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('allowLocalHttp', () => {
  it('leaves a build that ships refusing plain http, as Android does', async () => {
    expect(allowLocalHttp({ ...appConfig }).mods).toBeUndefined();
    expect(cleartextOf(await manifestFor(undefined))).toBeUndefined();
  });

  it('lets a test build reach an API on plain http when EXPO_ALLOW_LOCAL_HTTP is 1', async () => {
    expect(cleartextOf(await manifestFor('1'))).toBe('true');
  });

  it('takes no other value as a yes', async () => {
    expect(cleartextOf(await manifestFor('true'))).toBeUndefined();
    expect(cleartextOf(await manifestFor('0'))).toBeUndefined();
  });
});
