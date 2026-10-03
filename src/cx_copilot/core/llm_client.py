"""Minimal LLM client that works with Ollama (local), Groq (free cloud), and Mistral.

Switch via config: set LLM_PROVIDER=ollama, groq, or mistral in .env
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Literal

import httpx

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

Provider = Literal["ollama", "groq", "mistral"]

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


def _env() -> dict:
    """Read configuration from the environment, refreshed per call so a .env
    file can be edited without restarting anything."""
    if load_dotenv:
        load_dotenv(_PROJECT_ROOT / ".env")
        load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    return {
        "provider": os.getenv("LLM_PROVIDER", "ollama"),
        "ollama_base": os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
        "ollama_model": os.getenv("OLLAMA_MODEL", "mistral"),
        "groq_base": os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
        "groq_model": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        "groq_key": os.getenv("GROQ_API_KEY", ""),
        "mistral_base": os.getenv("MISTRAL_BASE_URL", "https://api.mistral.ai/v1"),
        "mistral_model": os.getenv("MISTRAL_MODEL", "mistral-small-latest"),
        "mistral_key": os.getenv("MISTRAL_API_KEY", ""),
    }


class LLMClient:
    def __init__(self, provider: Provider | None = None):
        timeout = float(os.getenv("LLM_TIMEOUT", "600"))
        self.http = httpx.Client(timeout=timeout)
        cfg = _env()
        self.provider = provider or cfg["provider"]
        self.ollama_base = cfg["ollama_base"]
        self.ollama_model = cfg["ollama_model"]
        self.groq_base = cfg["groq_base"]
        self.groq_model = cfg["groq_model"]
        self.groq_key = cfg["groq_key"]
        self.mistral_base = cfg["mistral_base"]
        self.mistral_model = cfg["mistral_model"]
        self.mistral_key = cfg["mistral_key"]

    def generate(self, prompt: str, system: str = "", temperature: float = 0.0) -> dict:
        if self.provider == "groq":
            return self._groq_call(prompt, system, temperature)
        if self.provider == "mistral":
            return self._mistral_call(prompt, system, temperature)
        return self._ollama_call(prompt, system, temperature)

    def _ollama_call(self, prompt: str, system: str, temperature: float) -> dict:
        body: dict = {
            "model": self.ollama_model,
            "messages": [],
            "format": "json",
            "stream": False,
            "keep_alive": os.getenv("OLLAMA_KEEP_ALIVE", "30m"),
            "options": {"temperature": temperature, "num_predict": 800},
        }
        if system:
            body["messages"].append({"role": "system", "content": system})
        body["messages"].append({"role": "user", "content": prompt})

        urls = [self.ollama_base]
        if "localhost" in self.ollama_base:
            urls.append(self.ollama_base.replace("localhost", "127.0.0.1"))
        if "127.0.0.1" in self.ollama_base and "localhost" not in self.ollama_base:
            urls.append(self.ollama_base.replace("127.0.0.1", "localhost"))

        last_error: Exception | None = None
        for base in dict.fromkeys(urls):
            try:
                r = self.http.post(f"{base}/api/chat", json=body)
                r.raise_for_status()
                content = r.json()["message"]["content"]
                return json.loads(content)
            except (httpx.ConnectError, httpx.HTTPStatusError, ValueError) as exc:
                last_error = exc
                continue

        if last_error is not None:
            raise last_error
        raise RuntimeError(f"Could not reach Ollama at {self.ollama_base}")

    def _groq_call(self, prompt: str, system: str, temperature: float) -> dict:
        if not self.groq_key:
            raise RuntimeError("GROQ_API_KEY not set in .env")
        messages: list[dict] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        r = self.http.post(
            f"{self.groq_base}/chat/completions",
            headers={"Authorization": f"Bearer {self.groq_key}"},
            json={
                "model": self.groq_model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": 800,
                "response_format": {"type": "json_object"},
            },
        )
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
        return json.loads(content)

    def _mistral_call(self, prompt: str, system: str, temperature: float) -> dict:
        if not self.mistral_key:
            raise RuntimeError("MISTRAL_API_KEY not set in .env")
        messages: list[dict] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        r = self.http.post(
            f"{self.mistral_base}/chat/completions",
            headers={"Authorization": f"Bearer {self.mistral_key}"},
            json={
                "model": self.mistral_model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": 800,
                "response_format": {"type": "json_object"},
            },
        )
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
        return json.loads(content)
