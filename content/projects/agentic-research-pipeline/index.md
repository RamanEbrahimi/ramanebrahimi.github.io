---
title: "Self-hosted agentic research pipeline"
date: 2026-06-01
lastmod: 2026-10-07
tags: ["LLM agents", "LangGraph", "FastAPI", "Ollama", "research tooling"]
description: "A multi-agent research pipeline that runs open-weight LLMs on a campus GPU workstation and is operated remotely over Tailscale."
summary: "A multi-agent research pipeline that runs open-weight LLMs on a campus GPU workstation and is operated remotely over Tailscale."
editPost:
    URL: "https://github.com/RamanEbrahimi"
    Text: "GitHub"
---

---

##### Overview

An autonomous multi-agent research pipeline that runs open-weight language models on a campus GPU workstation
through Ollama and is driven from a laptop over Tailscale. Nine playbooks cover literature review, ideation,
model refinement, proof attempts, simulation experiments, draft updates and adversarial verification.

---

##### How it works

Eight specialized agents are orchestrated with LangGraph state machines using mixture-of-agents ensembling:
every step queries three local models (Gemma 26B, DeepSeek-R1 32B, Qwen 27B) and merges their outputs with a
cloud synthesizer model. A token-authenticated FastAPI server and browser dashboard provide live log streaming
over SSE, pause/resume, human-in-the-loop approval checkpoints and SQLite checkpointing for crash-resumable
runs. All artifacts are committed append-only to a git-backed research knowledge base.

Tools: Python, LangGraph, FastAPI, Ollama, SQLite, Tailscale.
