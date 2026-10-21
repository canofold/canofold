# Changelog

## 0.8.3 - 2026-10-21

- Preserve anchors and semantic attributes on highlighted code elements when using the inert-token fast path. Detect fenced languages and normalize friendly callouts with LF, CRLF or CR line endings; normalize highlighted code lines without rewriting source locations.
- Enable definition-list parsing only when a possible marker exists; preserve container syntax and source-less MDX setup without running the extension on unrelated large documents.
- Bound browser Markdown preparation by retained bytes as well as entry count using the same cache policy as the server. Keep development HTML compressed inside its existing cache budget, transfer received page DOM without a second deep copy, and merge equally styled syntax tokens without removing content or interaction boundaries.
- Reuse compressed code-block highlighting across body edits, isolate Shiki theme normalization, and cancel unobserved browser compilation between blocks. Reuse inert token rendering in React and skip redundant core semantic traversals without bypassing plugin-added links or anchors. Preserve original newlines when copying compact highlighted code.
- Halve Demo preview padding and let iframe previews share the containing card's themed surface instead of painting the site's canvas background. Scope site canvas decoration and minimum widths to site documents, preserving Demo-authored global styles and narrow frames.
- Clear a Demo preview's previous import-error marker when loading a repaired example, so successful recovery also restores its normal styling.
- Finish HEAD probes to the development event endpoint without opening a persistent event subscription.
- Share content checks across check, development and production builds. Enforce configured error levels before emitting or reusing output; warnings do not fail builds. Production checks exclude draft content and reject published links to drafts.
- Collect independent Frontmatter and MDX syntax failures as schema-1 check diagnostics while retaining checks for valid files. Report OpenAPI source pointers and available authored positions through host-owned source diagnostics; adapter exceptions and unsafe inputs remain failures.
- Keep development sessions alive after recognized initial content errors. Serve a repair page when no output exists, replay active errors to new live-update connections, and recover automatically after edits without replacing good output on failure.
- Notify the browser after development-tool recovery even when the next build reuses cached output; retain normal incremental updates when content is rebuilt.
- Watch inputs before the first build and queue saves made during startup through the existing scheduler. Classify Demo source updates from the content actually built so overlapping startup notifications and saves do not reset the preview unnecessarily.
- Close mounted tooling and detach request listeners when HTTP startup fails. Release the HTTP listener even when mounted-tool cleanup fails.
- Analyze shared Vite Demo modules once per preparation, walk prepared dependency snapshots without per-edge asynchronous tasks, and deduplicate each page's Demo dependencies before fingerprinting shared files once per build. Do not retain stale file contents or import edges across edits. Keep cyclic dependencies and per-Demo invalidation intact.
- Use Vite 8's WebSocket server configuration without deprecated HMR transport options, retaining Vite 6/7 support. Add a component-library development benchmark covering hundreds of Demos, real CLI startup, inline/iframe interaction, source updates and CSS HMR.
- Discard an iframe's in-flight Demo imports when a newer Vite update arrives before those modules register their hot contexts. Reload only that pending iframe, clean up its previous observers, and retain normal HMR for mounted examples without rebuilding the host page.
- Validate the full development graph before serving, but render requested documents through the same page renderer as static builds instead of eagerly highlighting every Demo. Bound the revision-scoped HTML cache, deduplicate concurrent requests and discard obsolete renders. Production builds and whole-site search providers retain complete static HTML input.
- Cache lightweight analysis separately from presentation trees, and bound prepared Markdown/MDX retention by estimated size as well as entry count. Retain render-ready inert token strings in the browser instead of an additional highlighted tree, counting those strings against the same byte budget. Preserve host overrides, dynamic override changes and semantic plugin nodes on the normal rendering path.
- Separate browser-owned Demo HMR dependencies from document inputs. Keep source panes current without rebuilding all pages after a shared CSS edit, while retaining full production dependency invalidation and Core ownership of MDX imports, copied assets and configured styles. Prevent older update responses from replacing newer revisions and retain the visible page after a render failure.
- Return compiled resource requirements alongside server analysis and reuse them for request-time rendering and unchanged pages during incremental builds. Preserve interactions for setext headings, reference images and local MDX components without relying on a second source-pattern approximation.
- Keep render resources and inspected local MDX dependencies outside the content graph, sharing build-local preparation between invalidation and output. Resolve derived-source dependencies against the project root, independent of the caller's working directory; checks and snapshots retain their local import safety boundaries.
- Report YAML alias and OpenAPI nesting limits through content diagnostics while preserving resource limits and fatal handling of unrelated tool errors.
- Remove duplicate clean/incremental output orchestration and production-only function-name restoration overhead; retain named development builds and existing size budgets.
- Keep React-only image, gallery and table buttons disabled in static HTML until hydration mounts their handlers, avoiding silently lost first clicks during runtime loading without an extra readiness render for client-only mounts. Do not expose a placeholder download link before its file URL is ready, or sort table rows before a sort is requested.
- Known limitation: very large Markdown documents can still block the browser main thread during complete parsing, initial syntax highlighting and large DOM updates. This release reduces repeated work and retained memory, but does not eliminate that latency.

