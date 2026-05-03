# Vane

[![Docker Pulls](https://img.shields.io/docker/pulls/goshitsarch/vane?color=blue)](https://hub.docker.com/r/goshitsarch/vane) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A **privacy-focused AI answering engine** that runs on your own hardware. Combines web search with local and cloud LLMs to deliver cited answers — privately.

**Fork of [ItzCrazyKns/Vane](https://github.com/ItzCrazyKns/Vane)** with additional AI providers, alternative search backends, and bug fixes.

![preview](.assets/vane-screenshot.png)

## What's different in this fork

- **More AI providers:** OpenRouter, generic OpenAI-compatible endpoints, LiteLLM proxy
- **Alternative search backends:** Brave Search, Exa, Tavily (in addition to SearXNG default)
- **Bug fixes:** Embedding-optional architecture (OpenRouter/Anthropic/Groq no longer block search), model persistence fixes, better error messages, SearXNG engine dedup, config hash collision fix

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

## One-Click Deploy

[![Deploy on Hostinger](https://assets.hostinger.com/vps/deploy.svg)](https://www.hostinger.com/vps/docker-hosting?compose_url=https://raw.githubusercontent.com/goshitsarch-eng/Vane/refs/heads/master/docker-compose.yaml)

## License

MIT — see [LICENSE](LICENSE) for details.
