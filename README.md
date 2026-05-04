# Markdown AI Translator

A VS Code extension that translates `.md` files via any LLM and streams the result into a side preview. Nothing is written to disk.

- **Markdown-aware** — preserves headings, lists, tables, code fences, math, links, front matter, footnotes
- **No-translate zones** — code blocks, inline `code`, `$math$`, URLs, and HTML stay byte-for-byte identical
- **Variable-safe** — `{{var}}`, `${var}`, `%s`, `{0}`, Jinja/Liquid/Handlebars tags are never touched
- **Zero-prose output** — the preview contains only the translation, never "Here is the translation…"
- **Bring your own LLM** — OpenAI, Anthropic, OpenRouter, MiniMax, DeepSeek, Together, Groq, Ollama, vLLM, LM Studio, anything OpenAI-compatible
- **Streaming** — see the translation appear token by token

## Install

Download the latest `.vsix` from the [Releases](https://github.com/meetroger/vscode-markdown-ai-translator/releases) page (or build it yourself — see below), then:

```bash
code --install-extension markdown-ai-translator-0.1.0.vsix
```

Or in VS Code: **Extensions** panel (⇧⌘X) → `…` menu → **Install from VSIX…** → pick the file. Reload the window when prompted.

### Build it yourself

```bash
git clone git@github.com:meetroger/vscode-markdown-ai-translator.git
cd vscode-markdown-ai-translator
npm install
npx @vscode/vsce package --allow-missing-repository --skip-license
code --install-extension markdown-ai-translator-0.1.0.vsix
```

## Configure

Open Settings (⌘,) and search **`markdown ai`**, or paste straight into your `settings.json`:

```jsonc
// OpenAI
"markdownAiTranslator.provider": "openai-compatible",
"markdownAiTranslator.endpoint": "https://api.openai.com/v1",
"markdownAiTranslator.apiKey":   "sk-...",
"markdownAiTranslator.model":    "gpt-4o-mini",
"markdownAiTranslator.targetLanguage": "Simplified Chinese"
```

### Provider quick-start

| Provider | `provider` | `endpoint` | Example `model` |
|---|---|---|---|
| OpenAI | `openai-compatible` | `https://api.openai.com/v1` | `gpt-4o-mini`, `gpt-4o` |
| Anthropic (native) | `anthropic` | `https://api.anthropic.com/v1` | `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` |
| OpenRouter | `openai-compatible` | `https://openrouter.ai/api/v1` | `anthropic/claude-3.5-sonnet`, `openai/gpt-4o-mini` |
| MiniMax | `openai-compatible` | `https://api.minimaxi.chat/v1` | `MiniMax-Text-01` |
| DeepSeek | `openai-compatible` | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Groq | `openai-compatible` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Together | `openai-compatible` | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| Ollama (local) | `openai-compatible` | `http://localhost:11434/v1` | `llama3.1`, `qwen2.5` (no API key) |
| LM Studio (local) | `openai-compatible` | `http://localhost:1234/v1` | whatever you loaded (no API key) |

> Use `openai-compatible` for Claude models accessed **via** OpenRouter. The native `anthropic` mode is only for direct calls to `api.anthropic.com`.

### All settings

| Key | Default | Notes |
|---|---|---|
| `provider` | `openai-compatible` | `openai-compatible` or `anthropic` |
| `endpoint` | `https://api.openai.com/v1` | Base URL |
| `apiKey` | `""` | Put in **User** settings, not workspace settings, so it doesn't get committed |
| `model` | `gpt-4o-mini` | |
| `targetLanguage` | `Simplified Chinese` | e.g. `Japanese`, `Spanish`, `Brazilian Portuguese` |
| `additionalInstructions` | `""` | Extra system-prompt instructions (tone, glossary…) |
| `temperature` | `0.2` | Keep low for technical docs |
| `maxTokens` | `8192` | |
| `stream` | `true` | |
| `previewMode` | `rendered` | `rendered`, `source`, or `both` |
| `extraHeaders` | `{}` | e.g. `{"HTTP-Referer": "https://my-app", "X-Title": "My App"}` for OpenRouter |

## Use

Open any `.md` file and pick one of:

- **Right-click → Translate Document** — translate the whole file into your configured `targetLanguage`
- **Right-click → Translate Selection** — translate only the highlighted text
- **⇧⌘P → Translate Document To…** — pick a one-off target language without changing settings
- The translate button in the editor title bar

The translation streams into a new tab to the side — rendered markdown by default. Cancel anytime via the progress notification.

### Save the translation

The output is intentionally a virtual document — nothing on disk. To keep it:

1. Set `markdownAiTranslator.previewMode` to `source` or `both`
2. Focus the source view of the translation
3. **⌘S** → Save As… → pick a real path

## Tips

- **Glossary / tone**: put project-specific guidance in `additionalInstructions`, e.g. `"Translate 'pull request' as 'PR'. Use formal tone."`
- **Cheap drafts**: use a small/fast model (`gpt-4o-mini`, `claude-haiku-4-5-20251001`, `deepseek-chat`, or local Ollama) for first passes.
- **Large docs**: bump `maxTokens` if you see truncated output.
- **OpenRouter ranking**: set `extraHeaders` to identify your app for the OpenRouter leaderboard.

## License

MIT
