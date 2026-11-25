import { randomBytes, randomUUID } from 'node:crypto';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { inject } from 'vitest';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    kafka: KafkaAccess;
  }
}

export const kafkaImage =
  'apache/kafka:4.4.0@sha256:833b867a9585a141da455dc2b57431c65cbccb27f11c91f694444cca9f777e0f';

export interface KafkaAccess {
  readonly brokers: readonly string[];
  readonly username: string;
  readonly password: string;
}

export interface StartKafkaOptions {
  readonly image?: string;
  readonly startupTimeout?: number;
}

export interface KafkaServer extends KafkaAccess {
  stop(): Promise<void>;
}

const clientPort = 9092;
const controllerPort = 9093;
const internalPort = 9094;
const starter = '/tmp/zigordev-kafka-start.sh';
const waiting = 'zigordev: waiting for the start script';
const username = 'test';

export function kafkaEnvironment(): Record<string, string> {
  return {
    KAFKA_NODE_ID: '1',
    KAFKA_PROCESS_ROLES: 'broker,controller',
    KAFKA_LISTENERS: `CLIENT://0.0.0.0:${clientPort},CONTROLLER://0.0.0.0:${controllerPort},INTERNAL://0.0.0.0:${internalPort}`,
    KAFKA_LISTENER_SECURITY_PROTOCOL_MAP:
      'CLIENT:SASL_PLAINTEXT,CONTROLLER:PLAINTEXT,INTERNAL:PLAINTEXT',
    KAFKA_INTER_BROKER_LISTENER_NAME: 'INTERNAL',
    KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER',
    KAFKA_CONTROLLER_QUORUM_VOTERS: `1@localhost:${controllerPort}`,
    KAFKA_SASL_ENABLED_MECHANISMS: 'SCRAM-SHA-512',
    KAFKA_LISTENER_NAME_CLIENT_SCRAM___SHA___512_SASL_JAAS_CONFIG:
      'org.apache.kafka.common.security.scram.ScramLoginModule required;',
    KAFKA_OPTS: '-Dzigordev.test=true',
    KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'false',
    KAFKA_NUM_PARTITIONS: '1',
    KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: '1',
    KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: '1',
    KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: '1',
    KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: '0',
    KAFKA_HEAP_OPTS: '-Xms512m -Xmx512m',
  };
}

export function startScript(host: string, port: number): string {
  return [
    '#!/bin/bash',
    `export KAFKA_ADVERTISED_LISTENERS=CLIENT://${host}:${port},INTERNAL://localhost:${internalPort}`,
    'exec /etc/kafka/docker/run',
    '',
  ].join('\n');
}

class KafkaContainer extends GenericContainer {
  constructor(image: string) {
    super(image);
    this.withExposedPorts(clientPort)
      .withEnvironment(kafkaEnvironment())
      .withEntrypoint(['sh'])
      .withCommand([
        '-c',
        `echo '${waiting}'; while [ ! -f ${starter} ]; do sleep 0.1; done; exec bash ${starter}`,
      ])
      .withWaitStrategy(Wait.forLogMessage(waiting));
  }

  protected override async containerStarted(container: StartedTestContainer): Promise<void> {
    await container.copyContentToContainer([
      {
        content: startScript(container.getHost(), container.getMappedPort(clientPort)),
        target: starter,
        mode: 0o755,
      },
    ]);
  }
}

async function addUser(
  container: StartedTestContainer,
  password: string,
  deadline: number
): Promise<void> {
  const command = [
    '/opt/kafka/bin/kafka-configs.sh',
    '--bootstrap-server',
    `localhost:${internalPort}`,
    '--alter',
    '--add-config',
    `SCRAM-SHA-512=[password=${password}]`,
    '--entity-type',
    'users',
    '--entity-name',
    username,
  ];
  let output = 'no attempt was made';
  while (Date.now() < deadline) {
    const result = await container.exec(command);
    if (result.exitCode === 0) {
      return;
    }
    output = result.output.trim();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Kafka did not accept its test user in time: ${output}`);
}

export async function startKafka(options: StartKafkaOptions = {}): Promise<KafkaServer> {
  const timeout = options.startupTimeout ?? 120_000;
  const deadline = Date.now() + timeout;
  const container = await new KafkaContainer(options.image ?? kafkaImage)
    .withStartupTimeout(timeout)
    .start();
  const password = randomBytes(24).toString('hex');
  try {
    await addUser(container, password, deadline);
  } catch (error) {
    await container.stop();
    throw error;
  }
  return {
    brokers: [`${container.getHost()}:${container.getMappedPort(clientPort)}`],
    username,
    password,
    stop: async () => {
      await container.stop();
    },
  };
}

export function kafkaGlobalSetup(
  options: StartKafkaOptions = {}
): (project: TestProject) => Promise<() => Promise<void>> {
  return async (project) => {
    const server = await startKafka(options);
    project.provide('kafka', {
      brokers: server.brokers,
      username: server.username,
      password: server.password,
    });
    return () => server.stop();
  };
}

export function useKafka(): KafkaAccess {
  return inject('kafka');
}

export function uniqueTopic(prefix: string): string {
  return `${prefix}.${randomUUID()}`;
}
