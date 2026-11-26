import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '../../test/render.tsx';
import { interactions } from '../lib/interactions.ts';
import { Rum } from './rum.client.tsx';

const rum = vi.hoisted(() => ({ startRum: vi.fn() }));

vi.mock('@zigordev/rum', () => rum);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('browser monitoring', () => {
  it('starts once the page runs, with the app, its version, its environment and its interactions', async () => {
    const container = await render(
      <Rum url="/rum" app="template-web" version="1f3a9c2" environment="local" />
    );

    expect(rum.startRum).toHaveBeenCalledWith({
      url: '/rum',
      app: 'template-web',
      version: '1f3a9c2',
      environment: 'local',
      interactions,
    });
    expect(container.innerHTML).toBe('');
  });
});
