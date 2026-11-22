# 0014. One address per product, with the API under /api/v1

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

The old apps had one address for the web app and a second one for the API. That brought cross-origin rules, cookies across sites and a looser security policy.

## Decision

A product has one address: `<product>.zigordev.com` in production and `<product>.localhost` on the laptop. The web app answers there, and its API answers under `/api/v1/` on the same address.

The laptop uses plain HTTP. The notifications service has no public address, because only products call it, from inside the host.

## Consequences

- There are no cross-origin rules, cookies stay simple, and the content security policy can be strict.
- The ingress sends `/api` to the API container and everything else to the web app.
- Browsers treat `localhost` names as secure, so sign-in, passkeys and secure cookies work on the laptop with no certificate.
- HTTPS ends at Cloudflare in production. That is one of the written differences between the laptop and production.

## Alternatives considered

- **Two addresses per product.** As the old apps had.
- **HTTPS on the laptop too.** Closer to production, with a certificate to make and trust once.
