CodeMirror.defineSimpleMode("pgMode", {
  // The start state contains the rules that are intially used
  start: [
    {regex: /->|--/, token: "keyword"},
    {regex: /(\s)([^\s:"]+)(:)("(?:[^\\]|\\.)*?"|[^\s:]+)?/, token: [null, "variable-2", "atom", "property"]},
    {regex: /\s:[^\s:]+/, token: "def"},
    {regex: /"(?:[^\\]|\\.)*?"|[^\s:]+/, token: "string"},
    {regex: /#.*/, token: "comment", sol: true },
  ],
  // The meta property contains global information about the mode. It
  // can contain properties like lineComment, which are supported by
  // all modes, and also directives like dontIndentStates, which are
  // specific to simple modes.
  meta: {
    dontIndentStates: ["comment"],
  }
});
