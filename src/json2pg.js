String.prototype.quoteIfNeeded = function() {
  if(this.includes('"') || this.includes('\t') || this.includes(' ') || this.includes(':')) {
    return `"${this.replace('"', '""')}"`;
  }
  return this;
}


exports.translate = (json, alignEdgeColumn = false) => {
  let flatPg = "";
  const pgObject = JSON.parse(json);

  for(let node of pgObject.nodes) {
    let nodeContents = [node.id.quoteIfNeeded()];
    for(let label of node.labels) {
      nodeContents.push(':' + label.quoteIfNeeded());
    }
    for(let property in node.properties) {
      for(let value of node.properties[property]) {
        nodeContents.push(property.quoteIfNeeded() + ':' + value.toString().quoteIfNeeded());
      }
    }
    flatPg += nodeContents.join("  ") + "\n";
  }


  let maxFromLength = 0;
  let maxToLength = 0;
  let maxLabelLength = 0;
  let maxPropLength = {};
  if(alignEdgeColumn) {
    for(let edge of pgObject.edges) {
      maxFromLength = Math.max(maxFromLength, edge.from.quoteIfNeeded().length);
      maxToLength = Math.max(maxToLength, edge.to.quoteIfNeeded().length);

      // Add three for ':' and trailing two spaces
      let labelLength = edge.labels.map(l => label.quoteIfNeeded().length + 3).reduce((sum, l) => sum + l, 0);
      maxLabelLength = Math.max(maxLabelLength, labelLength);
      for(let property in edge.properties) {
        let propNameLength = property.quoteIfNeeded().length;
        let value = edge.properties[property];
        // Add three for ':' and trailing two spaces
        let propLength = edge.properties[property].map(v => propNameLength + value.toString().quoteIfNeeded() + 3).reduce((sum, l) => sum + l, 0);
        maxPropLength[property] = Math.max(maxPropLength[property], propLength);
      }
    }
  }

  for(let edge of pgObject.edges) {
    let from = edge.from.quoteIfNeeded();
    from = from.padEnd(maxFromLength * 2 - from.length);
    let to = edge.to.quoteIfNeeded();
    to = to.padEnd(maxToLength * 2 - to.length);
    let edgeContents = [from, edge.undirected ? '--' : '->', to];
    let labelPart = '';
    for(let label of edge.labels) {
      labelPart += ':' + label.quoteIfNeeded();
    }
    labelPart = labelPart.padEnd(maxLabelLength);
    edgeContents.push(labelPart);
    if(alignEdgeColumn) {
      let propPart = '';
      for(let property in maxPropLength) {
        for(let value of edge.properties[property]) {
          propPart += (property.quoteIfNeeded() + ':' + value.toString().quoteIfNeeded()).padEnd(maxPropLength[property]);
        }
      }
      edgeContents.push(propPart);
    } else {
      for(let property in edge.properties) {
        for(let value of edge.properties[property]) {
          edgeContents.push(property.quoteIfNeeded() + ':' + value.toString().quoteIfNeeded());
        }
      }
    }
    flatPg += edgeContents.join("  ") + "\n";
  }
  return flatPg;
}
