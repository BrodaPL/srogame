# MCP Testing

This file consolidates project-specific knowledge about Chrome MCP, how it has been used here, what failed, what worked, and what to do next.

Sources used for this summary:
- `AGENTS.md`
- `aiChat/39accYXBeklT47M5XiScfCCYz1Y.xml`
- `.vscode/mcp.json`
- local verification on 2026-03-18 with `codex.cmd mcp list`
- local Playwright fallback verification on 2026-03-19
- troubleshooting artifacts: `.tmp-chrome-mcp.log`, `.tmp-chrome-err.log`, `.tmp-chrome9333-err.log`, `.tmp-mcp-run2.log`, `.tmp-mcp-run3.log`, `.tmp-mcp-run4.log`

## Current State

As of 2026-03-18, Chrome MCP is not configured in the active Codex home for this session:

```powershell
$env:CODEX_HOME
codex.cmd mcp list
```

Observed result in this session:
- `CODEX_HOME=C:\Users\Broda\AppData\Local\JetBrains\WebStorm2026.1\aia\codex`
- `codex.cmd mcp list` returned `No MCP servers configured yet.`

Important mismatch:
- The older Codex home at `C:\Users\Broda\AppData\Local\JetBrains\WebStorm2025.3\aia\codex` does have `chrome-devtools` registered.
- That means previous sessions could truthfully report "Chrome MCP is configured" while a newer JetBrains Codex runtime still has no MCP servers at all.

Verified check:

```powershell
cmd /c "set CODEX_HOME=C:\Users\Broda\AppData\Local\JetBrains\WebStorm2025.3\aia\codex&& codex.cmd mcp list"
cmd /c "set CODEX_HOME=C:\Users\Broda\AppData\Local\JetBrains\WebStorm2026.1\aia\codex&& codex.cmd mcp list"
```

Result:
- `WebStorm2025.3`: `chrome-devtools` present
- `WebStorm2026.1`: no MCP servers configured

## Browser Test Accounts

Use these when a browser/MCP/Playwright verification flow needs authenticated users without creating fresh accounts:

- `TestUserA`
- `TestUserB`
- `TestUserC`

Shared password for all three:

```text
***REMOVED***
```

Current role note:
- all three currently have `localAdmin=true` in `server/data/auth.json`
- this is useful for testing `/setup`, `/load`, and `/multiplayer` host flows without editing auth data first

## Configuration Layers

There are four different layers here. They must not be mixed up.

### 1. Repo-level MCP config

Project file:
- `.vscode/mcp.json`

Current content:
- only `angular-cli` is configured there
- `chrome-devtools` is not configured in repo-local MCP settings

Conclusion:
- Chrome MCP is currently a Codex/IDE environment concern, not a project-configured concern
- opening this repo does not automatically give Chrome MCP unless the active Codex home already has it registered

### 2. Codex-home MCP registration

This is what `codex.cmd mcp list` and `codex.cmd mcp add ...` manage.

Known working registration command on this machine:

```powershell
codex.cmd mcp add chrome-devtools -- cmd /c npx -y chrome-devtools-mcp@latest
```

Why `.cmd` matters:
- PowerShell execution policy may block `npm` / `npx` `.ps1` shims
- use `codex.cmd`, `npm.cmd`, `npx.cmd`

### 3. In-session tool exposure

Even if registration succeeds, the current agent/chat session may still not expose a callable Chrome MCP tool.

Known issue from project history:
- MCP registration can be correct
- tool discovery can appear healthy
- but browser-backed calls in the chat tool surface may still hang or remain unavailable

Conclusion:
- "registered" does not mean "usable from this chat session"

### 4. External browser control outside the chat tool surface

There are two practical alternatives:
- a dedicated local MCP SDK client over stdio
- real browser automation via Playwright using installed Chrome

These have been the reliable fallback paths when the in-session tool surface was blocked or unstable.

## Recommended Workflow

Use this order. It avoids wasting time on the wrong layer.

### Step 1: Check the active Codex home

```powershell
$env:CODEX_HOME
where.exe codex.cmd
codex.cmd mcp list
```

If `chrome-devtools` is missing, register it against the active home:

