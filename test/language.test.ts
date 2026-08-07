import {
  defaultHighlightStyle,
  ensureSyntaxTree,
  getIndentation,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { lambdaMOO } from "../src/language.js";

describe("LambdaMOO language mode", () => {
  it("highlights representative language constructs", () => {
    const document = 'if (thing.owner == #1) notify("hello"); endif';
    const state = EditorState.create({
      doc: document,
      extensions: [lambdaMOO(), syntaxHighlighting(defaultHighlightStyle)],
    });
    const tree = ensureSyntaxTree(state, document.length, 1000);
    expect(tree).not.toBeNull();
    if (!tree) throw new Error("LambdaMOO syntax tree was not available");

    const highlighted: string[] = [];
    highlightTree(tree, classHighlighter, (from, to, classes) => {
      highlighted.push(`${document.slice(from, to)}:${classes}`);
    });

    expect(highlighted.some((span) => span.startsWith("if:tok-keyword"))).toBe(true);
    expect(highlighted.some((span) => span.startsWith("owner:tok-propertyName"))).toBe(true);
    expect(highlighted.some((span) => span.startsWith('"hello":tok-string'))).toBe(true);
  });

  it("highlights standalone string statements as comments", () => {
    const document = '  "This is a \\"comment\\" that works";';
    const state = EditorState.create({ doc: document, extensions: [lambdaMOO()] });
    const tree = ensureSyntaxTree(state, document.length, 1000);
    expect(tree).not.toBeNull();
    if (!tree) throw new Error("LambdaMOO syntax tree was not available");

    const highlighted: string[] = [];
    highlightTree(tree, classHighlighter, (from, to, classes) => {
      highlighted.push(`${document.slice(from, to)}:${classes}`);
    });

    expect(highlighted).toContain('"This is a \\"comment\\" that works":tok-comment');
  });

  it("does not treat C-style block comments as comments", () => {
    const document = "/* not valid MOO */";
    const state = EditorState.create({ doc: document, extensions: [lambdaMOO()] });
    const tree = ensureSyntaxTree(state, document.length, 1000);
    expect(tree).not.toBeNull();
    if (!tree) throw new Error("LambdaMOO syntax tree was not available");

    const highlighted: string[] = [];
    highlightTree(tree, classHighlighter, (from, to, classes) => {
      highlighted.push(`${document.slice(from, to)}:${classes}`);
    });

    expect(highlighted.some((span) => span.endsWith(":tok-comment"))).toBe(false);
  });

  it("indents block bodies and closing keywords", () => {
    const state = EditorState.create({
      doc: "if (ready)\nnotify(player);\nendif",
      extensions: [lambdaMOO(), EditorState.tabSize.of(2)],
    });
    expect(getIndentation(state, state.doc.line(2).from)).toBe(2);
    expect(getIndentation(state, state.doc.line(3).from)).toBe(0);
  });
});
