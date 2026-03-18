# MCP Testing

This file consolidates project-specific knowledge about Chrome MCP, how it has been used here, what failed, what worked, and what to do next.

Sources used for this summary:
- `AGENTS.md`
- `aiChat/39accYXBeklT47M5XiScfCCYz1Y.xml`
- `.vscode/mcp.json`
- local verification on 2026-03-18 with `codex.cmd mcp list`
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

## Recommended Team Rule

For this project, use this decision rule:

1. Check `CODEX_HOME` and `codex.cmd mcp list`.
2. If `chrome-devtools` is missing, register it.
3. If the chat session still does not expose stable browser-backed MCP, stop debugging the chat surface quickly.
4. If MCP itself matters, use a dedicated local MCP client over stdio.
5. If the real goal is application verification, use Playwright + installed Chrome and proceed.

This is the fastest path with the least repeated confusion.

## Project-Specific Summary

Chrome MCP is useful in `srogame`, but only when we keep the layers straight:
- repo config is not Chrome config
- old JetBrains Codex home is not the current one
- registration success is not the same as in-session usability
- local MCP client success is not the same as chat-surface MCP success
- Playwright with real Chrome is the most reliable fallback for actual browser verification