## 0.8.2 - 2026-10-19

- Share narrow-screen popup positioning across all header menus instead of only the version selector. Keep intermediate-width header controls from overlapping, preserve search icons and single-line text alongside long version labels, and bound version labels without duplicating navigation.
- Gate candidate tarballs with the same complete, bilingual, all-theme header browser suite used for linked Playground packages, before npm publication.

## 0.8.1 - 2026-10-18

- Keep the documentation-version menu available in narrow headers using an accessible compact trigger. Preserve the single-version label behavior and existing version/locale routing.
- Keep narrow-screen header controls within the viewport, constrain version menus with long labels to the visible header area, and allow overflowing version lists to scroll.

## 0.8.0 - 2026-10-18

- Reject duplicate development sessions for the same canonical project before loading configuration or building. Release session ownership on shutdown or startup failure and reclaim crashed owners without affecting another project or its occupied port.
- Reuse navigation fingerprints within each version/locale during a build and compute shared derived-source revisions once per source. Include installed Markdown runtime changes in cache invalidation, without treating declaration files or source maps as rendering inputs.
- Preserve the first concurrent-task failure even when its rejection value is falsy, stop scheduling further work, and settle active workers before rejecting. Gracefully close standalone development and preview servers on termination.
- Preserve dollar signs in OpenAPI prose as literal data when the Markdown math plugin is enabled.
- Try higher local ports when the development or preview port is occupied, and display the actual mounted URL. Keep build output concise, distinguish terminal status levels without coloring redirected logs, and leave detailed cache/output statistics in the build report. Remove repeated remote-renderer configuration advice while retaining its documented privacy boundary. Default embedded Vite development logging to warnings without clearing the terminal, honoring explicit Vite configuration. Do not reload the browser for unchanged development builds.
- Require Node.js 22.12 or newer. OpenAPI grammar validation uses the maintained Redocly 2.x implementation without lint-only restrictions on valid nullable compositions or Link constants.
- Validate JSON syntax, duplicate keys and nesting without retaining a redundant YAML syntax tree; preserve authored JSON/YAML diagnostic positions. Reserve `markdown` and `mdx` source kinds for authored documents.
- Fix Markdown declarations for native ESM/TypeScript `NodeNext` consumers by using explicit relative module extensions, and keep renderer warning state private to its cache context.

- Add explicit build-time `sources` and the server-only `@canofold/plugins/openapi` adapter for local OpenAPI 3.0/3.1 JSON/YAML. Generate an overview and stable operation pages in the existing site, navigation, search, mirror and AI pipeline without writing authored Markdown files.
- Preserve parameters, authentication, servers, examples, schema composition, finite recursive references and original provenance. Bound tracked local inputs and generated output; reject unsafe/missing references and ambiguous declarations without remote fetching or executable descriptions.
- Publish one schema 3 machine contract for authored and derived documents, retaining Markdown/MDX identities while separating stable derived keys, original entry revisions, dependency revisions and generated representations. Upgrade the Reader and establish a new baseline; do not mix schema 1/2 with schema 3.
- Track multiple pages from the same source independently in build state and development updates. Preserve complete output through failures and clean departed operation/source artifacts. Require version-local inputs and references for historical snapshots.
- Separate source navigation groups from generated route encoding and label the generated source viewer and diagnostics accurately. Report package file counts without arbitrary maxima; retain actual size, export completeness, type consumption and browser isolation checks.

