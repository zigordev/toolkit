export interface ConfigIssue {
  readonly variable: string;
  readonly message: string;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    const lines = issues.map((issue) => `- ${issue.variable}: ${issue.message}`);
    super(['Invalid configuration:', ...lines].join('\n'));
    this.issues = issues;
  }
}
