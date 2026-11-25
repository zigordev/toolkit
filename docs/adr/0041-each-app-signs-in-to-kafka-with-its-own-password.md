# 0041. Each app signs in to Kafka with its own password

- Status: accepted
- Date: 2026-11-25
- Supersedes: none

## Context

[Record 0039](0039-apache-kafka-is-the-broker-one-node-on-the-host.md) puts one broker on the host for every app. Without a sign-in, any container that reaches it could write to any topic, so a request could claim to come from any app. A Kafka message does not carry the identity of the client that wrote it. Proof of the sender therefore needs a topic per app, and a rule that only that app may write to it. November's HTTP design gave each caller of the notifications service its own key for the same reason.

On 2026-11-24 the owner chose, in their words: "B: password per app". The owner accepted this record on 2026-11-25, in their words: "Accept 0041 (Recommended)".

Facts:

- Kafka keeps its SCRAM sign-ins in its own metadata log. SCRAM is a sign-in by password in which the password itself never crosses the network. Kafka's access rules, its ACLs, come from `StandardAuthorizer`, and a topic with no rule is open only to its administrators. Kafka's docs advise SCRAM only with TLS, the encryption of the traffic.
- `@platformatic/kafka` signs in with SCRAM-SHA-512.
- AWS Parameter Store keeps standard parameters at no charge, and an advanced parameter costs $0.05 a month (AWS's pricing page, read on 2026-11-25).
- The template's app containers drop every Linux capability, run read-only and cannot gain privileges.
- On Amazon MSK, the passwords must live in Secrets Manager, at $0.40 a secret a month, encrypted with a KMS key that is not the default one, at $1 a key a month. MSK accepts only SCRAM-SHA-512 (MSK docs and AWS price list, read on 2026-11-25).

## Decision

- Each app signs in to Kafka with SCRAM-SHA-512, as a Kafka user of its own, with a long random password. The owner creates each password in Parameter Store, as [record 0018](0018-secrets-in-aws-parameter-store.md) says for every secret, and the deploy hands it to the app.
- ACLs let each app write only to its own request topics and read only its own answer topics. The notifications service reads every request topic and writes every answer topic.
- A job in `platform` applies the users' rules and the topics as code, with a sign-in of its own. Alloy's Kafka exporter signs in as a user of its own.
- The laptop runs the same sign-in, with throwaway passwords, so a missing rule fails there first.
- There is no TLS inside the host. The traffic never leaves the machine, the app containers drop every capability, and the passwords are long and random. TLS comes when the broker leaves the host, and on MSK the passwords move to Secrets Manager.

## Consequences

- A message on an app's topic can only have come from that app.
- Before an app first runs against Kafka, the owner creates its password. The job that applies the rules and Alloy need one each, once. Standard parameters cost nothing.
- Messages cross the host's internal network unencrypted. No app container has the capabilities to listen to another's traffic.
- A new product needs its Kafka user, its password and its rules before its first deploy, so the new-product steps gain one item.

## Alternatives considered

- **No sign-in.** Nothing for the owner to create, but any container could write to any topic as any app.
- **A certificate per app.** Each app proves itself with its own certificate, and the traffic is encrypted. The certificates need an authority to issue and renew them. On AWS, Private CA costs $400 a month, or $50 a month in its short-lived certificate mode.
- **A password per app, with TLS inside the host.** Encryption on a network that never leaves the machine, and certificates to renew. It comes when the broker leaves the host.
