# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A VS Code extension that translates `.md` files via a configurable LLM and streams the result into a side preview. No file is written to disk — the preview is fed by a virtual `TextDocumentContentProvider`.

## Commands

```bash
npm install              # one-time
npm run compile          # tsc -p ./    (outputs to out/)
npm run watch            # tsc -watch -p ./

# Package & install into your real VS Code
npx @vscode/vsce package --allow-missing-repository --skip-license
code --install-extension markdown-ai-translator-<version>.vsix --force
```

There are no tests and no linter configured.

**Iterating on the extension itself**: open this folder in VS Code and hit **F5** (uses [.vscode/launch.json](.vscode/launch.json)) — that opens an Extension Development Host window with the extension live. Reload it with ⇧⌘P → "Developer: Reload Window" after rebuilding.

## Architecture

Three source files, each with one job:

- **`src/extension.ts`** — VS Code wiring. Registers a `TextDocumentContentProvider` for the custom URI scheme `markdown-ai-translator:`. On a translate command it (1) builds a unique virtual URI ending in `.md` (so VS Code auto-detects markdown), (2) calls `vscode.workspace.openTextDocument(uri)` to load it, (3) opens it via `markdown.showPreviewToSide` (or as a text editor, per `previewMode` config), then (4) starts the LLM call and `provider.append(uri, chunk)`s each streamed token. Each append fires `onDidChange`, which is what makes the side preview update live.
- **`src/translator.ts`** — Provider-agnostic LLM client. Two code paths share a single `consumeSSE` helper:
  - `openai-compatible` → POST `{endpoint}/chat/completions` with `Authorization: Bearer`. Covers OpenAI, OpenRouter, MiniMax, DeepSeek, Together, Groq, Ollama, vLLM, LM Studio.
  - `anthropic` → POST `{endpoint}/messages` with `x-api-key` + `anthropic-version: 2023-06-01`. Only for direct calls to api.anthropic.com — Claude via OpenRouter goes through the OpenAI path.
  Cancellation flows from `vscode.window.withProgress({cancellable:true})` → `AbortController.signal` → `fetch`. Uses Node 18+ global `fetch`; no SDK dependencies.
- **`src/prompt.ts`** — The system prompt **is the product**. It hard-codes the contract that downstream callers depend on: preserve every Markdown symbol, treat code/math/URLs/front-matter as no-translate zones, leave `{{var}}` / `${var}` / `%s` / `{0}` placeholders untouched, use idiomatic technical terminology, and emit zero prose (no "Here is the translation…" preamble, no wrapping ` ```markdown ` fence). When changing this file, preserve those guarantees — they are the reason the extension exists.

## Settings contract

User-facing config lives in [package.json](package.json) under `contributes.configuration.markdownAiTranslator.*`. The `provider` enum is intentionally just two values (`openai-compatible`, `anthropic`) because that's all the API surface the world needs. Adding a third only makes sense if a major provider invents a new wire protocol.

## Why no debounce on streaming

`provider.append` fires `onDidChange` on every token. Markdown previews handle this well at typical doc sizes; if you ever add debouncing, do it in `TranslationContentProvider`, not at the call site, so non-streaming paths still update immediately.

## Publishing

`publisher` in `package.json` is `"local"` for sideloading. To publish to the Marketplace, change it to a real publisher ID and run `vsce publish` (needs a PAT).
