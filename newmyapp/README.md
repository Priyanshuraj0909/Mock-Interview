# Mock Interview client

[Open the live project](https://mock-interview-king-09.vercel.app)

React 19 + Vite + TypeScript client. See the [repository README](../README.md) for API configuration, features, and deployment.

```bash
npm ci
cp .env.example .env
npm start
```

The dev server runs on port 3000 and proxies `/api` to FastAPI on port 8000.
`VITE_API_BASE_URL` overrides that location. Existing `REACT_APP_API_BASE_URL` deployments remain supported as a fallback.

```bash
npm test
npm run build
```

Tests use Vitest and React Testing Library. Builds type-check the TypeScript modules, then write the Vite production bundle to `build/` for the existing Vercel configuration.
