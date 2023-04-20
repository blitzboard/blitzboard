const DeckGL = require("@deck.gl/core");

const nodeTemplate = {
  id: null,
  labels: [],
  properties: {}
}

const edgeTemplate = {
  from: null,
  to: null,
  direction: '->',
  labels: [],
  properties: {}
}



module.exports = {
  hasNode: function (node_id) {
    return !!this.nodeMap[node_id];
  },
  hasEdge: function (from, to, label = null) {
    for(let edge of this.graph.edges) {
      if(edge.from === from && edge.to === to && (!label || edge.labels.includes(label)))
        return true;
    }
    return false;
  },
  getAllNodes: function (label = null) {
    if(label)
      return this.graph.nodes.filter(node => node.labels.includes(label)).map(node => this.getNode(node.id));
    else
      return this.graph.nodes.map(node => this.getNode(node.id));
  },
  getNode: function (node_id) {
    return new Proxy(this.nodeMap[node_id], this.blitzProxy);
  },
  getEdge: function (edge_id) {
    return new Proxy(this.edgeMap[edge_id], this.blitzProxy);
  },
  includesNode: function (node) {
    return this.graph.nodes?.filter(e => e.id === node.id).length > 0;
  },
  addNode: function (node, update = true) {
    this.addNodes([node], update);
  },
  addNodes: function (nodes, update = true) {
    let newNodes;
    if(typeof nodes === 'string' || nodes instanceof String) {
      let pg = this.tryPgParse(nodes);
      newNodes = pg.nodes;
    } else {
      newNodes = nodes;
    }
    newNodes = newNodes.filter(node => !this.includesNode(node)).map((node) => {
      let mapped = this.deepMerge(nodeTemplate, node);
      ++this.maxLine;
      mapped.location = {
        start: {
          line: this.maxLine,
          column: 0,
        },
        end: {
          line: this.maxLine + 1,
          column: 0,
        }
      }
      return mapped;
    });
    this.graph.nodes = this.graph.nodes.concat(newNodes);
    for(let callback of this.onNodeAdded) {
      // TODO: The argument should be proxy instead of plain objects
      callback(newNodes);
    }
    if(update)
      this.update();
  },
  addEdge: function (edge, update = true) {
    this.addEdges([edge], update);
  },
  highlightNodePath: function (nodes) {
    let nodeIds = nodes;
    if(nodes.length > 0 && typeof nodes[0] !== 'string') {
      nodeIds = nodes.map((n) => n.id);
    }
    let edgeIds = [];
    for(let i = 0; i < nodeIds.length - 1; ++i) {
      edgeIds.push(`${nodeIds[i]}${Blitzboard.edgeDelimiter}${nodeIds[i + 1]}`);
    }
    this.network.selectEdges(edgeIds);
  },
  addEdges: function (edges, update = true) {
    let newEdges;
    if(typeof edges === 'string' || edges instanceof String) {
      let pg = this.tryPgParse(edges);
      newEdges = pg.edges
    } else {
      newEdges = edges
    }
    newEdges = newEdges.map((edge) => {
      let mapped = this.deepMerge(edgeTemplate, edge);
      ++this.maxLine;
      mapped.location = {
        start: {
          line: this.maxLine,
          column: 0,
        },
        end: {
          line: this.maxLine + 1,
          column: 0,
        }
      }
      return mapped;
    });
    this.graph.edges = this.graph.edges.concat(newEdges);
    for(let callback of this.onEdgeAdded) {
      // TODO: The argument should be proxy instead of plain objects
      callback(newEdges);
    }
    if(update)
      this.update();
  },
  tryPgParse: function (input) {
    for(let callback of this.beforeParse) {
      callback();
    }
    try {
      return pgParser.parse(input);
    } catch(e) {
      for(let callback of this.onParseError) {
        callback(e);
      }
      console.log(e);
      return null;
    }
  },
  fit: function () {
    // Set dummy viewState in advance so that the redrawing is triggered
    this.network.setProps({
      initialViewState: {target: [0, 0], zoom: 3},
    });

    this.network.setProps({
      initialViewState: this.createInitialViewState(),
    });
  },
  clearGraph: function(update = true) {
    this.graph = this.tryPgParse(''); // Set empty pg
    for(let callback of this.onClear) {
      callback();
    }
    if(update)
      this.update();
  },
  setGraph: function (input, update = true, layout = null, callback = null) {
    this.nodeColorMap = {};
    this.edgeColorMap = {};
    this.dragging = false;
    let newPg;
    if(!input) {
      newPg = this.tryPgParse(''); // Set empty pg
    } else if(typeof input === 'string' || input instanceof String) {
      try {
        newPg = JSON.parse(input);
      } catch(err) {
        if(err instanceof SyntaxError) {
          newPg = this.tryPgParse(input);
          newPg = this.tryPgParse(input);
        } else
          throw err;
      }
    } else {
      newPg = input;
    }
    if(newPg === null || newPg === undefined)
      return;
    this.graph = newPg;

    this.nodeLayout = layout;

    if(update)
      this.update(true, callback);
  },
  setConfig: function (config, update = true, callback = null) {
    this.config = this.deepMerge(Blitzboard.defaultConfig, config);

    if(this.config.configChoices?.configs) {
      this.configChoice = this.config.configChoices?.default;
      let configContent = '';
      for(let name of Object.keys(this.config.configChoices.configs)) {
        configContent += `<option ${name === this.configChoice ? 'selected' : ''}>${name}</option>`
      }
      this.configChoiceDropdown.innerHTML = configContent;
      this.configChoiceLabel.innerText = this.config.configChoices.label ? this.config.configChoices.label + ': ' : '';
      this.configChoiceDiv.style.display = 'block';
    } else {
      this.configChoiceDiv.style.display = 'none';
    }

    this.searchBarDiv.style.display = this.config.onSearchInput ? 'block' : 'none';

    if(config.layout === 'hierarchical') {
      // Remove redundant settings when layout is hierarchical
      this.config.layoutSettings = config.layoutSettings;
    }

    this.baseConfig = this.deepMerge({}, this.config); // Save config before apply configChoices
    Blitzboard.loadedIcons = {};
    if(update)
      this.update(false, callback);
  },

  getUpstreamNodes: function(srcNodeId) {
    const edges = this.graph.edges;
    const upstreamNodes = new Set();
    const stack = [srcNodeId];
    while(stack.length > 0) {
      const nodeId = stack.pop();
      upstreamNodes.add(nodeId);
      for(let edge of edges) {
        if(edge.to === nodeId && !upstreamNodes.has(edge.from)) {
          upstreamNodes.add(edge.from);
          stack.push(edge.from);
        }
      }
    }
    return upstreamNodes;
  },

  getDownstreamNodes: function(srcNodeId) {
    const edges = this.graph.edges;
    const downStreamNodes = new Set();
    const stack = [srcNodeId];
    while(stack.length > 0) {
      const nodeId = stack.pop();
      downStreamNodes.add(nodeId);
      for(let edge of edges) {
        if(edge.from === nodeId && !downStreamNodes.has(edge.to)) {
          downStreamNodes.add(edge.to);
          stack.push(edge.to);
        }
      }
    }
    return downStreamNodes;
  },

  selectNode: function (node) {
    this.selectedNodes.clear();
    this.selectedEdges.clear();
    this.selectedNodes.add(node.id);
    this.updateLayers();
  },

  selectEdge: function (edge) {
    this.selectedNodes.clear();
    this.selectedEdges.clear();
    this.selectedEdges.add(edge.id);
    this.updateLayers();
  },

  scrollNodeIntoView: function (node, select = true) {
    if(!this.nodeDataSet)
      return;
    if(typeof (node) === 'string')
      node = this.nodeDataSet[node];
    else
      node = this.nodeDataSet[node.id];
    if(!node)
      return;

    if(select) {
      this.selectNode(node);
    }

    this.scrollNetworkToPosition(node);
    for(let callback of this.onNodeFocused) {
      // TODO: The argument should be proxy instead of plain objects
      callback(node);
    }
  },

  scrollNetworkToPosition: function(position) {
    if(this.config.layout === 'map') {
      this.network.setProps({
        initialViewState: {
          latitude: position.y,
          longitude: position.x,
          zoom: 13,
          transitionDuration: 1000,
          transitionInterpolator: new DeckGL.FlyToInterpolator()
        }
      });
    } else {
      this.network.setProps({
        initialViewState: {
          target: [position.x, position.y],
          zoom: 4,
          transitionDuration: 500,
        }
      });
    }
  },
  scrollEdgeIntoView: function(edge, select = true) {
    if(typeof (edge) === 'string') {
      edge = this.edgeMap[edge];
    }

    const from = this.nodeLayout[edge.from];
    const to = this.nodeLayout[edge.to];
    this.scrollNetworkToPosition({x: (from.x + to.x) / 2, y: (from.y + to.y) / 2});
    if(select) {
      this.selectEdge(edge);
    }

    for(let callback of this.onEdgeFocused) {
      // TODO: The argument should be proxy instead of plain objects
      callback(edge);
    }
  },

  showLoader: function () {
    this.screen.style.display = 'flex';
    this.screenText.style.display = 'block';
  },

  hideLoader: function () {
    this.screen.style.display = 'none';
  },

  blitzProxy: {
    get: function(target, prop, receiver) {
      if(prop === 'label') {
        return target.labels[0];
      }
      if(!(prop in target) && prop in target.properties) {
        return target.properties[prop][0];
      }
      return Reflect.get(target, prop, receiver);
    }
  }
}
