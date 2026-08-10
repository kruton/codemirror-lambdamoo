import {
  indentService,
  LanguageSupport,
  StreamLanguage,
  type StreamParser,
  type StringStream,
} from "@codemirror/language";
import type { Extension } from "@codemirror/state";

type MooState = {
  string: "string" | "comment" | null;
};

const keywords =
  /^(?:if|elseif|else|endif|for|in|endfor|while|endwhile|fork|endfork|break|continue|return|try|except|finally|endtry)\b/i;
const constants =
  /^(?:ANY|E_(?:NONE|TYPE|DIV|PERM|PROPNF|VERBNF|VARNF|INVIND|RECMOVE|MAXREC|RANGE|ARGS|NACC|INVARG|QUOTA|FLOAT))\b/i;
const operators = /^(?:>>>|>>|<<|==|!=|<=|>=|\|\.|\^\.|&\.|&&|\|\||\.\.|=>|[=<>+\-*/%^!~?:@|&])/;
const identifier = /^[A-Za-z_][A-Za-z0-9_]*/;

const parser: StreamParser<MooState> = {
  name: "lambdamoo",
  startState: () => ({ string: null }),
  copyState: (state) => ({ ...state }),
  token(stream, state) {
    if (state.string) return readString(stream, state);
    if (stream.eatSpace()) return null;

    if (stream.match('"')) {
      state.string = isStandaloneString(stream) ? "comment" : "string";
      return readString(stream, state);
    }
    if (stream.match(keywords)) return "keyword";
    if (stream.match(constants)) return "atom";
    if (stream.match(/^#-?[0-9]+\b/)) return "number";
    if (stream.match(/^[0-9]+(?:\.[0-9]+)?\b/)) return "number";
    if (stream.match(operators)) return "operator";

    const before = stream.string.slice(0, stream.pos).trimEnd().at(-1);
    if (stream.match(identifier)) {
      const rest = stream.string.slice(stream.pos);
      if (/^\s*\(/.test(rest))
        return before === ":" || before === "$" ? "propertyName" : "variableName.function";
      if (before === "." || before === "$") return "propertyName";
      return "variableName";
    }

    stream.next();
    return null;
  },
  languageData: {
    closeBrackets: { brackets: ["(", "[", "{", '"'] },
    indentOnInput: /^\s*(?:elseif|else|endif|endfor|endwhile|endfork|except|finally|endtry)\b/i,
  },
};

function readString(stream: StringStream, state: MooState): string {
  const token = state.string ?? "string";
  let escaped = false;
  while (!stream.eol()) {
    const character = stream.next();
    if (character === '"' && !escaped) {
      state.string = null;
      break;
    }
    escaped = character === "\\" && !escaped;
    if (character !== "\\") escaped = false;
  }
  return token;
}

function isStandaloneString(stream: StringStream): boolean {
  if (stream.string.slice(0, stream.pos - 1).trim() !== "") return false;
  return /^(?:\\.|[^"\\])*"\s*;\s*$/.test(stream.string.slice(stream.pos));
}

export const lambdaMOOLanguage = StreamLanguage.define(parser);

const openingKeyword = /^\s*(?:if|elseif|else|for|while|fork|try|except|finally)\b/i;
const closingKeyword = /^\s*(?:elseif|else|endif|endfor|endwhile|endfork|except|finally|endtry)\b/i;

const mooIndentation: Extension = indentService.of((context, position) => {
  const line = context.lineAt(position, 1);
  let previous = context.lineAt(position, -1);

  if (previous.from === line.from) {
    const actualLine = context.state.doc.lineAt(position);
    if (actualLine.number === 1) return 0;
    previous = context.state.doc.line(actualLine.number - 1);
    while (previous.from > 0 && previous.text.trim() === "") {
      previous = context.state.doc.lineAt(previous.from - 1);
    }
  }

  let indentation = context.lineIndent(previous.from, -1);
  if (openingKeyword.test(previous.text)) indentation += context.unit;
  if (closingKeyword.test(line.text)) indentation = Math.max(0, indentation - context.unit);
  return indentation;
});

export function lambdaMOO(): LanguageSupport {
  return new LanguageSupport(lambdaMOOLanguage, mooIndentation);
}