## 0.7.1 - 2026-10-18

- Documentation versions use an ordered `versions: [...]` array: the first entry is current, one entry displays its label, and multiple entries offer switching. Omitted or empty versions hide the control without changing the default content scope. Labels never come from the generator or project package version. Migrate the former `{ current, items }` configuration by moving `items` directly under `versions` and placing its current entry first; the old object format is no longer accepted. The snapshot command follows the same array order.
- Encode each original source-path segment in “Edit this page” links, preserving literal percent escapes, Unicode, spaces, and directory separators.
- Display reliable content-update dates in UTC so the same document does not show different calendar dates on local and CI machines.
- Deliver shared Demo setup CSS and its static imports through the existing Demo manifest and page-head lifecycle, while leaving per-component CSS lazy-loaded.
- Preserve both light and dark reader choices during client navigation, even when the server's default theme uses the opposite color scheme.
- Give automatic and section-root navigation explicit section ownership; do not select or redirect unrelated configured sibling/nested entries merely because URL segments match a directory name.
- Synchronize draft robots metadata during development navigation and page updates without changing production draft exclusion.
- Keep production CLI and Vite bundles free of references to unpublished source maps; retain maps for local watch builds and check actual tarballs for dangling references.
- Preserve the original request URL when framework middleware hands a request back to the host, keeping development pages, assets, and live updates reachable below a deployment base path.

## 0.7.0 - 2026-10-17

- Version the page index and full-content manifest as schema 2. Publish document identity, authored/transformed source fingerprints, content revisions, explicit body/static-analysis representations, output capabilities and a shared collection snapshot. Preserve independent output controls and include page inventories in full manifests when the page index is disabled.
- Add optional `ai.contentSpace` for explicitly named collections across deployment locations. Default identities remain source-local; file moves create a departure and an addition, while title/body edits retain identity. Hash authored bytes during the existing file scan and include their revisions in build invalidation.
- Normalize logical source paths to Unicode NFC before deriving identities, preserving case and literal percent characters without renaming files or changing routes. Reject canonically duplicate source identities.
- Bind content records to document identities and full manifests to the optional page index using byte counts and SHA-256. Document complete-snapshot comparison, unknown differences, AI exclusion and schema-1 migration instead of treating unavailable data as deletion.
- Include logical source-path words in Compact candidate generation without deployment, locale or version-prefix noise; retain the existing relevance ranking and scope isolation.
- Make structured fingerprint key ordering independent of the system locale. Extend existing packed-theme and performance fixtures with explicitly installed font/image assets and incremental/deletion measurements.
- Commit lazy Markdown island hydration before the enhancement readiness boundary, so immediate navigation or disposal cannot interrupt an uncommitted React root. Keep React out of the static Markdown entry graph.

Machine consumers must support schema 2 before upgrading their producer, then establish a new trusted baseline. HTML/Markdown routes, existing output switches and the Markdown/MDX authoring boundary retain their meanings.

## 0.6.8 - 2026-10-16

- Keep primary navigation reachable on narrow screens for homepages and pages without sidebar entries. Reuse the configured links, active states, theme menu materials, and dismissal behavior without changing the existing sidebar navigation on document pages.

## 0.6.7 - 2026-10-16

- Keep same-page fragment history changes native instead of fetching and rebuilding the current page. Preserve reading progress, interactive content, and browser anchor history; cancel a pending cross-page navigation when history returns to the page already being displayed. Path or query changes still use page navigation and restore saved positions.

## 0.6.6 - 2026-10-15

