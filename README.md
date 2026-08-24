# Buddies OS

Buddies OS is a Next.js application with Supabase backend support.

## Stack
- Next.js
- TypeScript
- Tailwind CSS
- Supabase
- Jest

## Getting Started
1. Install dependencies:
   pnpm install

2. Copy `.env.example` to `.env.local` and add your Supabase URL and anon key.

3. Start development server:
   pnpm dev

4. Run tests and create a production build:
   pnpm test
   pnpm build

## Environment
Only Supabase public configuration is required to load the core app. AI,
research, deployment, and trading integrations require their corresponding
keys from `.env.example`.

## Notes
This repository excludes build artifacts, temp files, and generated service worker assets from version control.
