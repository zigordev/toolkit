# The allowed licences

Every dependency comes with a licence, which says what its authors ask of whoever uses their code. The pipeline holds a list of the licences we have agreed to. The Dependencies job fails a pull request that adds a dependency under any other licence, as [record 0031](../adr/0031-the-pipeline-allows-only-agreed-licences.md) says.

The list itself is the `allow-licenses` line in `.github/workflows/check.yml`. This page explains each entry. A test fails when the two differ.

The second column is a short reading in plain words, and not legal advice.

| Licence       | What it asks, in short                                                                                 | What brought it                                                      | Agreed     |
| ------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ---------- |
| 0BSD          | Nothing                                                                                                | `tslib`, a helper for compiled TypeScript                            | 2026-11-22 |
| Apache-2.0    | Keep the licence text and the notices, and say what you changed. It also grants the patents it needs   | TypeScript, and a few small packages                                 | 2026-11-22 |
| Artistic-2.0  | Free to use and to pass on unchanged. A changed version has to be renamed, or its changes published    | `npm`, the npm program, which semantic-release brings                | 2026-11-22 |
| BlueOak-1.0.0 | Give whoever receives the code the licence text, or a link to it                                       | `lru-cache` and `graceful-fs`, which semantic-release brings         | 2026-11-22 |
| BSD-2-Clause  | Keep the copyright notice                                                                              | `entities`, which the Markdown lint uses                             | 2026-11-22 |
| BSD-3-Clause  | Keep the copyright notice, and do not use the authors' names to promote your own work                  | `fast-uri`, `smol-toml` and `source-map-js`                          | 2026-11-22 |
| CC-BY-3.0     | Credit the author when the work is passed on                                                           | `spdx-exceptions`, a list of licence names, through semantic-release | 2026-11-22 |
| CC0-1.0       | Nothing                                                                                                | `spdx-license-ids`, another such list, through semantic-release      | 2026-11-22 |
| ISC           | Keep the copyright notice                                                                              | Eleven small packages, such as `cliui`                               | 2026-11-22 |
| MIT           | Keep the copyright notice and the licence text                                                         | Most packages                                                        | 2026-11-22 |
| MPL-2.0       | Publish your changes to the licensed files themselves when you pass them on. Your own files stay yours | Lightning CSS, a build tool that comes with Vite                     | 2026-11-22 |
| PSF-2.0       | Keep the copyright notice and the licence text                                                         | `argparse` 3, which the Markdown lint uses                           | 2026-11-22 |
| Python-2.0    | Keep the copyright notice and the licence text                                                         | `argparse` 2, which commitlint uses                                  | 2026-11-22 |

The first nine entries are the licences that GitHub reported for every dependency of `toolkit` on 2026-11-22, when the list was made. Artistic-2.0, BlueOak-1.0.0, CC-BY-3.0 and CC0-1.0 joined the same day with the owner's yes, for semantic-release. All four run only in the pipeline, and none is built into a product.

## How a licence joins the list

Only with the owner's yes. The core rules list it among the changes that wait for the owner.

1. The Dependencies job turns red, and its summary names the dependency and its licence.
2. Find out what brings the dependency, with `pnpm why -r <package>`, and read what the licence asks.
3. Put it to the owner: the dependency, what it is for, and what the licence asks. The other ways out are another package, or an exemption for that one package.
4. After a yes, add the licence to `allow-licenses` in `check.yml` and a row to this page, in one pull request.
