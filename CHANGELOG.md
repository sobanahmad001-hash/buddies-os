# Buddies OS — Change Log

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]
> Changes staged or in progress, not yet versioned.

### Added
- `marketing_environment` table to `supabase/migrations/20250102_dept_environments.sql` — completes the 3-department environment set (design, development, marketing) with RLS policies and index
- DEPARTMENTS nav section to desktop sidebar (`src/app/app/layout.tsx`) — direct links to Design, Development, and Marketing Dept environment pages
- DEPARTMENTS nav section to mobile sidebar (`src/components/MobileSidebar.tsx`) — same links with Owner / Workspace / Departments section groupings

### Fixed
- Department environment pages (`/app/dept/design`, `/app/dept/development`, `/app/dept/marketing`) were unreachable from sidebar — now have dedicated nav entries
- Mobile sidebar had no section labels or workspace/department groupings — restructured into Owner / Workspace / Departments sections

---

## [1.0.0] — 2026-03-13

### Initial Baseline — Full Audit of Current State

This entry documents the real structure of Buddies OS as it stands, including
deviations from the original framework overview.

---

### Structure Notes vs Original Framework

| Area | Described | Actual |
|---|---|---|
| Auth module | `/api/authentication/` full module | `/api/auth/signout/` only — auth delegated to Supabase SSR client |
| Workspaces hierarchy | workspaces as parent of orgs/departments/agents/documents | All are independent top-level API routes |
| Styles | `/src/app/styles/` | `src/app/globals.css` (Tailwind) |
| Utilities | `/src/app/utils/` | `src/lib/` (supabaseClient, offline-store, command-parser, supabase helpers) |
| Tests directory | root `/tests/` | `src/__tests__/` |
| Analytics | `/api/analytics/` planned | Not yet implemented |

---

### API Routes (`src/app/api/`)

#### Added
- `agents/` — Agent CRUD (role-based: Owner, Project Head, Executive, Intern)
- `auth/signout/` — Sign-out endpoint; authentication handled by Supabase SSR
- `clients/` — Full CRUD for client management
  - `[id]/` — Individual client operations
  - `access/` — Client access control
  - `keywords/` — Client keyword tracking
  - `stages/` — Client pipeline stages
- `command/` — Natural language command dispatch
- `debug/context/` — Debug endpoint for context inspection
- `departments/` — Department CRUD
  - `activity/` — Department activity feed
- `design/tools/` — Design tool management (DALL-E, Canva, etc.)
  - `[id]/` — Individual tool operations
- `dev/tools/` — Development tool management
  - `[id]/` — Individual tool operations
  - `github/repos/` — GitHub repository list + `[id]/` details
- `documents/` — Document CRUD
  - `[id]/` — Individual document operations
- `marketing/calendar/` — Marketing calendar management
- `marketing/campaigns/` — Placeholder (empty, planned)
- `marketing/leads/` — Placeholder (empty, planned)
- `marketing/seo/` — SEO task tracking
- `marketing/social/` — Placeholder (empty, planned)
- `marketing/tasks/` — Marketing task management
- `members/` — Workspace member management
- `organizations/` — Organization CRUD
- `projects/` — Project CRUD
  - `tasks/` — Project task management
- `search/` — Global keyword search
- `summary/` — AI-powered workspace activity summaries
- `web-search/` — Tavily-backed web search
- `workspace/` — Single workspace operations
  - `accept/` — Invite acceptance
  - `activity/` — Workspace activity log
  - `invite/` — Member invitation
  - `members/` — Workspace member listing
- `workspaces/` — Multi-workspace listing/creation

#### AI Module (`api/ai/`) — Added
- `route.ts` — Main AI chat endpoint (Anthropic Claude)
- `check-rules/` — Validate actions against workspace rules
- `command/` — AI command interpretation
- `context/` — Context window management
- `decision-lessons/` — Extract lessons from past decisions
- `decision-patterns/` — Identify decision patterns
- `embed/` — Text embedding generation
- `execute-command/` — Execute parsed commands
- `extract/` — General content extraction
- `extract-command/` — Command extraction from natural language
- `extract-decision/` — Decision extraction from conversation
- `focus-recommendation/` — AI focus/priority recommendations
- `generate-insights/` — Generate workspace insights
- `insights/` — Retrieve stored insights
- `memory/` — AI memory store/retrieve
- `predictions/` — Predictive analytics
- `proactive/` — Proactive AI suggestions
- `query/` — AI knowledge base querying
- `save/` — Save AI-generated content
- `semantic-search/` — Vector/semantic search
- `sessions/` — AI session management
- `summarize-session/` — Session summarization
- `transcribe/` — Voice-to-text transcription
- `upload/` — File upload for AI context

---

### App Pages (`src/app/app/`)