- Restore transparent-to-frosted homepage navigation on scroll across themes, without a homepage divider; keep document header materials theme-specific.
- Restore the Canofold hero illustration animation by fixing theme-variable specificity, while respecting reduced-motion preferences.
- Reuse short-lived sidebar navigation intent requests and normal HTTP caching, restore reading position without cross-page smooth scrolling, and prevent obsolete requests or enhancements from affecting a newer page.
- Keep ordinary colon words such as `format:check` as text. Add opt-in `directives.invalid: 'literal'` for authoring previews to retain invalid rich directives as inert source without discarding valid neighboring content; builds remain strict by default.
- Preserve malformed structured containers as complete inert source in literal mode, so invalid tabs, steps, gallery entries, or code groups cannot silently lose their contents during transformation.
- Keep encoded version URLs aligned with decoded HTML and Markdown output paths, including Unicode, spaces, and literal percent escapes.
- Resolve math styles and fonts from the build's project directory instead of the invoking process's working directory.
- Reject source, style, and output paths that overlap temporary build files or interrupted-build backups. Ignore the same canonical backup directory in development watchers to avoid redundant rebuilds.
- Return HTTP 400 for malformed static-server request URLs instead of leaving requests unanswered with an unhandled rejection.
- Refresh Mermaid diagrams when the selected theme or appearance changes, including switches between themes with the same light or dark color scheme.

## 0.6.5 - 2026-10-15

- Support Mermaid 12 as an optional peer and validate packed-site consumption with Mermaid 12.2.0 and its patched KaTeX dependency. Mermaid remains opt-in rather than being added to the Markdown runtime.
- Keep diagrams on Dagre layout and the Classic look by default across supported Mermaid versions, with theme colors supplied by Canofold. Authored diagram configuration can still select another layout or look.
- Schedule diagram resize writes outside ResizeObserver delivery and cancel pending frames on disposal, preventing resize-loop errors during SVG loading in WebKit.
- Mermaid 12 requires Node 22.12+ for installation and Safari 17.4+ (or equivalent ES2024 browser support). Existing Mermaid 11 installations remain supported; new installations should use Mermaid 12.

## 0.6.4 - 2026-10-15

- Preserve primary button foreground/background pairs in Glassmorphism, Sketch Style, and Bauhaus. Neutral-control material no longer overrides the primary action's accent background or hover colors.
- Keep Neumorphism button hover text readable against its neutral surface without changing its shadow treatment.

## 0.6.3 - 2026-10-14

- Fit diagrams to their intrinsic size and available container width instead of stretching small diagrams. Preserve zoom limits, refit on container changes, and release resize observers when enhancements are disposed.
- Let the shared diagram stylesheet own Mermaid sizing so generated inline width caps do not prevent zooming. Decode host-rendered SVG images immediately instead of delaying updated previews with lazy loading.
- Keep expanded diagrams within the viewport height, including dialog padding, so tall SVG diagrams remain fully visible on desktop and narrow screens.

## 0.6.2 - 2026-10-13

- Keep Kroki source local by default. Remote rendering now requires an explicit trusted `server`, while `renderer: 'client'` continues to delegate SVG rendering to the host.
- Remove the redundant `server: false` configuration path: omit `server` for source-only output. Require an HTTP(S) base URL without a query or fragment instead of silently masking malformed Kroki and PlantUML server values.
- Share only external-server normalization between Kroki and PlantUML while preserving their separate protocol encoders, public client entries, cancellation, DOM restoration, and object-URL cleanup boundaries.
- Dispose Playground debounce timers, synchronized-scroll listeners, React preview roots, and plugin enhancements as one page lifecycle so navigation and hot updates cannot render into a detached document.

## 0.6.1 - 2026-10-13

- Add a typed host-renderer contract for PlantUML and Kroki diagrams. React, editor, and webview hosts can select `renderer: 'client'`, pass an asynchronous SVG renderer to the matching client enhancer, receive the authored language and mapped diagram type, cancel outstanding work through `AbortSignal`, and dispose generated object URLs without coupling `@canofold/markdown` to a native runtime.
- Preserve Kroki's existing public-service default for patch-version compatibility while adding `server: false` for source-only output and `renderer: 'client'` for host-provided local rendering. `server` and `renderer: 'client'` are mutually exclusive for both Kroki and PlantUML.
- Publish TypeScript declarations for diagram client entries and retain localized loading, failure, source, zoom, and expanded-preview behavior for host-rendered SVG output.

## 0.6.0 - 2026-10-13

