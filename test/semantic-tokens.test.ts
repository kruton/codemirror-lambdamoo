import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { decodeSemanticTokens } from "../src/semantic-tokens.js";

describe("semantic token decoding", () => {
  it("uses LSP UTF-16 positions, including astral characters", () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: '"😀"; notify(player);',
        extensions: [
          syntaxHighlighting(defaultHighlightStyle),
          syntaxHighlighting(
            HighlightStyle.define([{ tag: tags.function(tags.variableName), color: "red" }]),
          ),
        ],
      }),
    });

    const decorations = decodeSemanticTokens(
      view,
      [0, 0, 4, 0, 0, 0, 6, 6, 1, 0],
      ["string", "function"],
    );
    const ranges: Array<[number, number]> = [];
    decorations.between(0, view.state.doc.length, (from, to) => {
      ranges.push([from, to]);
    });

    expect(ranges).toEqual([
      [0, 4],
      [6, 12],
    ]);
    view.destroy();
  });

  it("ignores malformed and unknown token entries", () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: "value",
        extensions: [syntaxHighlighting(defaultHighlightStyle)],
      }),
    });
    const decorations = decodeSemanticTokens(view, [9, 0, 2, 99, 0], []);
    expect(decorations.size).toBe(0);
    view.destroy();
  });
});
