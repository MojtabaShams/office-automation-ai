# Office Automation System

A prototype for managing administrative workflows, featuring an administration dashboard, a public client portal, and a sample AI service. The application interfaces are in Persian and use right-to-left layouts.

## Project Components

- `apps/admin`: Administration dashboard for employees, requests, calendar events, and processes
- `apps/client`: Client portal for submitting and tracking requests
- `ai-agent`: Sample FastAPI service that simulates form extraction from uploaded files
- `packages`: Shared monorepo configuration and UI components

Some data and operations are currently local demonstrations. The AI service is a prototype and does not perform actual document extraction yet.

## AI Form Assistance

- The LangGraph workflow routes each turn between conversation guidance, form completion, and database-backed field guidance.
- Leave requests keep missing date slots in the chat session, parse Jalali date ranges, calculate inclusive days, and prefill the authenticated user's profile into the process stepper.
- Form field guidance is stored in `field_guidelines` and seeded from form help text, completion rules, and examples.
- `/api/chat/stream` sends agent activity events over SSE as each step runs; the client displays them while waiting for the final response.

## Prerequisites

- Node.js 24 or later
- npm 11
- Docker Compose (for running the containerized services)

## Run the Web Applications

Install dependencies from the repository root:

```powershell
npm ci
```

Start the client portal on port 3002:

```powershell
npm run dev
```

Start the administration dashboard on port 3000 in a separate terminal:

```powershell
npm --workspace ./apps/admin run dev
```

## Run the Docker Services

Create a local environment file and set a strong database password:

```powershell
Copy-Item .env.example .env
```

Then start the services:

```powershell
docker compose up --build
```

The local `.env` file is ignored by Git. Do not add real credentials to the repository.
For LLM-backed answers, add at least one provider key to this root `.env`:

```dotenv
GAPGPT_API_KEY=
# Or use Groq when GapGPT is not configured:
GROQ_API_KEY=
```

GapGPT is used for the multi-model ensemble when its key is set; Groq is the single-model
fallback. Without either key, the agent intentionally uses deterministic fallback responses.

## Checks

```powershell
npm run lint
npm run check-types
npm run build
```