```powershell
codex.cmd mcp add chrome-devtools -- cmd /c npx -y chrome-devtools-mcp@latest
codex.cmd mcp list
```

### Step 2: Do not assume repo config covers Chrome MCP

Check `.vscode/mcp.json` only if you want to understand repo-scoped MCP.

Current reality:
- repo MCP config exists
- but it only covers Angular CLI MCP
- it does not solve Chrome MCP availability

### Step 3: Distinguish "registered" from "usable in this session"

If Chrome MCP still is not callable from the current chat session:
- do not keep retrying blindly
- note the limitation explicitly
- move to the next layer

### Step 4: If you want MCP specifically, test with a local MCP client

Project history shows that a dedicated local MCP client can be more reliable than the chat surface.

Evidence:
- `.tmp-mcp-run2.log`: MCP connected, test advanced, then a test assertion failed
- `.tmp-mcp-run3.log`: MCP connected, later a `wait_for` timed out
- `.tmp-mcp-run4.log`: MCP connected and completed a successful end-to-end phase-3 verification

This means:
- not every failure was "Chrome MCP is broken"
- some failures were normal test-script problems or brittle waits
- a local MCP client is a valid diagnostic path when chat-surface MCP is unreliable

### Step 5: If the goal is real verification, switch to browser automation fast

Recommended fallback for actual feature verification:
- use Playwright
- launch the real installed Chrome binary directly

Project note from prior sessions:
- `C:/Program Files (x86)/Google/Chrome/Application/chrome.exe` worked reliably as the browser executable

Use this when:
- in-session Chrome MCP is unavailable
- browser-backed chat MCP calls hang
- you need end-to-end verification now, not more MCP debugging

## Known Issues

### PowerShell shim issue

Symptom:
- `npm` / `npx` or even `codex` may fail because PowerShell prefers blocked `.ps1` shims

Fix:
- use `.cmd` shims

Examples:

```powershell
codex.cmd mcp list
npx.cmd -y chrome-devtools-mcp@latest --help
```

### Wrong Codex home

Symptom:
- one place says Chrome MCP is configured
- another place says no MCP servers exist

Cause:
- JetBrains can run Codex from a different `CODEX_HOME` than expected

Verified project history:
- previous troubleshooting referenced `WebStorm2025.3`
- current session is using `WebStorm2026.1`

Fix:
- always check `$env:CODEX_HOME` before trusting any earlier MCP assumption

### Repo config does not include Chrome MCP

Symptom:
- project has `.vscode/mcp.json`
- but Chrome MCP still is unavailable

Cause:
- repo config only registers `angular-cli`

Fix:
- manage Chrome MCP through `codex.cmd mcp add ...`, or add separate repo-level config intentionally in the future

### In-session tool surface can still fail after successful registration

Known history from 2026-03-17:
- Chrome MCP could be registered correctly
- MCP metadata/tool discovery checks could still look fine
- but browser-backed interaction in the chat tool surface could remain unusable or hang

Practical rule:
- do one registration check
- do one usability check
- if it still stalls, stop spending turns on it and switch to fallback

### Default Chrome profile conflicts

Known issue from prior sessions:
- `chrome-devtools-mcp` may report `The browser is already running for ... chrome-profile`

What was tried:
- `--isolated`
- custom `--userDataDir`

Result:
- these were useful diagnostics
- they did not guarantee a working browser-backed MCP session afterward

Conclusion:
- treat profile isolation as a diagnostic step, not a final solution

### Setup payload enum mismatch during API-assisted smoke tests

Symptom:
- `POST /api/game/start` returns `400 {"error":"Invalid setup payload."}` even though the payload shape looks correct

Cause:
- the game type enum is string-valued
- the valid sandbox value is `Sandbox`
- using `SANDBOX` fails server validation

Fix:
- when building payloads outside the Angular UI, copy the exact enum value from `src/app/models/enums/game-type.ts`
- do not guess enum wire values from enum key names

Practical rule:
- for API-assisted smoke tests, prefer lifting literals directly from the shared client/server type source instead of recreating them manually

### Duplicate local server launch causing `EADDRINUSE`

