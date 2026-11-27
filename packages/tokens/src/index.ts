export const modes = ['light', 'dark'] as const;

export type Mode = (typeof modes)[number];

export const products = ['gpool', 'trading-bot', 'cv'] as const;

export type Product = (typeof products)[number];

export interface Theme {
  mode: Mode;
  product?: Product;
}

export const defaultTheme: Theme = {
  mode: 'dark',
};

export const themeAttributes = {
  mode: 'data-mode',
  product: 'data-product',
} as const satisfies Record<keyof Theme, string>;
