CodeMirror.defineSimpleMode("pgMode", {
  // The start state contains the rules that are intially used
  start: [
    {regex: /->|--/, token: "keyword"},
    {regex: /\s:[^\s:]+/, token: "def"},
    {regex: /#.*/, token: "comment" },
    {regex: /"(?:[^\\]|\\.)*?"|[^\s:]+/, token: "string"},
    {regex: /(\s)([^\s:"]+)(:)("(?:[^\\]|\\.)*?"|[^\s:]+)?/, token: [null, "variable-2", "atom", "property"]},
  ],
  // The meta property contains global information about the mode. It
  // can contain properties like lineComment, which are supported by
  // all modes, and also directives like dontIndentStates, which are
  // specific to simple modes.
  meta: {
    lineComment: "#"
  },
});
