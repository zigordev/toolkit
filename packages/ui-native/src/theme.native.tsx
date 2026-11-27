import type { Product } from '@zigordev/tokens';
import { type NativeTokens, nativeTheme } from '@zigordev/tokens/native';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { resolveMode, type ThemeMode } from './theme.ts';

const ThemeContext = createContext<NativeTokens | undefined>(undefined);

export interface ThemeProviderProps {
  readonly children: ReactNode;
  readonly product?: Product;
  readonly mode?: ThemeMode;
}

export function ThemeProvider({ children, product, mode = 'system' }: ThemeProviderProps) {
  const scheme = useColorScheme();
  const tokens = useMemo(
    () =>
      nativeTheme({
        mode: resolveMode(mode, scheme),
        ...(product === undefined ? {} : { product }),
      }),
    [mode, scheme, product]
  );
  return <ThemeContext value={tokens}>{children}</ThemeContext>;
}

export function useTokens(): NativeTokens {
  const tokens = useContext(ThemeContext);
  if (tokens === undefined) {
    throw new Error('A component of @zigordev/ui-native needs a ThemeProvider above it');
  }
  return tokens;
}
