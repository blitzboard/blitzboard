const util = require('util');

exports.default = (json) => {
  const pgObject = JSON.parse(json);
  for(let node of pgObject.nodes) {
    let nodeContents = [node.id.quoteIfNeeded()];
    for(let label of node.labels) {
      nodeContents.push(':' + label.quoteIfNeeded());
    }
    for(let property in node.properties) {
      for(let value of node.properties[property]) {
        nodeContents.push(property.quoteIfNeeded() + ':' + value.quoteIfNeeded());
      }
    }
    console.log(nodeContents.join("  "));
  }


  for(let edge of pgObject.edges) {
    let edgeContents = [edge.from.quoteIfNeeded(), edge.undirected ? '--' : '->', edge.to.quoteIfNeeded()];
    for(let label of edge.labels) {
      edgeContents.push(':' + label.quoteIfNeeded());
    }
    for(let property in edge.properties) {
      for(let value of edge.properties[property]) {
        edgeContents.push(property.quoteIfNeeded() + ':' + value.quoteIfNeeded());
      }
    }
    console.log(edgeContents.join("  "));
  }
}
