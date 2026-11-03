# Team PR integration

This combines PR #12 (frontend), #11 (local explanation catalog), and #10 (scanner backend), preserving each contributor's commits.

## Compatibility changes

- Use `src/app` as the single Next.js app directory. Backend handlers moved from `app/api` to `src/app/api`; the scan import path follows that move.
- Keep the frontend's TypeScript, Tailwind, lint configuration, and exact Next/React versions. Add the backend's browser and accessibility packages as explicit runtime dependencies, with Playwright Test for development.
- Merge the backend's `serverExternalPackages` setting into `next.config.ts`. Its original standalone configuration is preserved in `docs/pr-baselines/backend-next.config.mjs`.
- Regenerate the shared npm lockfile. Add a type-check command and start the built application for integration tests.
- Reject non-object scan request bodies with HTTP 400 instead of allowing JSON `null` to cause a server error.
- Keep the existing CI workflow and build the combined application when starting the test server. Original Playwright example tests are retained; `tests/scanly.spec.ts` checks Scanly's frontend, API validation, scanner, and catalog behavior. Lint and the separate type-check command can also be run locally.

## Current behavior and limits

The submitted frontend still shows five **sample** findings after a short timer. It does not call `/api/scans` yet. A successful frontend demo therefore does not demonstrate a live scan.

The backend exposes `/api/health`, `/api/rules`, and asynchronous `/api/scans`. It uses Playwright and axe-core and keeps scan records in process memory. A local live scan requires installing Chromium. This background-job design requires a persistent Node process; it is not yet a reliable serverless deployment. Destination restrictions and resource limits remain unfinished. Use the scanner locally for development until those are implemented.

The catalog contains eight deterministic explanation entries. Their `pending_review` status is preserved. Unknown rules retain engine-provided text, and incomplete findings remain marked for manual review. There is no live LLM or API-key requirement.

This merge does not replace or deploy the separately prepared demo prototype.

## Run and check

```sh
npm ci
npx playwright install chromium
npm run dev
```

```sh
npm run lint
npm run type-check
npm run build
npm test -- --project=chromium --workers=1
```

CI installs all three browsers, builds the application (including TypeScript validation), and runs the complete suite. Local sandboxed macOS automation may block Chromium at launch; that operating-system restriction is separate from assertion failures.
