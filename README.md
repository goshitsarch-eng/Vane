# Vane

[![Docker Pulls](https://img.shields.io/docker/pulls/goshitsarch/vane?color=blue)](https://hub.docker.com/r/goshitsarch/vane) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A **privacy-focused AI answering engine** that runs on your own hardware. Combines web search with local and cloud LLMs to deliver cited answers — privately.

**Fork of [ItzCrazyKns/Vane](https://github.com/ItzCrazyKns/Vane)** with additional AI providers, alternative search backends, and bug fixes.

![preview](.assets/vane-screenshot.png)

## What's different in this fork

- **More AI providers:** OpenRouter, generic OpenAI-compatible endpoints, LiteLLM proxy
- **Alternative search backends:** Brave Search, Exa, Tavily (in addition to SearXNG default)
- **Bug fixes:** Embedding-optional architecture (OpenRouter/Anthropic/Groq no longer block search), model persistence fixes, better error messages, SearXNG engine dedup, config hash collision fix

## Recent Fixes (v2.0.1)

- **Brave Search via env var:** `SEARCH_BACKEND=brave` now correctly activates Brave Search from environment variables ([details](#environment-variables)).
- **LiteLLM / Generic / Groq / LM Studio structured output:** Fixed `generateObject`/`streamObject` which previously relied on OpenAI-specific beta APIs unavailable on third-party endpoints. Now uses standard `response_format: { type: 'json_object' }` compatible with any OpenAI-compatible API.
- **Anthropic native adapter:** Replaced broken OpenAI-shim with a proper Anthropic Messages API adapter including streaming, tool calls, and structured output.
- **Image/video search fallback:** When SearXNG is not the active backend, image/video search now gracefully falls back to the configured text search backend instead of crashing.
- **LiteLLM/Generic model discovery:** Added error logging when `/models` endpoints return non-200.
- **OpenRouter attribution:** Added `HTTP-Referer` and `X-Title` headers for improved rate-limiting and attribution.
- **Docker Compose config:** Documented all supported environment variables in `docker-compose.yaml`.
- **Entrypoint hardening:** `entrypoint.sh` now validates SearXNG engine names before writing config to avoid corruption with non-SearXNG backends (Exa, Tavily).

## Features

- **Multi-provider LLM support** — Ollama, OpenAI, Anthropic, Gemini, Groq, OpenRouter, any OpenAI-compatible API
- **Multiple search backends** — SearXNG (default), Brave, Exa, Tavily
- **Smart search modes** — Speed, Balanced, Quality
- **Source selection** — Web, discussions, academic papers
- **Widgets** — Weather, calculations, stock prices
- **File uploads** — PDFs, text, images; ask questions about your documents
- **Image and video search**
- **Local search history**
- **Discover feed** — Trending articles without searching

## Quick Start

**Docker (recommended):**

```bash
docker run -d -p 3000:3000 -v vane-data:/home/vane/data --name vane goshitsarch/vane:latest
```

**Docker Compose:**

```bash
git clone https://github.com/goshitsarch-eng/Vane.git
cd Vane
docker compose up -d
```

Open http://localhost:3000 and configure your API keys and models.

**With your own SearxNG instance:**

```bash
docker run -d -p 3000:3000 -e SEARXNG_API_URL=http://your-searxng:8080 -v vane-data:/home/vane/data goshitsarch/vane:slim-latest
```

## Non-Docker Install

1. Install SearXNG with JSON format and Wolfram Alpha enabled
2. `git clone https://github.com/goshitsarch-eng/Vane.git && cd Vane`
3. `npm i && npm run build && npm run start`
4. Open http://localhost:3000

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SEARCH_BACKEND` | `searxng` | Search backend: `searxng`, `brave`, `exa`, `tavily` |
| `SEARXNG_API_URL` | `http://localhost:8080` | SearXNG instance URL |
| `BRAVE_API_KEY` | — | Brave Search API key |
| `EXA_API_KEY` | — | Exa API key |
| `TAVILY_API_KEY` | — | Tavily API key |
| `OPENROUTER_API_KEY` | — | OpenRouter API key |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | OpenRouter base URL |
| `LITELLM_BASE_URL` | — | LiteLLM proxy base URL |
| `LITELLM_API_KEY` | — | LiteLLM proxy API key (optional) |
| `GENERIC_OPENAI_BASE_URL` | — | Generic OpenAI-compatible API base URL |
| `GENERIC_OPENAI_API_KEY` | — | Generic OpenAI-compatible API key (optional) |

## Build from Source

```bash
git clone https://github.com/goshitsarch-eng/Vane.git
cd Vane
docker build -t vane .
docker run -d -p 3000:3000 -v vane-data:/home/vane/data --name vane vane
```

## Troubleshooting

**Local LLM servers:** Ensure your server listens on `0.0.0.0` (not `127.0.0.1`), correct model name, and a non-empty API key field.

**Ollama connection errors:**
- Windows/Mac: `http://host.docker.internal:11434`
- Linux: `http://<host_private_ip>:11434` + `Environment="OLLAMA_HOST=0.0.0.0:11434"` in systemd

**Lemonade connection errors:**
- Windows/Mac: `http://host.docker.internal:8000`
- Linux: `http://<host_private_ip>:8000`

## Use as Browser Search Engine

Add a site search with URL: `http://localhost:3000/?q=%s`

## License

MIT — see [LICENSE](LICENSE) for details.
