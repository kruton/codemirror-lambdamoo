import { startCompletion } from "@codemirror/autocomplete";
import { diagnosticCount, lintGutter, openLintPanel } from "@codemirror/lint";
import {
  findReferences,
  formatDocument,
  jumpToDefinition,
  renameSymbol,
} from "@codemirror/lsp-client";
import { openSearchPanel } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { type Command, EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { createLambdaMOO } from "codemirror-lambdamoo";
import "./style.css";

const firstUri = "file:///integration/invalid.moo";
const secondUri = "file:///integration/valid.moo";
const support = await createLambdaMOO({ timeout: 5000 });
const firstParent = document.querySelector<HTMLElement>("#invalid-editor");
const secondParent = document.querySelector<HTMLElement>("#valid-editor");
if (!firstParent || !secondParent) throw new Error("Editor fixture is missing");

const first = createEditor('if (ready)\nnotify(player, "hi");', firstUri, firstParent);
const second = createEditor(
  'ready = 1;\nif (ready)\nnotify(player, "hello");\nendif',
  secondUri,
  secondParent,
);
let activeEditor = first;
const editorTabs = [
  {
    tab: document.querySelector<HTMLButtonElement>("#invalid-tab"),
    panel: firstParent,
    view: first,
  },
  {
    tab: document.querySelector<HTMLButtonElement>("#valid-tab"),
    panel: secondParent,
    view: second,
  },
];
if (editorTabs.some(({ tab }) => !tab)) throw new Error("Editor tabs are missing");

for (const { tab, view } of editorTabs) {
  view.dom.addEventListener("focusin", () => {
    activeEditor = view;
  });
  tab?.addEventListener("click", () => {
    for (const entry of editorTabs) {
      const selected = entry.view === view;
      entry.tab?.setAttribute("aria-selected", String(selected));
      entry.tab?.setAttribute("tabindex", selected ? "0" : "-1");
      entry.panel.hidden = !selected;
    }
    activeEditor = view;
    view.requestMeasure();
    view.focus();
  });
}

const commands: Readonly<Record<string, Command>> = {
  format: formatDocument,
  definition: jumpToDefinition,
  references: findReferences,
  rename: renameSymbol,
  completion: startCompletion,
  problems: openLintPanel,
  search: openSearchPanel,
};
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-command]")) {
  button.addEventListener("click", () => {
    const command = commands[button.dataset.command ?? ""];
    if (command) command(activeEditor);
    activeEditor.focus();
  });
}

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

function createEditor(document: string, uri: string, parent: HTMLElement): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: document,
      extensions: [basicSetup, lintGutter(), support.extension(uri)],
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
