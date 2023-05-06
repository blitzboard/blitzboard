String.prototype.quoteIfNeeded = function() {
  if(this.includes('"') || this.includes('\t') || this.includes(' ') || this.includes(':')) {
    return `"${this}"`;
  }
  return this;
}



function labelLength(element) {
  // Add three for ':' and trailing two spaces
  return element.labels.map(l => l.quoteIfNeeded().length + 3).reduce((sum, l) => sum + l, 0);
}

function propLength(element, prop) {
  let propNameLength = prop.quoteIfNeeded().length;
  let value = element.properties[prop];
  // Add three for ':' and trailing two spaces
  return element.properties[prop].map(v => propNameLength + value.toString().quoteIfNeeded() + 3).reduce((sum, l) => sum + l, 0);
}

function createNodeContents(pgObject, alignColumns) {
  let flatPg = '';
  let maxIdLength = 0;
  let maxLabelLength = 0;
  let maxPropLength = {};

  if(alignColumns) {
    for(let node of pgObject.nodes) {
      maxIdLength = Math.max(maxIdLength, node.id.quoteIfNeeded().length);
      // Add three for ':' and trailing two spaces
      maxLabelLength = Math.max(maxLabelLength, labelLength(node));
      for(let property in node.properties) {
        maxPropLength[property] = Math.max(maxPropLength[property], propLength(node, property));
      }
    }
  }


  for(let node of pgObject.nodes) {
    let idPart = node.id.quoteIfNeeded();
    let nodeContents = [node.id.quoteIfNeeded().padEnd(maxIdLength * 2 - idPart.length)];
    let labelPart = '';
    for(let label of node.labels) {
      labelPart += ':' + label.quoteIfNeeded();
    }
    labelPart = labelPart.padEnd(maxLabelLength);


    if(alignColumns) {
      let propPart = '';
      for(let property in maxPropLength) {
        if(node.properties[property]) {
          for(let value of node.properties[property]) {
            propPart += (property.quoteIfNeeded() + ':' + value.toString().quoteIfNeeded()).padEnd(maxPropLength[property]) + '  ';
          }
        }
      }
      nodeContents.push(propPart);
    } else {
      for(let property in node.properties) {
        for(let value of node.properties[property]) {
          nodeContents.push(property.quoteIfNeeded() + ':' + value.toString().quoteIfNeeded());
        }
      }
    }
    flatPg += nodeContents.join("  ") + "\n";
  }
  return flatPg;
}

function createEdgeContents(pgObject, alignColumns) {
  let flatPg = '';
  let maxFromLength = 0;
  let maxToLength = 0;
  let maxLabelLength = 0;
  let maxPropLength = {};
  if(alignColumns) {
    for(let edge of pgObject.edges) {
      maxFromLength = Math.max(maxFromLength, edge.from.quoteIfNeeded().length);
      maxToLength = Math.max(maxToLength, edge.to.quoteIfNeeded().length);
      maxLabelLength = Math.max(maxLabelLength, labelLength(edge));
      for(let property in edge.properties) {
        maxPropLength[property] = Math.max(maxPropLength[property], propLength(edge, property));
      }
    }
  }

  for(let edge of pgObject.edges) {
    let edgeContents = [edge.from.quoteIfNeeded().padEnd(maxFromLength), edge.undirected ? '--' : '->', edge.to.quoteIfNeeded().padEnd(maxToLength)];
    let labelPart = '';
    for(let label of edge.labels) {
      labelPart += ':' + label.quoteIfNeeded();
    }
    labelPart = labelPart.padEnd(maxLabelLength);
    edgeContents.push(labelPart);
    if(alignColumns) {
      let propPart = '';
      for(let property in maxPropLength) {
        if(edge.properties[property]) {
          for(let value of edge.properties[property]) {
            propPart += (property.quoteIfNeeded() + ':' + value.toString().quoteIfNeeded()).padEnd(maxPropLength[property]) + '  ';
          }
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


exports.translate = (json, alignColumns = false) => {
  let pgObject;
  if(typeof json == "string")
    pgObject = JSON.parse(json);
  else
    pgObject = json;
  return createNodeContents(pgObject, alignColumns) + createEdgeContents(pgObject, alignColumns);
}

