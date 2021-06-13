pgParser = require('./pg_parser.js');
let coreParse = pgParser.parse;
pgParser.parse = (text) => coreParse(text.replace(/^((("[^"\\]*(\\.[^"\\]*)*")|[^#"])*)(#.*)$/gm, '$1'));
