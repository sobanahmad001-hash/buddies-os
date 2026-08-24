# Buddies Personal Coding Agent Runner

The Buddies web app coordinates work; the personal runner performs it on your Windows PC. Each request gets a separate Git worktree, runs through Codex with workspace-only access, and returns the diff, changed text files, logs, and verification results to Buddies. Nothing is pushed until you review the returned files and create a PR.

## One-time setup

1. Apply `supabase/migrations/20260826_coding_agent_local_runner.sql` in the Supabase SQL editor.
2. Generate a long random runner token in PowerShell:

   ```powershell
   $bytes = New-Object byte[] 48
   [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
   [Convert]::ToBase64String($bytes)
   ```

3. Add the generated value to Vercel as `CODING_AGENT_RUNNER_TOKEN` for Production, Preview, and Development.
4. Confirm Vercel already has the server-only `SUPABASE_SERVICE_ROLE_KEY`.
5. Redeploy Buddies.
6. Install and sign in to GitHub CLI and Codex CLI on the PC that will execute jobs. Confirm `git`, `gh`, `node`, and `codex` are available in a new PowerShell window.

## Start the runner

Open PowerShell in the repository directory. Set these only in that terminal—the token must never be committed:

```powershell
$env:BUDDIES_APP_URL="https://your-production-domain.vercel.app"
$env:CODING_AGENT_RUNNER_TOKEN="paste-the-same-random-token"
$env:BUDDIES_RUNNER_WORKSPACE="C:\BuddiesRunner"
$env:BUDDIES_RUNNER_ID="soban-personal-pc"
pnpm runner
```

Keep the terminal running. It will display `Buddies Runner ... is online` and wait for approved jobs.

## Use it

1. Open **Coding Agent** in Buddies and select a repository.
2. Describe the change and send the message so the agent can discuss it.
3. Select **Run on my PC**.
4. Wait for `succeeded` or inspect the failure and verification badges.
5. Select **Review diff**, review every returned file, then create the review PR.
6. Merge only after GitHub/Vercel checks pass.

## Safety model

- Jobs use a unique Git worktree and branch.
- Codex receives workspace-write access limited to that worktree.
- The runner never commits, pushes, merges, or deploys.
- Buddies stores capped logs/diffs; do not print secrets in commands or source files.
- Stop the runner immediately and rotate `CODING_AGENT_RUNNER_TOKEN` in Vercel if the token is exposed.
- Delete old job folders under `C:\BuddiesRunner\jobs` manually after their PRs are complete. Never delete the whole runner directory while a job is active.