Symptom:
- server logs show `listen EADDRINUSE: address already in use :::3000`

Cause:
- the Express server was already running
- a second local launch was started anyway

Fix:
- check whether `3000` is already listening before starting another server
- treat this as a harness mistake, not an application failure

Useful checks:

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 3000 }
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' } | Select-Object ProcessId,CommandLine
```

### Angular dev server reachable on `localhost` but not `127.0.0.1`

Symptom:
- Angular reports a successful `ng serve`
- `http://127.0.0.1:4200` may still fail
- `http://localhost:4200` works

Cause:
- on this machine the dev server was listening on `::1:4200`
- a quick probe against `127.0.0.1` can produce a false negative

Fix:
- check both `localhost` and `127.0.0.1` before concluding the dev server is down
- if needed, inspect the real listener instead of trusting the banner text

Useful checks:

```powershell
Invoke-WebRequest http://localhost:4200 -UseBasicParsing
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 4200 }
```

### Dynamic browser smoke can be blocked by generated game state

Symptom:
- route smoke passes
- a live mission-flow smoke does not
- examples seen on 2026-03-19:
  - no legal unowned `Move` target was available from the generated state
  - no `Spy Probe` was available on owned planets in another run

Cause:
- the current generated sandbox state is not deterministic enough to guarantee every desired live mission scenario
- API-assisted smoke setup depends on whatever ships and nearby targets the generated galaxy provides

Fix:
- split browser verification into two layers:
  - route/render smoke that must always pass
  - live mission-flow smoke only when generated state supports it
- when generated state is unsuitable, fall back to deterministic model/spec coverage for logic verification instead of forcing a brittle browser scenario

Practical rule:
- treat `Planet View`, `Mission Planner`, `Reports`, and `Operations` route loads as the minimum browser smoke
- treat live `Move`/`Transport`/`Spy` flows as opportunistic unless the setup is explicitly seeded to guarantee them

### Deterministic smoke scenarios now exist

As of 2026-03-19, the project has a built-in deterministic seeding hook:
- `GalaxySetup.smokeTestScenario`
- implementation: `src/app/models/testing/smoke-test-scenarios.ts`

Current scenario keys:
- `routeSmoke`
- `turnProgression`
- `fleetLifecycle`
- `battleDebris`
- `damagedShipsUi`
- `smokeSuite`

Practical use:
- for API-assisted smoke tests, prefer setting `setup.smokeTestScenario` instead of relying on random sandbox generation
- this is now the preferred solution for:
  - guaranteed launchable fleet smoke
  - guaranteed queue/research progression smoke
  - guaranteed damaged-ship UI smoke
  - guaranteed battle/debris smoke

Important:
- the scenario is applied on the server immediately after galaxy creation and before self-reports/presentation data are generated
- this keeps browser-visible state, reports, and API reads aligned from turn 1

### Dedicated smoke runner now exists

As of 2026-03-19, the project also has a repeatable browser smoke command:

```powershell
npm.cmd run smoke:test
```

Current implementation:
- runner: `scripts/run-smoke-tests.js`
- result artifact: `tmp/smoke-test-results.json`
- browser path: Playwright with installed Chrome

What it covers:
- `routeSmoke`
- `turnProgression`
- `fleetLifecycle`
- `battleDebris`
- `damagedShipsUi`
- `smokeSuite`

What it records:
- total duration
- per-scenario duration
- per-step timing for browser-backed scenarios
- pass/fail with error text

Current reference run from 2026-03-19:
- total: `6964.16ms`
- `routeSmoke`: `2085.28ms`
- `turnProgression`: `321.76ms`
- `fleetLifecycle`: `1272.48ms`
- `battleDebris`: `280.16ms`
- `damagedShipsUi`: `1384.43ms`
- `smokeSuite`: `1424.74ms`

Important runner notes:
- `fleetLifecycle` must choose the owned origin planet by actual ship availability, not by `owned-planets[0]`
- debris smoke must use a hostile seeded fleet attacking an owned planet, because `/api/game/active-fleets` only exposes the current player's fleets and `client-planet` hides non-owned debris without report data
- if scenario edits are made under `src/app/models/testing/`, restart the API server; `tsx watch` running from `server/` may not always pick up cross-tree changes reliably

