import * as z from 'zod';

const broker = z.string().regex(/^[^\s:,]+:\d{1,5}$/, 'is host:port');

export const kafkaSettings = {
  KAFKA_BROKERS: z
    .string()
    .min(1)
    .transform((text) =>
      text
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '')
    )
    .pipe(z.array(broker).min(1)),
  KAFKA_USERNAME: z.string().min(1),
  KAFKA_PASSWORD: z.string().min(1),
};

export interface KafkaConnection {
  readonly clientId: string;
  readonly brokers: readonly string[];
  readonly username: string;
  readonly password: string;
}

export interface ClientOptions {
  readonly clientId: string;
  readonly bootstrapBrokers: string[];
  readonly sasl: {
    readonly mechanism: 'SCRAM-SHA-512';
    readonly username: string;
    readonly password: string;
  };
  readonly connectTimeout: number;
  readonly requestTimeout: number;
  readonly autocreateTopics: false;
}

export function clientOptions(connection: KafkaConnection): ClientOptions {
  return {
    clientId: connection.clientId,
    bootstrapBrokers: [...connection.brokers],
    sasl: {
      mechanism: 'SCRAM-SHA-512',
      username: connection.username,
      password: connection.password,
    },
    connectTimeout: 5_000,
    requestTimeout: 30_000,
    autocreateTopics: false,
  };
}
