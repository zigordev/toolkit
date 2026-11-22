import { context } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';

export function nameRoute(route: string): void {
  const metadata = getRPCMetadata(context.active());
  if (metadata?.type === RPCType.HTTP) {
    metadata.route = route;
  }
}
