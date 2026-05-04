import * as vscode from 'vscode';
import { translate, TranslatorConfig, Provider } from './translator';

const SCHEME = 'markdown-ai-translator';

class TranslationContentProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }

  set(uri: vscode.Uri, content: string): void {
    this.contents.set(uri.toString(), content);
    this.emitter.fire(uri);
  }

  append(uri: vscode.Uri, chunk: string): void {
    const prev = this.contents.get(uri.toString()) ?? '';
    this.contents.set(uri.toString(), prev + chunk);
    this.emitter.fire(uri);
  }

  has(uri: vscode.Uri): boolean {
    return this.contents.has(uri.toString());
  }
}

let provider: TranslationContentProvider;

export function activate(context: vscode.ExtensionContext): void {
  provider = new TranslationContentProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider),
    vscode.commands.registerCommand('markdownAiTranslator.translate', () => runTranslation({ selectionOnly: false })),
    vscode.commands.registerCommand('markdownAiTranslator.translateSelection', () => runTranslation({ selectionOnly: true })),
    vscode.commands.registerCommand('markdownAiTranslator.pickLanguage', () => runWithLanguagePicker()),
  );
}

export function deactivate(): void { /* nothing to clean up */ }

function readConfig(): TranslatorConfig {
  const cfg = vscode.workspace.getConfiguration('markdownAiTranslator');
  return {
    provider: cfg.get<Provider>('provider', 'openai-compatible'),
    endpoint: cfg.get<string>('endpoint', 'https://api.openai.com/v1'),
    apiKey: cfg.get<string>('apiKey', ''),
    model: cfg.get<string>('model', 'gpt-4o-mini'),
    targetLanguage: cfg.get<string>('targetLanguage', 'Simplified Chinese'),
    additionalInstructions: cfg.get<string>('additionalInstructions', ''),
    temperature: cfg.get<number>('temperature', 0.2),
    maxTokens: cfg.get<number>('maxTokens', 8192),
    stream: cfg.get<boolean>('stream', true),
    extraHeaders: cfg.get<Record<string, string>>('extraHeaders', {}),
  };
}

interface RunOptions {
  selectionOnly: boolean;
  targetLanguageOverride?: string;
}

async function runWithLanguagePicker(): Promise<void> {
  const presets = [
    'Simplified Chinese',
    'Traditional Chinese',
    'Japanese',
    'Korean',
    'Spanish',
    'French',
    'German',
    'Italian',
    'Brazilian Portuguese',
    'Russian',
    'Arabic',
    'Hindi',
    'English',
  ];
  const pick = await vscode.window.showQuickPick(
    [...presets.map((l) => ({ label: l })), { label: '$(edit) Custom…' }],
    { placeHolder: 'Translate this Markdown document into…' },
  );
  if (!pick) return;
  let target = pick.label;
  if (target.startsWith('$(edit)')) {
    const custom = await vscode.window.showInputBox({
      prompt: 'Target language',
      placeHolder: 'e.g. Vietnamese, Swiss German, Latin American Spanish',
    });
    if (!custom?.trim()) return;
    target = custom.trim();
  }
  await runTranslation({ selectionOnly: false, targetLanguageOverride: target });
}

async function runTranslation(opts: RunOptions): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('Markdown AI Translator: no active editor.');
    return;
  }
  if (editor.document.languageId !== 'markdown') {
    vscode.window.showErrorMessage('Markdown AI Translator only works on Markdown (.md) files.');
    return;
  }

  const source = opts.selectionOnly && !editor.selection.isEmpty
    ? editor.document.getText(editor.selection)
    : editor.document.getText();
  if (!source.trim()) {
    vscode.window.showInformationMessage('Markdown AI Translator: nothing to translate.');
    return;
  }

  const config = readConfig();
  const targetLanguage = (opts.targetLanguageOverride ?? config.targetLanguage).trim() || 'Simplified Chinese';

  if (!config.apiKey) {
    const choice = await vscode.window.showWarningMessage(
      `No API key set for Markdown AI Translator. Continue anyway? (Local endpoints like Ollama may not need one.)`,
      'Continue',
      'Open Settings',
      'Cancel',
    );
    if (choice === 'Open Settings') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'markdownAiTranslator');
      return;
    }
    if (choice !== 'Continue') return;
  }

  const previewUri = buildPreviewUri(editor.document.uri, targetLanguage);
  provider.set(previewUri, '');

  const previewMode = vscode.workspace
    .getConfiguration('markdownAiTranslator')
    .get<'rendered' | 'source' | 'both'>('previewMode', 'rendered');

  await openPreview(previewUri, previewMode);

  const ac = new AbortController();
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Translating to ${targetLanguage}…`,
      cancellable: true,
    },
    async (_progress, token) => {
      const sub = token.onCancellationRequested(() => ac.abort());
      try {
        await translate(config, source, (chunk) => provider.append(previewUri, chunk), ac.signal, targetLanguage);
      } catch (err: any) {
        if (ac.signal.aborted) {
          vscode.window.showInformationMessage('Translation cancelled.');
        } else {
          vscode.window.showErrorMessage(`Translation failed: ${err?.message ?? String(err)}`);
        }
      } finally {
        sub.dispose();
      }
    },
  );
}

function buildPreviewUri(sourceUri: vscode.Uri, targetLanguage: string): vscode.Uri {
  const baseName = sourceUri.path.split('/').pop() || 'document.md';
  const stem = baseName.replace(/\.md$/i, '');
  const langSlug = encodeURIComponent(targetLanguage).replace(/%20/g, '-');
  // ?ts ensures each translation is a fresh document so previews don't collide.
  return vscode.Uri.parse(`${SCHEME}:/${langSlug}/${stem}.${langSlug}.md?ts=${Date.now()}`);
}

async function openPreview(uri: vscode.Uri, mode: 'rendered' | 'source' | 'both'): Promise<void> {
  // Always load the document so the markdown preview can resolve its URI.
  const doc = await vscode.workspace.openTextDocument(uri);

  if (mode === 'source' || mode === 'both') {
    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: true,
      preserveFocus: true,
    });
  }

  if (mode === 'rendered' || mode === 'both') {
    try {
      await vscode.commands.executeCommand('markdown.showPreviewToSide', uri);
    } catch {
      // Fallback: show source if the markdown preview command isn't available for this URI.
      await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
        preview: true,
        preserveFocus: true,
      });
    }
  }
}
