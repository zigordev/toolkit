export interface Finding {
  readonly rule: string;
  readonly path: string;
  readonly line?: number;
  readonly message: string;
  readonly level?: 'warning';
}

export interface RuleContext {
  readonly root: string;
  readonly files: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
}

export interface Rule {
  readonly name: string;
  readonly summary: string;
  run(context: RuleContext): Finding[];
}
