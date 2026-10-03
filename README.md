# Pexusproject - ConnectX Integration Copilot

Runnable project: n8n agent workflow (LLM agents over the ConnectX Orders API) + Python backend + React frontend.

## What's inside

- `docker-compose.yml` — runs **n8n** (port 5678) + **Ollama** (port 11434)
- `seventeen.json` — the n8n workflow (import into n8n, it IS the copilot)
- `src/cx_copilot/` — Python backend (Python-only fallback: orchestrator + agents + FastAPI)
- `frontend/` — React (Vite) SPA for the backend
- `n8n-scripts/` — the individual agent JS steps (documentation & reference)
- `requirements.txt`, `.env.example` — dependencies & config

## Quick start

### 1. Start n8n + Ollama (Docker)

```bash
cp .env.example .env    # edit if you want cloud providers
docker compose up -d    # pulls n8n + ollama images
```

- n8n UI → http://localhost:5678
- Import `seventeen.json` (Workflows → Import), then **Activate** it.

### 2. Pull the local model (first time only)

```bash
docker exec -it <ollama container> ollama pull mistral
```

### 3. Python backend (optional — only needed if you use the fallback API or the React UI)

```bash
pip install -r requirements.txt
uvicorn src.cx_copilot.api.main:app --reload --port 8000
```

### 4. React frontend (optional)

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

## Using the copilot

Open the n8n chat window of the activated workflow (or the test webhook `http://localhost:5678/webhook-test/copilot-trigger` while listening in the editor) and ask e.g.:

> "I need to pull all orders from yesterday for the finance report daily"

The workflow parses requirements (Agent 1), grounds them against the API docs (Agent 2), designs the call (Agent 3), validates + adds constraints (agents 4), synthesizes (Agent 5), and verifies + loops until grounded.

## Env flags

| Var | Purpose |
| --- | --- |
| `LLM_PROVIDER` | `ollama` (default, local) / `mistral` / `groq` |
| `OLLAMA_BASE_URL` | Ollama endpoint for the Python back-end |
| `N8N_WEBHOOK_URL` | if set, back-end routes through the n8n workflow instead of local agents |