- Add `@canofold/themes` with the `canofold`, `glassmorphism`, `sketch-style`, `hand-drawn-doodle`, `minimalist-flat`, `bauhaus`, `neo-brutalist`, `neumorphism`, `memphis`, `cyber-chinese`, `pixel-anime`, `dopamine-design`, `shoujo-manga`, and `outrun` visual themes plus a public `ThemeDefinition` contract. Official and third-party packages now provide the same localized metadata, CSS entries, and appearances directly to `themes`; the first appearance is the default and readers can switch without reloading.
- Make `@canofold/themes` the single owner of theme definitions and visual palettes. Standalone Markdown consumers now combine `@canofold/markdown/base.css` with a selected theme CSS entry instead of using a second Markdown-owned theme API.
- Separate site branding and layout geometry into `branding` and `layout`; theme packages own visual tokens, localized names, and theme-specific styles instead of distributing them across `canofoldTheme` and locale messages.
- Allow configured navigation entries to declare `activePaths` for related flat pages, so the primary navigation stays selected outside directory-based sections.
- Use the Canofold light and dark appearances by default when `themes` is omitted, while allowing third-party themes to expose their own appearance set through the same contract.
- Separate shared Markdown structure, default palette, site shell, and branded homepage styling. Include only selected optional theme styles, remove duplicate default palette output, make the default light header opaque, and keep layout geometry and interaction hit areas stable behind theme-owned visual hooks.
- Carry the selected visual theme into isolated Vite component Demo frames and keep it synchronized when readers switch themes.
- Resolve every workspace KaTeX consumer to the patched `0.18.7` runtime, including Mermaid and unified math adapters.

## 0.5.0 - 2026-10-11

- Preserve valid Pagefind body matches in the UI and improve the default Compact search ranking for titles, descriptions, tags, and paths; retain language/version and no-result isolation.
- Preview and check draft pages locally while excluding them from published site, search, Markdown mirror, and AI outputs; `check` requires a published home page for every version and locale.
- Add stable content-check rule IDs, source positions, actionable suggestions, per-rule severity, JSON output, translation coverage, and source-hash-based translation status.
- Add `canofold snapshot <id>` for explicit version-local document snapshots, archived-version notices, and clearer missing-page locale/version switches. Historical Demo and local MDX code must live in that version's docs tree; move shared project-root Demo sources into each version before upgrading. A snapshot does not freeze third-party packages, Vite configuration, or global providers.
- Use explicit `updatedAt` or trustworthy Git content history for last-updated dates rather than checkout time; show no date when the source is unknown.
- Check content before deployment, keep output facts aligned across site, search, Markdown, AI, and redirects, and retain existing clean/cached/incremental build recovery.
- Derive navigation, reference checks, resource copies, search, and AI metadata from the shared Markdown/MDX compiler after async remark/rehype transforms; reuse bounded compilation caches and preserve authored Markdown mirrors without evaluating MDX for static analysis.
- Improve default light/dark reading contrast and exercise keyboard, mobile, search, Demo, and accessibility behavior across Chromium, Firefox, and WebKit.
- Respect JSX attribute overrides in static reference analysis and reduced-motion preferences in both native and React code-tab scrolling.
- Resolve relative document links to generated HTML routes within their source version, including extensionless and directory references while preserving real downloads, query strings, fragments, locales, and deployment base paths even when Markdown mirrors are disabled.
- Apply the host URL transform to native MDX JSX after expressions and spreads resolve, without double-transforming Markdown links or changing custom-component props.
- Record only actual copied page assets in build manifests; invalidate old manifests and preserve page directories when document links are removed. Scope download precedence to the referring page so another page's asset cannot shadow a document route.
- Build Mermaid resources from its module entry and installed dependencies so sanitizer updates reach browser output; skip unused local resources when a custom module URL is configured.
- Verify bilingual, versioned Vite Demos and an existing Markdown corpus through packed-package consumers; keep package sizes and thousand-page build budgets unchanged.

## 0.4.1 - 2026-10-08

