import type { Mode, Product } from '../index.ts';
import type { Oklch } from './color.ts';
import type { RampOverrides } from './ramp.ts';

export const statusRamps = ['danger', 'success', 'warning', 'info'] as const;
export const ramps = ['accent', 'neutral', ...statusRamps] as const;

export type StatusRamp = (typeof statusRamps)[number];
export type RampName = (typeof ramps)[number];
export type Palette = 'default' | Product;

export type ModeOverrides = Partial<Record<Mode, RampOverrides>>;

export interface RampSeed {
  seed: Oklch;
  overrides?: ModeOverrides;
}

export interface Colours {
  accent: RampSeed;
  neutral: RampSeed;
  status: Record<StatusRamp, RampSeed>;
}

const liftedSurfaces = [0.255, 0.285, 0.315, 0.345, 0.375, 0.415, 0.47];

function background(seed: Oklch, darkChroma: number): RampSeed {
  const overrides: RampOverrides = {};
  liftedSurfaces.forEach((l, index) => {
    overrides[(index + 1) as keyof RampOverrides] = { l, c: darkChroma + index * 0.0015 };
  });
  return { seed, overrides: { dark: overrides } };
}

function brightInDark(seed: Oklch, share: number): RampSeed {
  return { seed, overrides: { dark: { 11: { l: 0.8, c: seed.c * share } } } };
}

export const backgrounds = {
  anthracite: background({ l: 0.56, c: 0.024, h: 215 }, 0.013),
  midnight: background({ l: 0.55, c: 0.04, h: 262 }, 0.026),
  pine: background({ l: 0.56, c: 0.032, h: 168 }, 0.018),
  plum: background({ l: 0.56, c: 0.035, h: 318 }, 0.02),
};

export const accents = {
  lavender: brightInDark({ l: 0.76, c: 0.12, h: 295 }, 0.85),
  mint: brightInDark({ l: 0.81, c: 0.105, h: 175 }, 0.85),
  copper: brightInDark({ l: 0.62, c: 0.14, h: 52 }, 0.85),
};

const status: Record<StatusRamp, Oklch> = {
  danger: { l: 0.6, c: 0.2, h: 18 },
  success: { l: 0.64, c: 0.15, h: 155 },
  warning: { l: 0.82, c: 0.15, h: 90 },
  info: { l: 0.64, c: 0.13, h: 245 },
};

function colours(
  neutral: RampSeed,
  accent: RampSeed,
  moved: Partial<Record<StatusRamp, Oklch>> = {}
): Colours {
  const seeds = { ...status, ...moved };
  return {
    accent,
    neutral,
    status: {
      danger: brightInDark(seeds.danger, 0.75),
      success: brightInDark(seeds.success, 0.75),
      warning: brightInDark(seeds.warning, 0.75),
      info: brightInDark(seeds.info, 0.75),
    },
  };
}

export const palettes: Record<Palette, Colours> = {
  default: colours(backgrounds.anthracite, accents.lavender),
  gpool: colours(backgrounds.pine, accents.mint, { success: { l: 0.64, c: 0.15, h: 135 } }),
  'trading-bot': colours(backgrounds.plum, accents.copper, {
    danger: { l: 0.6, c: 0.2, h: 12 },
  }),
  cv: colours(backgrounds.midnight, accents.lavender),
};

export const statusInkHue = 270;
