(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
String.prototype.quoteIfNeeded = function() {
  if(this.includes('"') || this.includes('\t') || this.includes(' ') || this.includes(':')) {
    return `"${this}"`;
  }
  return this;
}


exports.translate = (json) => {
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


  for(let edge of pgObject.edges) {
    let edgeContents = [edge.from.quoteIfNeeded(), edge.undirected ? '--' : '->', edge.to.quoteIfNeeded()];
    for(let label of edge.labels) {
      edgeContents.push(':' + label.quoteIfNeeded());
    }
    for(let property in edge.properties) {
      for(let value of edge.properties[property]) {
        edgeContents.push(property.quoteIfNeeded() + ':' + value.toString().quoteIfNeeded());
      }
    }
    flatPg += edgeContents.join("  ") + "\n";
  }
  return flatPg;
}

},{}],2:[function(require,module,exports){
json2pg = require('./json2pg.js');

},{"./json2pg.js":1}]},{},[2]);