- Preserve the shared Vite runtime when Demo setup changes, canonicalize the development root, and dispose each owned server exactly once.
- Serialize Vite configuration restarts through the host watcher, including imported config dependencies, instead of racing two independent restart paths.
- Close newly created Vite sessions when initial Demo analysis, page rendering, or HTTP startup fails; keep failed config restarts retryable instead of accepting stale configuration.
- Refresh highlighted Demo source alongside Vite HMR without replacing the page or collapsing the source panel; prevent old HMR callbacks from remounting stale previews.
- Let isolated Demo frames shrink as well as grow with their content, and cancel pending Demo mounts on disposal.
- Show an accessible, localized error when standalone Demo imports fail instead of leaving an empty page.
- Load iframe Demo modules as external scripts with data attributes instead of constructing executable source strings, and include the host page styles in isolated previews.
- Isolate KaTeX macros per document, keep plugin cache configuration immutable, and honor `throwOnError` in both server and browser compilation.
- Deliver the official math syntax/rendering adapters with a single declared, fixed KaTeX runtime matching the CSS/fonts. Reuse the external HTML parser instead of duplicating it in plugin entries.
- Replace the obsolete gray-matter/js-yaml dependency chain with maintained YAML parsing, bounded aliases, and explicit malformed-header errors.
- Recompile shared CSS when rebuilding instead of retaining a process-global stale stylesheet cache.
- Match analyzed heading anchors to rendered inline text and prevent inherited search-posting properties from being treated as results.
- Analyze headings in rendered footnote order through the same slug plugin as rendering, without exposing the synthetic footnote label as an authored heading.
- Make asynchronous Markdown island disposal and immediate re-enhancement safe.
- Move shell and Demo interactions from generated source strings into typed, behavior-tested client modules; resolve published package boundaries without test-only production fallbacks.
- Include the Vite package in coverage and add real HTTP/SSE development regression tests alongside browser, packed-consumer, and lifecycle checks.

## 0.4.0 - 2026-10-08

- Add independent, default-on switches for per-page Markdown mirrors, the AI page index, and versioned AI full-content shards without changing existing output defaults.
- Keep generated AI references valid when upstream outputs are disabled: omit unavailable Markdown paths, link the Markdown index to HTML routes, and fail an overflowing `llms-full.txt` when its manifest is disabled.
- Plan built-in outputs by logical type and write a machine-readable Build Report with actual file counts, sizes, cache mode, changed pages, duration, and removed paths.
- Verify output toggles, stale-file removal, cache behavior, and the packed CLI consumer.

## 0.3.5 - 2026-10-06

- Compile component Demo JSX for production even when Vite's temporary analysis server has set `NODE_ENV=development`, preventing published Website demos from failing to load.
- Verify the production JSX output in both the Vite engine test and a packed consumer.

## 0.3.4 - 2026-10-05

- Keep three- and four-digit code line numbers aligned with wrapped, scrolled, highlighted, and diff content by using one shared gutter width.
- Make image lightbox cards follow the rendered image, keep their close control attached to the card, and preserve backdrop, keyboard, focus, and scroll-lock behavior.
- Hide the source image while its lightbox is open and give transparent previews an opaque background so diagrams remain legible without a duplicate showing through.
- Keep heading anchors discoverable on touch devices and add explicit keyboard focus indicators to shared preview controls.
- Use the matching dependency-optimizer target configuration for Vite 6/7 and Vite 8, and remove known `lucide-react` client-directive noise from Demo builds without hiding unrelated warnings.

## 0.3.3 - 2026-09-19

- Keep Vite 8 Demo chunks and CSS below the generated `assets/canofold-demos` directory so production previews load the same component examples that work during development.
- Verify packed component-documentation consumers reject Demo preload URLs that escape the generated Demo asset directory.

## 0.3.2 - 2026-09-19

