pgParser = require('./pg_parser.js');

let coreParse = pgParser.parse;
function removeComment(text) {
  return text.replace(/^((("[^"\\]*(\\.[^"\\]*)*")|[^#"])*)(#.*)$/gm, '$1');
}
pgParser.parse = (text) => coreParse(removeComment(text));
