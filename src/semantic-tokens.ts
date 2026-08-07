import { highlightingFor } from "@codemirror/language";
import type { LSPClient, LSPClientExtension } from "@codemirror/lsp-client";
import { type Extension, StateEffect } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { type Tag, tags } from "@lezer/highlight";

type SemanticTokens = { data: readonly number[] } | null;
type SemanticTokenProvider = {
  legend?: {
    tokenTypes?: readonly string[];
  };
};

const refreshSemanticTokens = StateEffect.define<void>();

const tokenTags: Readonly<Record<string, Tag>> = {
  variable: tags.variableName,
  property: tags.propertyName,
  function: tags.function(tags.variableName),
  method: tags.function(tags.propertyName),
  keyword: tags.keyword,
  comment: tags.comment,
  string: tags.string,
  number: tags.number,
  operator: tags.operatorKeyword,
  enumMember: tags.constant(tags.variableName),
};

export const semanticTokenCapabilities: LSPClientExtension = {
  clientCapabilities: {
    textDocument: {
      semanticTokens: {
        dynamicRegistration: false,
        requests: { full: true },
        tokenTypes: Object.keys(tokenTags),
        tokenModifiers: [],
        formats: ["relative"],
        overlappingTokenSupport: false,
        multilineTokenSupport: false,
      },
    },
  },
};

export function semanticTokens(
  client: LSPClient,
  uri: string,
  onError: (error: Error) => void,
  debounce = 120,
): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      private timer: ReturnType<typeof setTimeout> | undefined;
      private generation = 0;

      constructor(private readonly view: EditorView) {
        void client.initializing.then(() => this.schedule(0), onError);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged) {
          this.decorations = this.decorations.map(update.changes);
          this.schedule(debounce);
        } else if (update.transactions.some((transaction) => transaction.reconfigured)) {
          this.schedule(0);
        }
      }

      destroy(): void {
        if (this.timer !== undefined) clearTimeout(this.timer);
        this.generation++;
      }

      private schedule(delay: number): void {
        if (this.timer !== undefined) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.timer = undefined;
          void this.request();
        }, delay);
      }

      private async request(): Promise<void> {
        const generation = ++this.generation;
        const document = this.view.state.doc;
        client.sync();
        try {
          const result = await client.request<{ textDocument: { uri: string } }, SemanticTokens>(
            "textDocument/semanticTokens/full",
            { textDocument: { uri } },
          );
          if (generation !== this.generation || !this.view.state.doc.eq(document)) return;
          this.decorations = decodeSemanticTokens(
            this.view,
            result?.data ?? [],
            tokenLegend(client),
          );
          this.view.dispatch({ effects: refreshSemanticTokens.of(undefined) });
        } catch (error) {
          if (generation === this.generation) onError(normalizeError(error));
        }
      }
    },
    { decorations: (value) => value.decorations },
  );
}

function tokenLegend(client: LSPClient): readonly string[] {
  const provider = client.serverCapabilities?.semanticTokensProvider;
  if (!provider || typeof provider !== "object") return [];
  return (provider as SemanticTokenProvider).legend?.tokenTypes ?? [];
}

export function decodeSemanticTokens(
  view: EditorView,
  data: readonly number[],
  legend: readonly string[],
): DecorationSet {
  const ranges: ReturnType<Decoration["range"]>[] = [];
  let lineNumber = 0;
  let character = 0;

  for (let index = 0; index + 4 < data.length; index += 5) {
    const deltaLine = data[index] ?? 0;
    const deltaStart = data[index + 1] ?? 0;
    const length = data[index + 2] ?? 0;
    const tokenType = data[index + 3] ?? -1;
    lineNumber += deltaLine;
    character = deltaLine === 0 ? character + deltaStart : deltaStart;

    if (lineNumber >= view.state.doc.lines || length <= 0) continue;
    const line = view.state.doc.line(lineNumber + 1);
    const from = line.from + character;
    const to = Math.min(line.to, from + length);
    const name = legend[tokenType];
    const tag = name ? tokenTags[name] : undefined;
    const className = tag
      ? (highlightingFor(view.state, [tag]) ?? highlightingFor(view.state, [tags.variableName]))
      : null;
    if (from <= line.to && to > from && className) {
      ranges.push(Decoration.mark({ class: className }).range(from, to));
    }
  }

  return Decoration.set(ranges, true);
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
