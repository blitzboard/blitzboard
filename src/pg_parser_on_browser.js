pgParser = require('./pg_parser.js');

let coreParse = pgParser.parse;

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
  if(!inComment)
    result += text.substring(from, to);
  return result;
}

pgParser.parse = (text) => coreParse(removeComment(text));
