(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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
    let edgeContents = [edge.from.quoteIfNeeded().padEnd(maxFromLength), edge.undirected ? '--' : '->', edge.to.quoteIfNeeded().padEnd(maxToLength)];
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

},{}],2:[function(require,module,exports){
json2pg = require('./json2pg.js');

},{"./json2pg.js":1}]},{},[2]);
