# Mock Interview client

**[Open the live project →](https://mock-interview-king-09.vercel.app)**

React client for the Mock Interview platform. See the [repository README](../README.md) for API setup, environment variables, deployment, tests, and limitations.

```bash
npm ci --legacy-peer-deps
cp .env.example .env
npm start
```

Use `npm run build` for production and `CI=true npm test -- --watchAll=false` for regression tests. The local example connects to `http://localhost:8000/api`; production defaults to same-origin `/api`.