- Give direct Markdown SDK consumers, standalone static sites, and Vite component documentation an explicit React runtime owner while preserving the existing public client entry.
- Use one long-lived Vite server and module graph for component development, HMR, Markdown browser enhancement, and Demo resolution on the shared Canofold port; restart that same mounted server when Vite configuration or project dependency metadata changes.
- Split production Demo modules and their CSS on demand instead of statically bundling every Demo and disabling CSS code splitting.
- Keep Markdown-only pages on a lightweight entry from the same Vite graph so native enhancements do not statically load React.
- Verify final browser graphs against React 18.2, 18.3, 19.2, and 19.3, and upgrade the workspace runtime and types to React 19.3.
- Replace custom workspace process supervision, polling, lock, and heartbeat scripts with pnpm, Vite, tsup, TypeScript, and Tailwind watch modes.
- Add structural runtime-ownership and bundle-budget checks so duplicated React cannot be hidden by increasing a size limit.
- Resolve the Markdown browser client from `@canofold/vite`'s own dependency boundary so strict package managers do not require projects to install an undeclared transitive package.
- Escape project-controlled identifiers and module paths before generating the virtual Vite client source.
- Tighten Demo title spacing without changing the card structure or interaction model.

## 0.3.1 - 2026-09-19

- Add compatible site-level and per-fence code overflow controls while retaining wrapped code as the default.
- Remove the checkerboard from component Demo previews and keep inline and iframe examples on the site surface.
- Add an explicit allow/disallow `robots.txt` policy and document that crawler rules are not access control.
- Warn when active Kroki or externally rendered PlantUML diagrams send source to a configured service.
- Add a reproducible Chinese search-quality benchmark for compact search and Pagefind, covering exact, cross-section, colloquial, noisy, and no-result queries without changing compact ranking.
- Expand packed release verification across code scrolling, inline and iframe Demos, Vite CSS, clean production styling, and robots output.
- Correct and extend the bilingual CLI, configuration, search, Markdown, plugin, build-output, and security documentation.

## 0.3.0 - 2026-09-18

- Add a component Demo Engine contract to Canofold and publish `@canofold/vite` as the official Vite integration.
- Render interactive component examples from ordinary Markdown while using one demo source for both the live preview and displayed code.
- Run Vite middleware and HMR inside the Canofold development server so component libraries use one command and one port.
- Follow the Vite module graph for component CSS and build dependencies instead of listing every component stylesheet in `styles`.
- Add titled and described Demo cards with collapsed highlighted source, standalone previews, and optional iframe isolation for trusted project-local examples.
- Use the official Canofold light/dark logos and favicon as built-in defaults, and keep authored home-page content on the landing canvas.

## 0.2.1 - 2026-09-11

- Include generated TypeScript declaration files in the published packages so external TypeScript projects can consume `canofold` without source-path aliases.
- Verify that packed release artifacts include the public declaration files before publishing.
- Pin the tested `lucide-react` runtime version so independent installations retain correct React hydration.
- Update the transitive `js-yaml` dependency to address a high-severity denial-of-service vulnerability.

## 0.2.0 - 2026-09-05

- Ship the CLI, configuration file, generated output directory, environment variables, DOM/CSS prefixes, and package names as Canofold.
- Publish `canofold`, `@canofold/markdown`, and `@canofold/plugins`.
- Use `https://canofold.dev` as the canonical site origin.

## 0.1.2 - 2026-08-30

- Update the production dependency stack, including Zod 4, Shiki 4, Chokidar 5, and current React patch releases.
- Preserve Markdown class names and iframe sandbox tokens with the stricter HAST property types used by the updated syntax-highlighting stack.
- Migrate configuration records and custom search-provider validation to the Zod 4 schema contract.

## 0.1.1 - 2026-08-30

- Add a validated `seoTitle` frontmatter field that overrides the browser and search-result title without changing the visible page heading, sidebar label, search index, or AI output.
- Keep the GitHub header action visible on narrow mobile viewports by compacting the logo and search control without removing language or theme controls.
- Give the home pages descriptive Chinese and English search-result titles.

## 0.1.0 - 2026-08-29

First public release.

- Build a static documentation site from repository Markdown, MDX, and local React components without maintaining a separate frontend application.
- Produce static HTML, searchable Markdown mirrors, `llms.txt`, and AI-ready page data from the same source content.
- Keep search results isolated by language and version, with local indexing and no required hosted search service.
- Render technical content with code blocks, tabs, file trees, media, diagrams, math, and other interactive Markdown components.
- Load interactive assets only when a page needs them, while keeping the generated site deployable to any static host.
- Extend rendering and content processing through the official `@canofold/plugins` package.
