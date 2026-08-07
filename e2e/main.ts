import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { diagnosticCount } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createLambdaMOO } from "codemirror-lambdamoo";

const firstUri = "file:///integration/invalid.moo";
const secondUri = "file:///integration/valid.moo";
const support = await createLambdaMOO({ timeout: 5000 });
const parent = document.querySelector<HTMLElement>("#editors");
if (!parent) throw new Error("Editor fixture is missing");
const editorParent = parent;

const first = createEditor("if (ready)\nnotify(player);", firstUri);
const second = createEditor("if (ready)\nnotify(player);\nendif", secondUri);

support.client.sync();
const semanticTokens = await support.client.request<
  { textDocument: { uri: string } },
  { data: readonly number[] } | null
>("textDocument/semanticTokens/full", { textDocument: { uri: secondUri } });
const formatting = await support.client.request<
  {
    textDocument: { uri: string };
    options: { tabSize: number; insertSpaces: boolean };
  },
  Array<{ newText: string }> | null
>("textDocument/formatting", {
  textDocument: { uri: secondUri },
  options: { tabSize: 2, insertSpaces: true },
});

window.lambdaMOOTest = {
  first,
  second,
  diagnosticCount: diagnosticCount(first.state),
  semanticTokenCount: semanticTokens?.data.length ?? 0,
  formattingEditCount: formatting?.length ?? 0,
  async destroy() {
    first.destroy();
    second.destroy();
    await support.destroy();
    document.body.dataset.destroyed = "true";
  },
};
document.body.dataset.ready = "true";

function createEditor(document: string, uri: string): EditorView {
  return new EditorView({
    parent: editorParent,
    state: EditorState.create({
      doc: document,
      extensions: [support.extension(uri), syntaxHighlighting(defaultHighlightStyle)],
    }),
  });
}

declare global {
  interface Window {
    lambdaMOOTest: {
      first: EditorView;
      second: EditorView;
      semanticTokenCount: number;
      formattingEditCount: number;
      diagnosticCount: number;
      destroy(): Promise<void>;
    };
  }
}
