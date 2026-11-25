# 0047. Emails are rendered when an app builds, and filled in when it sends

- Status: proposed
- Date: 2026-11-25
- Supersedes: none

## Context

The plan renders each product's emails with React Email, on the design tokens, in English and Spanish. A product hands the finished email to the notifications service, as [record 0042](0042-notifications-takes-requests-and-gives-outcomes-over-kafka.md) says.

Building step 6.2 on 2026-11-25 showed the cost. React Email 6.11.16 is one package that also carries its preview tool, and its separate small packages are deprecated. Importing it into a service took about 46 MB of memory and 176 ms, measured on this Mac. An API container is limited to 256 MB.

The owner chose on 2026-11-25, in their words: "At build, filled in at send (Recommended)".

## Decision

- `@zigordev/email` has two entries. `@zigordev/email/build` holds the React Email components on the tokens and `renderTemplate`, and runs only when an app builds. `@zigordev/email` fills a finished template at send time, and imports no React.
- A template is a subject, the HTML and the plain text, with places to fill written as `{{name}}`. At send time each value is escaped in the HTML, a link must start with `https://` or `http://`, and a missing or unexpected value fails the send.
- `renderTemplate` refuses a message whose plain text would lose a place to fill.
- An app commits its rendered templates in `src/generated/`, and a test fails when they differ from a fresh render, as the OpenAPI file and the generated client do.
- React Email is an optional peer of `@zigordev/email`, so an app installs it as a dev dependency, and the running image does not carry it.
- The package ships its standard messages already rendered, in English and Spanish, starting with the email that confirms an address.
- The email theme is the light mode of the tokens, with each colour turned into hexadecimal by Lightning CSS, because many mail clients read no other form.

## Consequences

- A service that sends email loads no React Email, so its memory stays with its work.
- A message with a list or a loop renders its repeated part at build, or builds that part at send with the escaping of the package.
- A new version of React Email can change the rendered HTML. Renovate's pull request then fails the test of the saved copies, and `pnpm --dir packages/email run generate` renders them again in that pull request.
- A change of a token reaches the emails through the same test, on the theme.

## Alternatives considered

- **Render in the service, at its first email.** Any message can be built freely at send time, at about 46 MB more in each API that sends email, from the first send on.
- **Render in the service, at its start.** The simplest code, at 46 MB and 176 ms in every start of every API that can send email.
