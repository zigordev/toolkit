import { type NativeTokens, nativeTokens } from './generated/native.ts';
import type { Theme } from './index.ts';

export type { NativeEasing, NativeFontWeight, NativeTokens } from './generated/native.ts';
export { nativeTokens };

export function nativeTheme({ mode, product }: Theme): NativeTokens {
  return nativeTokens[product ?? 'default'][mode];
}