#### Added
- `page.tsx` — Dashboard / home
- `ai/` — AI assistant chat interface
- `clients/` — Client list + `[id]/` detail view
- `command/` — Command palette page
- `daily-check/` — Daily standup / check-in
- `decisions/` — Decision log
- `new-decision/` — Create new decision
- `dept/design/` — Design department environment
- `dept/development/` — Development department environment
- `dept/marketing/` — Marketing department environment
- `documents/` — Document list + `[id]/` editor
- `marketing/` — Marketing overview
- `org/` — Organization list + `[id]/` detail
- `project-update/` — Project status update
- `projects/` — Project list + `[id]/` detail
- `research/` — Research / web search page
- `rules/` — Workspace rules management
- `search/` — Global search page
- `workspace/` — Workspace settings

---

### Components (`src/components/`)

#### Added
- `BottomNav.tsx` — Mobile bottom navigation bar
- `ContextPreviewModal.tsx` — AI context preview modal
- `ContextToggle.tsx` — Toggle AI context inclusion
- `FileUpload.tsx` — File upload with drag-and-drop
- `InstallPrompt.tsx` — PWA install prompt
- `MobileSidebar.tsx` — Collapsible mobile sidebar
- `OfflineIndicator.tsx` — PWA offline status banner
- `QuickActionsDropdown.tsx` — Header quick-actions menu
- `SearchModal.tsx` — Global search modal (Cmd+K)
- `SearchShortcutHint.tsx` — Keyboard shortcut hint display
- `SuggestionCard.tsx` — AI proactive suggestion card
- `SuggestionsPanel.tsx` — AI suggestions panel
- `VoiceInputButton.tsx` — Voice-to-text trigger button
- `WebSearchButton.tsx` — Web search trigger
- `WorkspaceSwitcher.tsx` — Multi-workspace switcher
- `dept/ActivityFeed.tsx` — Department activity feed
- `dept/MiniDashboard.tsx` — Department mini dashboard
- `dept/TaskBoard.tsx` — Kanban-style task board
- `dev/GitHubIntegration.tsx` — GitHub connection widget
- `org/AgentManager.tsx` — Agent role management UI
- `org/DepartmentManager.tsx` — Department setup UI
- `org/MemberManager.tsx` — Member invite/manage UI
- `org/OrganizationManager.tsx` — Organization CRUD UI
- `org/ProjectManager.tsx` — Project management UI

---

### Database Migrations (`supabase/migrations/`)

#### Added
- `20250101_add_organization_id.sql` — Adds `organization_id` foreign key
- `20250102_dept_environments.sql` — Design + Development environment tables with RLS
- `20250103_github_integrations.sql` — GitHub integration config table
- `20250104_documents.sql` — Documents table with RLS

---

### Infrastructure & Config

#### Added
- **Next.js 15** app router
- **Supabase** (auth + database) via `@supabase/ssr` and `@supabase/auth-helpers-nextjs`
- **Tailwind CSS 3** with `postcss`
- **PWA** via `next-pwa` — service worker, offline fallback, web manifest
- **AI SDKs** — `@anthropic-ai/sdk` (Claude), `openai`
- **Web search** — `@tavily/core`
- **Forms** — `react-hook-form` + `@hookform/resolvers` + `zod`
- **Markdown rendering** — `react-markdown`
- **Zip support** — `jszip`
- **Icons** — `lucide-react`
- **Testing** — Jest 30 + `ts-jest` + `jest-environment-node`

---

### Tests (`src/__tests__/`)

#### Added
- `api/clients.test.ts` — Client list/create API tests
- `api/clients-id.test.ts` — Client get/update/delete API tests
- `api/marketing-calendar.test.ts` — Marketing calendar API tests
- `api/marketing-seo.test.ts` — Marketing SEO API tests
- `api/marketing-tasks.test.ts` — Marketing tasks API tests
- `helpers/requestHelper.ts` — Test request factory
- `helpers/supabaseMock.ts` — Supabase client mock

---

### Known Gaps / Planned Work

- `marketing/campaigns/`, `marketing/leads/`, `marketing/social/` — routes created but not implemented
- Analytics module (`/api/analytics/`) — not yet built
- Full authentication flows beyond signout (password reset, email confirmation) — handled externally by Supabase
- Test coverage for: agents, documents, organizations, departments, projects, AI routes, dev/design tools
- `/src/app/utils/` utility layer — currently spread across `src/lib/`

---

## How to Use This File

Add an entry under `[Unreleased]` whenever you:
- Add a new API route or page
- Add or modify a database migration
- Add a new component
- Fix a bug
- Change a dependency

When shipping a release, move `[Unreleased]` items under a new version heading:

```
## [1.1.0] — YYYY-MM-DD
```
