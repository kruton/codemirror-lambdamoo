import type { LSPClient, LSPClientExtension } from "@codemirror/lsp-client";
import type { Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

type Position = { line: number; character: number };
type DocumentHighlight = {
  range: { start: Position; end: Position };
  kind?: 1 | 2 | 3;
};

export const documentHighlightCapabilities: LSPClientExtension = {
  clientCapabilities: {
    textDocument: { documentHighlight: { dynamicRegistration: false } },
  },
};

export function documentHighlights(
  client: LSPClient,
  uri: string,
  onError: (error: Error) => void,
  debounce = 120,
): Extension {
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet = Decoration.none;
        private timer: ReturnType<typeof setTimeout> | undefined;
        private generation = 0;

        constructor(private readonly view: EditorView) {
          void client.initializing.then(() => this.schedule(0), onError);
        }

        update(update: ViewUpdate): void {
          if (update.docChanged || update.selectionSet) {
            this.clear();
            this.schedule(debounce);
          }
        }

        destroy(): void {
          if (this.timer !== undefined) clearTimeout(this.timer);
          this.generation++;
        }

        private clear(): void {
          this.generation++;
          this.decorations = Decoration.none;
        }

        private schedule(delay: number): void {
          if (this.timer !== undefined) clearTimeout(this.timer);
          this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.request();
          }, delay);
        }

        private async request(): Promise<void> {
          const selection = this.view.state.selection.main;
          if (
            !selection.empty ||
            (client.serverCapabilities && !client.serverCapabilities.documentHighlightProvider)
          )
            return;
          const generation = ++this.generation;
          const document = this.view.state.doc;
          const position = document.lineAt(selection.head);
          const params = {
            textDocument: { uri },
            position: { line: position.number - 1, character: selection.head - position.from },
          };
          client.sync();
          try {
            const result = await client.request<typeof params, readonly DocumentHighlight[] | null>(
              "textDocument/documentHighlight",
              params,
            );
            if (generation !== this.generation || !this.view.state.doc.eq(document)) return;
            this.decorations = highlightDecorations(this.view, result ?? []);
            this.view.dispatch({});
          } catch (error) {
            if (generation === this.generation) onError(normalizeError(error));
          }
        }
      },
      { decorations: (value) => value.decorations },
    ),
    documentHighlightTheme,
  ];
}

function highlightDecorations(
  view: EditorView,
  highlights: readonly DocumentHighlight[],
): DecorationSet {
  const ranges: ReturnType<Decoration["range"]>[] = [];
  for (const highlight of highlights) {
    const from = offset(view, highlight.range.start);
    const to = offset(view, highlight.range.end);
    if (from !== null && to !== null && to > from) {
      const kind = highlight.kind === 2 ? "read" : highlight.kind === 3 ? "write" : "text";
      ranges.push(
        Decoration.mark({
          class: `cm-lsp-documentHighlight cm-lsp-documentHighlight-${kind}`,
        }).range(from, to),
      );
    }
  }
  return Decoration.set(ranges, true);
}

function offset(view: EditorView, position: Position): number | null {
  if (position.line < 0 || position.line >= view.state.doc.lines) return null;
  const line = view.state.doc.line(position.line + 1);
  return line.from + Math.min(position.character, line.length);
}

const documentHighlightTheme = EditorView.baseTheme({
  ".cm-lsp-documentHighlight": { backgroundColor: "#b4d5fe80" },
  ".cm-lsp-documentHighlight-write": {
    backgroundColor: "#b4d5fead",
    outline: "1px solid #7aaff0",
  },
  "&dark .cm-lsp-documentHighlight": { backgroundColor: "#42658a80" },
  "&dark .cm-lsp-documentHighlight-write": {
    backgroundColor: "#42658aad",
    outlineColor: "#6b9ed8",
  },
});

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
