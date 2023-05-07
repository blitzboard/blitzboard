#!/usr/bin/env node

let fs = require('fs');


try {
  const data = fs.readFileSync('/tmp/comments.pg', 'utf8');
  pgParser = require('./pg_parser.js');
  function removeComment(text) {
    let result = '';
    let from = 0;
    let to = 0;
    let inComment = false;
    let startLiteralCharacter = null;
    for(; to < text.length; ++to) {
      let current = text[to];
      if(inComment) {
        from = to;
        if(current === "\n")
          inComment = false;
      } else if(startLiteralCharacter === current) {
        startLiteralCharacter = null;
      } else {
        if (current === '"' || current === "'")
          startLiteralCharacter = current;
        if (!startLiteralCharacter && current === '#') {
          result += text.substring(from, to);
          inComment = true;
        }
        if (startLiteralCharacter && current === '\\')
          ++to;
      }
    }
    result += text.substring(from, to);
    return result;
  }
  console.log(removeComment(data));
} catch (err) {
  console.error(err);
}