### PowerShell quoting around `npm exec ... node -e`

Symptom:
- inline `node -e` checks routed through PowerShell and `npm exec` can break with parsing errors

Cause:
- PowerShell consumes parts of the JavaScript expression before `node` sees it

Fix:
- prefer a PowerShell here-string piped into `cmd /c "npm exec ... -- node"` for ad hoc Playwright scripts
- this was more reliable than trying to inline JavaScript with nested quoting

## Manual Chrome Launch Notes

Verified from logs:
- `.tmp-chrome-err.log` shows Chrome listening on `ws://127.0.0.1:9222/devtools/browser/...`
- `.tmp-chrome9333-err.log` shows Chrome listening on `ws://127.0.0.1:9333/devtools/browser/...`
- `.tmp-chrome-mcp.log` shows `chrome-devtools-mcp` attaching with `browserURL":"http://127.0.0.1:9222"`

Inferred launch pattern from those logs and temp folders:

```powershell
"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir=C:\Users\Broda\WebstormProjects\srogame\.tmp-mcp-browser-profile
```

Alternative inferred pattern:

```powershell
"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9333 `
  --user-data-dir=C:\Users\Broda\WebstormProjects\srogame\.tmp-mcp-browser-profile-9333
```

Important:
- the exact launch command above is inferred from logs, not copied from a preserved command transcript
- the ports and profile folders are verified

## What Worked

### Registration worked

Historical success:
- 2026-03-08: `codex mcp add chrome-devtools -- cmd /c npx -y chrome-devtools-mcp@latest`
- 2026-03-10: setup refreshed successfully again
- 2026-03-17: old JetBrains Codex home mismatch was diagnosed and fixed for the then-active home

### Local dedicated MCP client runs worked better than the chat tool surface

Most useful evidence:
- `.tmp-mcp-run4.log`

That run shows:
- connection to Chrome MCP succeeded
- browser session and localStorage were injected
- Operations view was verified
- `Move` became `IDLE`
- `Transport` became `RETURNING` and then resolved
- `Spy` produced a report visible in Reports

So the project has real evidence that Chrome MCP can be useful here, but not necessarily through the built-in chat tool surface.

### Real browser automation fallback worked

Project history records successful browser smoke tests using direct Chrome automation as fallback.

Verified outcomes from prior sessions:
- mission launch flows were exercised visibly
- `Move` to unowned target reached `IDLE`
- `Transport` entered `RETURNING`
- reports and operations screens updated as expected
- no browser console errors or failed HTTP responses were observed in successful fallback runs

Additional verified outcome from 2026-03-19:
- route-level browser smoke passed cleanly with Playwright + installed Chrome
- verified pages included main menu, `Planet View` with `Ship Damage Status`, `Mission Planner`, and `Reports`
- no browser console errors, page errors, or failed HTTP responses occurred in that run
- that run did not reproduce a live fleet lifecycle because generated state did not provide a suitable legal mission target and then did not provide a `Spy Probe`

Conclusion:
- Playwright fallback remains the right default for browser verification
- however, live mission-flow smoke still depends on generated state unless the setup is more explicitly seeded

## Recommended Team Rule

For this project, use this decision rule:

1. Check `CODEX_HOME` and `codex.cmd mcp list`.
2. If `chrome-devtools` is missing, register it.
3. If the chat session still does not expose stable browser-backed MCP, stop debugging the chat surface quickly.
4. If MCP itself matters, use a dedicated local MCP client over stdio.
5. If the real goal is application verification, use Playwright + installed Chrome and proceed.
6. If generated game state blocks the exact live scenario you wanted, record that as a test-state limitation and switch to deterministic API/model/spec verification for the blocked feature.

This is the fastest path with the least repeated confusion.

## Project-Specific Summary

Chrome MCP is useful in `srogame`, but only when we keep the layers straight:
- repo config is not Chrome config
- old JetBrains Codex home is not the current one
- registration success is not the same as in-session usability
- local MCP client success is not the same as chat-surface MCP success
- Playwright with real Chrome is the most reliable fallback for actual browser verification
