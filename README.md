# ConnectX Integration Copilot

A multi-agent AI assistant that helps developers plan integrations with the ConnectX Orders API. You describe what you need in plain English, for example "pull all orders from yesterday for the finance report", and the copilot works out the API calls, checks them against the API documentation, and returns a verified integration plan.

Five agents handle the steps: they parse the request, ground it in the docs, design the call, validate constraints, and verify the result, looping until the answer is grounded. It runs locally with n8n and Ollama (Mistral), so no cloud API is required.

<img width="1905" height="916" alt="Screenshot 2026-09-17 133907" src="https://github.com/user-attachments/assets/62bc0be4-093e-4f98-88cb-a998bbcaa515" />


## Features

- Turns plain-English requests into validated Orders API integration plans
- Five-agent workflow with a verification loop that repeats until the answer is grounded in the API docs
- Runs fully local with Ollama (Mistral), with optional cloud providers (Mistral, Groq)
- n8n workflow as the main copilot, plus a Python/FastAPI fallback backend
- React (Vite) interface for the backend

## Project structure

| Path | Description |
|---|---|
| `docker-compose.yml` | Runs n8n (port 5678) and Ollama (port 11434) |
| `seventeen.json` | The n8n workflow. Import it into n8n; it is the copilot |
| `src/cx_copilot/` | Python backend (orchestrator, agents, FastAPI), used as a Python-only fallback |
| `frontend/` | React (Vite) single-page app for the backend |
| `n8n-scripts/` | The individual agent JavaScript steps, kept for documentation and reference |
| `requirements.txt`, `.env.example` | Dependencies and configuration |

## Prerequisites

- Docker and Docker Compose
- Python 3 (only for the Python backend)
- Node.js (only for the React frontend)

## Quick start

### 1. Start n8n and Ollama

```bash
cp .env.example .env    # edit if you want cloud providers
docker compose up -d    # pulls the n8n and Ollama images
```

Open the n8n UI at http://localhost:5678, then import `seventeen.json` (Workflows → Import) and activate it.

### 2. Pull the local model (first time only)

```bash
docker compose exec ollama ollama pull mistral
```

### 3. Python backend (optional)

Only needed for the fallback API or the React UI.

```bash
pip install -r requirements.txt
uvicorn src.cx_copilot.api.main:app --reload --port 8000
```

### 4. React frontend (optional)

```bash
cd frontend
npm install
npm run dev    # http://localhost:5173
```

## Using the copilot

Open the n8n chat window of the activated workflow, or use the test webhook `http://localhost:5678/webhook-test/copilot-trigger` while listening in the editor, and ask something like:

> I need to pull all orders from yesterday for the finance report daily

### Example output

```
[paste a short example of what the copilot returns]
```

## How it works

1. **Agent 1** parses the requirements from the request
2. **Agent 2** grounds them against the API docs
3. **Agent 3** designs the API call
4. **Agent 4** validates the design and adds constraints
5. **Agent 5** synthesizes the final plan
6. A verification step checks the result and loops until it is grounded

## Configuration

| Variable | Purpose |
|---|---|
| `LLM_PROVIDER` | `ollama` (default, local), `mistral`, or `groq` |
| `OLLAMA_BASE_URL` | Ollama endpoint for the Python backend |
| `N8N_WEBHOOK_URL` | If set, the backend sends requests through the n8n workflow instead of the local agents |

See `.env.example` for the full list, including API keys for cloud providers.

## Tech stack

n8n, Python, FastAPI, LangGraph, Pydantic, React, Vite, Ollama, Mistral, SQLite, Docker

## Author

Garima Dangol
