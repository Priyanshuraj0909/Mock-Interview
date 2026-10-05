# Mock Interview

Practice technical interviews and timed mock tests with a React interface and a FastAPI API. Choose your subject or engineering role, answer questions, and review feedback generated with Google Gemini.

**Live site:** https://mock-interview-king-09.vercel.app

## Features

- Responsive landing page with direct access to mock tests and the interview studio.
- Ten-question mock tests configured by subject, purpose, difficulty, type, and time limit.
- Role-specific interview questions, optional job descriptions, typed answers, and browser voice tools.
- Answer feedback, score breakdowns, and another-test workflow.
- MongoDB-backed signup and login with bcrypt password hashing and JWT issuance.
- Retry failed question generation and submissions without losing selected answers.
- Same-origin API routing and client-side route refresh support on Vercel.

## Project layout

| Path | Purpose |
| --- | --- |
| `newmyapp/` | React 19 client, React Router, Tailwind CSS |
| `Ai/` | FastAPI application, MongoDB access, auth and Gemini routers |
| `api/index.py` | Vercel entrypoint for the existing API |
| `vercel.json` | React build, Python function, and SPA routing |
| `Ai/tests/` | API configuration and validation regression tests |

## Local setup

Use Node.js 22 and Python 3.12 for a deployment-compatible environment. A MongoDB connection and Gemini API key are required for accounts and AI features respectively.

### API

```bash
python3 -m venv .venv
source .venv/bin/activate
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp Ai/.env.example Ai/.env
```

Fill in `Ai/.env`, then start from the API directory:

```bash
cd Ai
uvicorn main:app --reload --port 8000
```

### Client

In another terminal:

```bash
cd newmyapp
npm ci --legacy-peer-deps
cp .env.example .env
npm start
```

Open http://localhost:3000. The example client environment points at `http://localhost:8000/api`. When no override is set, the client uses `/api` on its own origin, as it does in production.

## Server configuration

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Primary question generation and feedback key; server only. At least one AI provider key is required. |
| `GROQ_API_KEY` | Optional server-only key enabling fallback if Gemini is unavailable |
| `GROQ_MODEL` | Optional Groq model override; defaults to `openai/gpt-oss-20b` |
| `GEMINI_MODEL` | Optional model override; defaults to `gemini-3.8-flash` |
| `MONGODB_URI` | Required for accounts; MongoDB connection string |
| `MONGODB_DB` | Optional database name; defaults to `ai_mock_interview` |
| `JWT_SECRET_KEY` | Required for auth; use a random secret of at least 32 characters |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token lifetime; defaults to 60 minutes |
| `CORS_ORIGINS` | Comma-separated allowed origins; defaults to localhost:3000 |

Generate a JWT secret with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Store it in environment settings, never in Git. A production JWT secret was provisioned during deployment.

Missing AI or database configuration returns a clear HTTP 503 response. Deployment alone does not provision MongoDB or Gemini access. **AI generation and account flows remain unavailable until their server environment variables are configured.**

The previous source contained a Gemini key. It has been removed from current code, but remains in Git history. Revoke that key and create a replacement before enabling AI features.

## Deployment

The GitHub repository is linked to the `mock-interview` project on Vercel. Pushes to `main` trigger production builds. Import the repository with its root directory set to the repository root; `vercel.json` builds the client in `newmyapp` and serves the Python API under `/api`.

1. Set `GEMINI_API_KEY`, `MONGODB_URI`, and `JWT_SECRET_KEY` in Vercel project environment settings for the required environments.
2. Ensure the MongoDB deployment permits connections from the hosting environment.
3. Redeploy after changing environment variables.
4. Check `/api/test`, then verify signup, login, question generation, and submission.

`REACT_APP_API_BASE_URL` is needed only when hosting the API on a different origin. It is embedded at build time and must never contain a secret.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/test` | API health check |
| POST | `/api/auth/signup` | Create an account |
| POST | `/api/auth/login` | Issue a login token |
| POST | `/api/generate-test` | Generate ten mock-test questions |
| POST | `/api/submit-answers` | Score answers and generate feedback |
| POST | `/api/interview/generate-questions` | Generate five role-specific prompts |
| POST | `/api/interview/evaluate-answer` | Evaluate an interview answer |
| GET | `/api/interview/health` | Interview module status |

## Checks

```bash
cd newmyapp
CI=true npm test -- --watchAll=false
CI=true npm run build
```

From the repository root with the Python environment active:

```bash
pip install pytest httpx
python -m pytest Ai/tests -q
```

Tests cover retrying generation, preserving answers after submission failure, missing server configuration, and request bounds.

## Current limitations

- Mock-test scoring compares normalized strings, so open-ended answers can be marked incorrect even when semantically valid. Gemini feedback provides additional context.
- Tests and interview sessions are not saved in MongoDB; the database stores accounts only.
- JWTs are issued by login/signup, but practice routes are currently public and do not validate those tokens. Add enforcement and rate limiting before offering private or paid sessions.
- Voice features depend on browser support and microphone permission; typed answers remain available.
- The inherited Create React App toolchain and dependency tree include older packages and npm audit findings. Dependency modernization is separate work; do not apply forced upgrades without checking compatibility.

No license has been selected for this repository.

## Troubleshooting Atlas connections

If signup or login reports that the account database is unavailable, inspect the Vercel runtime log. A `ServerSelectionTimeoutError` with a TLS handshake failure means the driver cannot establish a database connection; it does not mean the signup password is wrong.

- Confirm the Atlas cluster is running and `MONGODB_URI` uses its current driver connection string.
- Check Atlas **Network Access → IP Access List**: it must permit the hosting environment's outbound addresses. An entry for your laptop alone does not allow Vercel.
- Check the database user's credentials and URL-encode special characters in the URI password.
- Redeploy after changing Vercel environment variables.

The API bundles `certifi` roots and keeps TLS certificate verification enabled. Database failures return HTTP 503 with a retry message, without exposing driver connection details. Atlas configuration must still allow the connection.

## AI fallback

Gemini is tried first. Temporary overload, rate-limit, and transport errors receive one retry after one second, with a 15-second timeout per attempt. If generation still fails, the API uses Groq when `GROQ_API_KEY` is configured. Groq has a 20-second timeout. If only Groq is configured, it is used directly. The same behavior covers mock tests, interview questions, and answer feedback.

When both providers fail, the API returns a friendly HTTP 503 response with `Retry-After: 10`, and mock-test answers remain available for resubmission. Add the Groq key in Vercel environment settings and redeploy to enable failover. Provider errors and keys are never included in the response. See [Groq's API documentation](https://console.groq.com/docs/text-chat) for key setup and model use.
