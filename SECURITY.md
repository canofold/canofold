# Security Policy

## Supported versions

Security fixes target the latest release line. The `0.x` series is experimental; breaking changes may occur between minor releases and will be called out in the changelog.

## Reporting a vulnerability

Please do not open a public issue for a security vulnerability. Use GitHub's private vulnerability reporting for `canofold/canofold` when available, or contact the repository owner through the email listed on the GitHub profile. Include:

- affected package and version;
- a minimal reproduction or proof of concept;
- impact and required trust level;
- any suggested mitigation.

Please allow time for validation and coordinated disclosure. Do not include secrets or private customer documents in a report.

## Trust boundaries

Canofold is a build tool, not a sandbox. Configuration files, extensions, MDX, local TSX components, and their imports execute with the build process permissions and must only come from reviewed sources. Path and output ownership checks protect build invariants; they do not isolate executable project code.

Repository Markdown defaults to `html: 'sanitize'`. Use `html: 'trusted'` only for reviewed content that requires raw HTML, and use `html: 'strip'` when externally synchronized or user-controlled Markdown does not need authored HTML. Never enable MDX for untrusted input, and do not run privileged release builds for unreviewed pull requests.

Generated HTML, Pagefind indexes, Markdown source mirrors, and AI artifacts can reproduce repository content. Treat `.canofold/dist/` as publishable data, inspect it before deployment, and do not put secrets or private material in configuration, Markdown, MDX, extension options, or public assets. Deployment access control, CSP, external resource allowlists, and log retention remain the hosting environment's responsibility.

Use a pinned local Canofold dependency and a reviewed lockfile in CI. The release process uses package provenance, clean-tarball installation, dependency auditing, and CodeQL; downstream users should keep dependency update automation enabled and rebuild after security upgrades.
