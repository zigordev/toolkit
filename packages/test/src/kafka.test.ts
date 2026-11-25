import { describe, expect, it } from 'vitest';
import { kafkaEnvironment, kafkaImage, startScript, uniqueTopic } from './kafka.ts';

describe('kafkaImage', () => {
  it('is Apache Kafka 4.4.0, pinned by its digest', () => {
    expect(kafkaImage).toMatch(/^apache\/kafka:4\.4\.0@sha256:[0-9a-f]{64}$/);
  });
});

describe('kafkaEnvironment', () => {
  const environment = kafkaEnvironment();

  it('runs one node that is broker and controller at once', () => {
    expect(environment.KAFKA_PROCESS_ROLES).toBe('broker,controller');
    expect(environment.KAFKA_CONTROLLER_QUORUM_VOTERS).toBe('1@localhost:9093');
  });

  it('signs clients in with SCRAM-SHA-512, as production does', () => {
    expect(environment.KAFKA_LISTENER_SECURITY_PROTOCOL_MAP).toContain('CLIENT:SASL_PLAINTEXT');
    expect(environment.KAFKA_SASL_ENABLED_MECHANISMS).toBe('SCRAM-SHA-512');
  });

  it('never creates a topic on first use', () => {
    expect(environment.KAFKA_AUTO_CREATE_TOPICS_ENABLE).toBe('false');
  });
});

describe('startScript', () => {
  it('advertises the address the tests reach, then starts the image as it would start', () => {
    expect(startScript('localhost', 55001)).toBe(
      [
        '#!/bin/bash',
        'export KAFKA_ADVERTISED_LISTENERS=CLIENT://localhost:55001,INTERNAL://localhost:9094',
        'exec /etc/kafka/docker/run',
        '',
      ].join('\n')
    );
  });
});

describe('uniqueTopic', () => {
  it('gives every call a topic of its own, with the prefix first', () => {
    const first = uniqueTopic('notes');
    const second = uniqueTopic('notes');

    expect(first).toMatch(/^notes\.[0-9a-f-]{36}$/);
    expect(first).not.toBe(second);
  });
});
