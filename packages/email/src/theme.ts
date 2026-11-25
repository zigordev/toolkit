export interface EmailTheme {
  readonly colors: {
    readonly page: string;
    readonly raised: string;
    readonly text: string;
    readonly muted: string;
    readonly border: string;
    readonly accent: string;
    readonly accentOn: string;
    readonly accentText: string;
  };
  readonly font: string;
  readonly fontSize: { readonly sm: string; readonly md: string; readonly xl: string };
  readonly space: { readonly sm: string; readonly md: string; readonly lg: string };
  readonly radius: { readonly button: string; readonly card: string };
  readonly width: string;
}
