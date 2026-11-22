# 0013. Traffic arrives through a Cloudflare Tunnel into Traefik

- Status: accepted
- Date: 2026-11-21
- Supersedes: none

## Context

The old host answered on ports 80 and 443 with Caddy, held its own certificates, and needed three edits for each new route.

## Decision

Visitors only ever meet Cloudflare. A Cloudflare Tunnel brings their traffic to the host, which opens no port to the internet. On the host, Traefik sends each address to its container, from labels in the app's own compose file. The laptop routes the same way.

## Consequences

- The host has no open port, no certificate to renew, and an address that stays hidden.
- Each app declares its own route. Nothing central is edited for a new app.
- All traffic depends on Cloudflare, and Cloudflare decrypts it on the way.
- One more container runs on the host, the tunnel. Traefik reads the list of containers through a read-only proxy.
- Cloudflare's terms limit serving video and large files through it without one of its paid products.

## Alternatives considered

- **Open ports with Caddy.** A tool we know, at the price of a host that faces the internet and manages its own certificates.
