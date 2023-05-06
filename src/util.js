class DuplicateNodeError extends Error {
  constructor(nodes) {
    super(`Duplicate node: ${nodes.map(n => n.id).join(', ')}`);
    this.name = "NodeDuplicationError";
    this.nodes = nodes;
  }
}

function deepMerge(target, source) {
  const isObject = obj => obj && typeof obj === 'object' && !Array.isArray(obj);
  let result = Object.assign({}, target);
  if(isObject(target) && isObject(source)) {
    for(const [sourceKey, sourceValue] of Object.entries(source)) {
      const targetValue = target[sourceKey];
      if(isObject(sourceValue) && target.hasOwnProperty(sourceKey)) {
        result[sourceKey] = deepMerge(targetValue, sourceValue);
      } else {
        Object.assign(result, {[sourceKey]: sourceValue});
      }
    }
  }
  return result;
}


// Create random colors, with str as seed, and with fixed saturation and lightness
function getRandomColor(str, saturation, brightness) {
  let hash = 0;
  for(let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  let hue = hash % 360;
  return 'hsl(' + hue + `, ${saturation}, ${brightness})`;
}

let renderedColors = {};

function getHexColors(colorStr) {
  let computed = renderedColors[colorStr];
  if(computed) {
    return computed;
  }
  let a = document.createElement('div');
  a.style.color = colorStr;
  let colors = window.getComputedStyle(document.body.appendChild(a)).color.match(/\d+/g).map(function(a) {
    return parseInt(a, 10);
  });
  colors.push(255);
  document.body.removeChild(a);
  renderedColors[colorStr] = colors;
  return colors;
}


function convertToHyperLinkIfURL(text) {
  if(!text)
    return text;
  if(Array.isArray(text))
    text = text[0];
  if(typeof text !== 'string')
    return "";
  if(text.startsWith('http://') || text.startsWith('https://')) {
    return `<a target="_blank" href="${text}">${wrapText(text)}</a>`;
  }
  return wrapText(text);
}


function wrapText(str, asHtml) {
  if(!str)
    return str;
  if(Array.isArray(str))
    str = str[0];
  const maxWidth = 40;
  let newLineStr = asHtml ? "<br>" : "\n", res = '';
  while(str.length > maxWidth) {
    res += str.slice(0, maxWidth) + newLineStr;
    str = str.slice(maxWidth);
  }
  return res + str;
}


function createLabelText(elem, props = null) {
  if(props != null) {
    // Use whitespace instead of empty string if no props are specified because Vis.js cannot update label with empty string)
    return props.length ? props.map((prop) => prop === 'id' ? elem.id : (prop === 'label' ? elem.labels : wrapText(elem.properties[prop]))).filter((val) => val).join('\n') : ' ';
  }
}

function createTitle(elem) {
  let flattend_props = Object.entries(elem.properties).reduce((acc, prop) =>
    acc.concat(`<tr valign="top"><td>${prop[0]}</td><td> ${convertToHyperLinkIfURL(prop[1])}</td></tr>`), []);
  if(!elem.from) // for nodes
  {
    let idText = `<tr><td><b>${elem.id}</b></td></tr><tr><td> <b>${wrapText(elem.labels.join(' '), true)}</b></td></tr>`;
    flattend_props.splice(0, 0, idText);
  } else {
    let idText = `<tr><td><b>${elem.from} - ${elem.to}</b></td><td><b>${wrapText(elem.labels.map((l) => ':' + l).join(' '), true)} </b></td></tr>`;
    flattend_props.splice(0, 0, idText);
  }
  if(flattend_props.length === 0) {
    return null;
  }
  return `<table style='fixed'>${flattend_props.join('')}</table>`;
}


function retrieveHttpUrl(node) {
  let candidates = [];
  for(let entry of Object.entries(node.properties)) {
    for(let prop of entry[1]) {
      if(typeof (prop) === 'string' && (prop.startsWith("https://") || prop.startsWith("http://"))) {
        if(entry[0].toLowerCase() == 'url')
          return prop;
        candidates.push([entry[0], prop]);
      }
    }
  }
  return candidates[0];
}

function validateGraph() {
  this.warnings = [];
  // If duplication of nodes exist, raise error
  function nonuniqueNodes(nodes) {
    let nonunique = new Set();
    let nodeMap = {} // id -> node
    for(let node of nodes) {
      if(nodeMap[node.id]) {
        nonunique.add(nodeMap[node.id]);
        nonunique.add(node);
      }
      nodeMap[node.id] = node;
    }
    return [...nonunique];
  }

  let nonunique = nonuniqueNodes(this.graph.nodes);
  if(nonunique.length > 0) {
    throw new DuplicateNodeError(nonunique);
  }

  if(this.graph.nodes.length >= this.config.node.limit) {
    throw new Error(`The number of nodes exceeds the current limit: ${this.config.node.limit}. ` +
      `You can change it via node.limit in your config.`);
  }

  if(this.graph.edges.length >= this.config.edge.limit) {
    throw new Error(`The number of edges exceeds the current limit: ${this.config.edge.limit}. ` +
      `You can change it via edge.limit in your config.`);
  }

  // If edge refers to undefined nodes, create warnings
  for(let edge of this.graph.edges) {
    if(!this.nodeMap[edge.from]) {
      this.warnings.push({
        type: 'UndefinedNode',
        edge: edge,
        node: edge.from,
        location: edge.location,
        message: `Source node is undefined: ${edge.from}`
      });
    }
    if(!this.nodeMap[edge.to]) {
      this.warnings.push({
        type: 'UndefinedNode',
        edge: edge,
        node: edge.to,
        location: edge.location,
        message: `Target node is undefined: ${edge.to}`
      });
    }
  }
}


module.exports = {
  deepMerge,
  getRandomColor,
  getHexColors,
  createTitle,
  createLabelText,
  retrieveHttpUrl,
  DuplicateNodeError,
  validateGraph
}