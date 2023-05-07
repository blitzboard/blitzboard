const fs = require("fs");
const axios = require("axios");
const { program } = require('commander');

program.argument('pgJSON');
program.argument('url');
program.argument('name');
program.parse();

let pgJSON = program.args[0];
let url = program.args[1];
let name = program.args[2];

console.error(`Starting to post ${pgJSON} to ${url}`);

// console.log({pgJSON});

pgJSON = JSON.parse(fs.readFileSync(pgJSON, 'utf8'));

let savedData = {
  name,
  properties: {},
  pg: pgJSON
};


axios.post(url, savedData).then((res) => {
  console.error(`${name} has been saved!`);
}).catch((error) => {
  console.error(`Failed to save ${name} ..`)
  console.error({error});
});


