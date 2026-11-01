# Development roadmap

## Delivered in version 0.2.0

- JWT verification and account existence checks on every private practice API.
- Database-backed per-user request quotas across serverless instances.
- Server-owned questions and reference answers; submissions send a session ID and answers.
- Strict question counts, unique IDs, valid MCQ answer keys, bounded feedback scores.
- Private saved sessions, conflict-aware autosave, history, and resumable practice.
- Grading leases and idempotent retry behavior, including recovery from expired leases.
- Resume PDF/text extraction, role/job/resume-based questions, and adaptive follow-ups.
- Interview reports with strengths, improvement points, and topic-level study suggestions.
- Vite, incremental TypeScript adoption, PyMongo Async, and pinned direct Python dependencies.
- Vitest/pytest regression coverage and GitHub Actions test/build checks.
- A starter dataset and CLI for measuring actual grading behavior.

## Delivered in version 0.3.0

- Personal score trends grouped by practice type, subject/role, and difficulty.
- Interview topic priorities using latest scores for distinct normalized questions; follow-ups excluded.
- Password-confirmed recovery-code generation, single-use password resets, and token revocation.
- Rotating opaque 30-day refresh cookies with HttpOnly, SameSite Strict and production Secure flags.
- Password-confirmed account and practice-data deletion.
- Authentication attempt limits and opt-in metadata-only provider/request logs.
- 36 synthetic evaluation cases, bounded grading batches, role breakdowns, and model configuration in reports.
- Disposable-account production smoke script covering real persistence and optional live AI flows.

## Next release: measure and improve personalization

- Obtain independent human review of synthetic evaluation labels and expand role coverage.
- Run the live benchmark against supported Gemini/Groq models and publish results with model configuration.
- Add opt-in Langfuse tracing with resume/answer redaction; collect latency, token usage, fallback rate, and scoring failures.
- Extend historical analytics beyond the latest 100 sessions and detect semantic duplicate questions.
- Add email-based recovery with a verified delivery service and configurable data retention.
- Add source-grounded study material. Start with a curated collection and MongoDB Vector Search only when document volume warrants retrieval.

## Voice release

Integrate LiveKit Agents with streaming transcription, speech output, turn detection, and interruption handling.
The voice agent needs a continuously running worker alongside the existing Vercel frontend/API;
it cannot be implemented as an ordinary short-lived Vercel request. Choose hosting and configure
LiveKit plus speech-provider credentials before enabling the feature. Measure latency and per-session cost.
Browser speech recognition/synthesis remains the currently implemented voice option.

## Coding release

Add an editor and a separate Judge0 execution service. Keep hidden tests on the server, enforce language,
CPU, memory, output, network, and concurrency restrictions, and use job polling for execution results.
Never execute candidate code inside the FastAPI/Vercel process. Combine test-case verdicts with
AI explanations, without presenting AI reasoning as executed code.

## Validation boundaries

Backend regression tests use a deterministic in-memory MongoDB substitute and mocked AI providers.
They verify auth, ownership, contracts, retries, quotas, concurrency controls, and grading-report handling;
they do not establish live MongoDB interoperability or real-model grading accuracy.
Local desktop/mobile browser checks used mocked API responses to exercise complete UI flows.
The screenshots in this repository are from those local checks with demonstration content.
The live grading CLI is explicit opt-in and consumes provider credits.
