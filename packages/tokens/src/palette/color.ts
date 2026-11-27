export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export interface Swatch extends Oklch {
  hex: string;
}

type Vector = [number, number, number];
type Matrix = [Vector, Vector, Vector];

const labToLms: Matrix = [
  [1.0, 0.3963377773761749, 0.2158037573099136],
  [1.0, -0.1055613458156586, -0.0638541728258133],
  [1.0, -0.0894841775298119, -1.2914855480194092],
];

const lmsToXyz: Matrix = [
  [1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
  [-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
  [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];

const xyzToLinearSrgb: Matrix = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];

const gamutTolerance = 0.000075;

export const white: Oklch = { l: 0.995, c: 0, h: 0 };

export function ink(hue: number): Oklch {
  return { l: 0.2, c: 0.02, h: hue };
}

function dot(a: Vector, b: Vector): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function multiply(vector: Vector, matrix: Matrix): Vector {
  return [dot(vector, matrix[0]), dot(vector, matrix[1]), dot(vector, matrix[2])];
}

function xyz({ l, c, h }: Oklch): Vector {
  const chroma = c < 0 ? 0 : c;
  const angle = (h * Math.PI) / 180;
  const lms = multiply([l, chroma * Math.cos(angle), chroma * Math.sin(angle)], labToLms);
  return multiply([lms[0] ** 3, lms[1] ** 3, lms[2] ** 3], lmsToXyz);
}

function encode(channel: number): number {
  const sign = channel < 0 ? -1 : 1;
  const size = channel * sign;
  return size > 0.0031308 ? sign * (1.055 * size ** (1 / 2.4) - 0.055) : 12.92 * channel;
}

function srgb(color: Oklch): Vector {
  const [r, g, b] = multiply(xyz(color), xyzToLinearSrgb);
  return [encode(r), encode(g), encode(b)];
}

export function inSrgb(color: Oklch): boolean {
  return srgb(color).every(
    (channel) => channel >= -gamutTolerance && channel <= 1 + gamutTolerance
  );
}

export function fitChroma(l: number, c: number, h: number): number {
  if (inSrgb({ l, c, h })) return c;
  let low = 0;
  let high = c;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (inSrgb({ l, c: mid, h })) low = mid;
    else high = mid;
  }
  return low;
}

function luminance(color: Oklch): number {
  return Math.max(xyz(color)[1], 0);
}

export function contrast(a: Oklch, b: Oklch): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

function floorTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.floor(value * factor + 1e-9) / factor;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function rgbOf(color: Oklch): [number, number, number] {
  return srgb(color).map((channel) => Math.min(255, Math.max(0, Math.round(channel * 255)))) as [
    number,
    number,
    number,
  ];
}

function hexOf(color: Oklch): string {
  const digits = srgb(color).map((channel) =>
    Math.round(channel * 255)
      .toString(16)
      .padStart(2, '0')
  );
  return `#${digits.join('')}`;
}

export function swatch(color: Oklch): Swatch {
  const l = roundTo(color.l, 4);
  const h = roundTo(color.h, 2);
  const c = floorTo(fitChroma(l, color.c, h), 4);
  return { l, c, h, hex: hexOf({ l, c, h }) };
}
