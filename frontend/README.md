This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Hands-free live cooking and camera coach

The complete Phase 3 demo uses three local services. From the repository root,
start the HTTP voice/vision and cooking-agent service:

```bash
.venv/bin/uvicorn voice.app:app --reload --port 8000
```

In a second terminal, start the Realtime relay:

```bash
.venv/bin/uvicorn backend.app:app --reload --port 8001
```

In a third terminal, run this frontend:

```bash
npm run dev
```

Copy `.env.local.example` to `.env.local` if either local URL differs. The
browser file contains only service URLs—never put API keys in it. Open a
recipe, start cooking, and use **Enable hands-free Remy** once to grant camera
and microphone permission. After that, talk normally and speak over Remy to
interrupt a reply. The camera coach sends a compressed JPEG only when the view
changes, at most once every five seconds and 12 times per hands-free session;
turn hands-free off to stop it immediately.

## Durable Backboard memory

Add `BACKBOARD_API_KEY` to the root `.env` and restart the service on port
8000. In the cooking view, **Remy's kitchen memory** lets the cook explicitly
save or forget a preference. It is isolated to that browser and recalled for
relevant camera-agent turns. See [the memory guide](../docs/backboard-memory.md).

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
