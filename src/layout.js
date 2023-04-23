const visData = require("vis-data");
const visNetwork = require("vis-network");
const d3Force = require("d3-force");

function computeHierarchicalPositions() {
  this.hierarchicalPositionMap = {};
  let tmpNodeDataSet = new visData.DataSet(this.graph.nodes);
  let tmpEdgeDataSet = new visData.DataSet(this.graph.edges);
  let tmpOptions = {
    layout: {
      hierarchical: this.config.layoutSettings
    }
  }
  let tmpNetwork = new visNetwork.Network(document.createElement('div'), {
    nodes: tmpNodeDataSet,
    edges: tmpEdgeDataSet
  }, tmpOptions);
  for(let node of this.graph.nodes) {
    let position = tmpNetwork.getPosition(node.id);
    this.hierarchicalPositionMap[node.id] = position;
  }
}

function calcNodePosition(pgNode) {
  let x, y, fixed, width;
  if(this.config.layout === 'timeline' && this.timeInterval > 0) {
    x = null;
    fixed = false;
    let fromProp = this.config.layoutSettings.time_from;
    let toProp = this.config.layoutSettings.time_to;
    let from = this.maxTime;
    let to = this.minTime;

    for(let prop of Object.keys(pgNode.properties)) {
      if(prop === fromProp || prop === toProp) {
        from = new Date(Math.min(from, new Date(pgNode.properties[prop][0])));
        to = new Date(Math.max(to, new Date(pgNode.properties[prop][0])));
      }
    }

    if(from <= to) {
      fixed = true;
      let fromPosition = this.timeScale * (from.getTime() - this.minTime.getTime()) * 1.0 / this.timeInterval - this.timeScale * 0.5;
      let toPosition = this.timeScale * (to.getTime() - this.minTime.getTime()) * 1.0 / this.timeInterval - this.timeScale * 0.5;
      x = (fromPosition + toPosition) / 2;
      if(from === to) {
        width = fromPosition - toPosition;
      } else {
        width = 25;
      }
    } else {
      x = 0;
    }
  } else {
    x = null;
    y = null;
    fixed = this.config.layout === 'hierarchical';
    width = null;
  }
  return {x, y, fixed, width};
}




module.exports = {
  computeHierarchicalPositions,
  calcNodePosition,

  hideExceptSCC() {
    this.expandSCC();
    let toBeUpdated = [];
    for(let node of this.nodeDataSet._data.values()) {
      if(node.clusterId >= 0)
        toBeUpdated.push({id: node.id, hidden: true});
    }
    this.nodeDataSet.update(toBeUpdated);
  },

  determineLayout(afterUpdate = null) {
    // this.minTime = new Date(8640000000000000);
    // this.maxTime = new Date(-8640000000000000);
    //
    // if(this.config.layout === 'timeline') {
    //   let fromProp = this.config.layoutSettings.time_from;
    //   let toProp = this.config.layoutSettings.time_to;
    //
    //   this.graph.nodes.forEach(node => {
    //     for(let prop of Object.keys(node.properties)) {
    //       if(prop === fromProp || prop === toProp) {
    //         this.minTime = new Date(Math.min(this.minTime, new Date(node.properties[prop][0])));
    //         this.maxTime = new Date(Math.max(this.maxTime, new Date(node.properties[prop][0])));
    //       }
    //     }
    //   });
    //   this.timeInterval = this.maxTime - this.minTime;
    // }


    if(this.config.layout === 'hierarchical') {
      this.computeHierarchicalPositions();
      this.groupedGraph = this.filteredGraph;
      this.resetView(afterUpdate);
    }
    else if(this.config.layout === 'hierarchical-scc') {
      let sccList = stronglyConnectedComponents(this.filteredGraph.edges);
      this.nodeLayout = {};
      let groupedNodes = this.graph.nodes.filter(n => {
        for(let scc of sccList) {
          if(scc.has(n.id))
            return false;
        }
        return true;
      });

      // convert set to array
      let sccArrayList = sccList.map(scc => Array.from(scc));
      this.sccMap = {};
      let sccReverseMap = {};
      for(let scc of sccArrayList) {
        let sccId = scc.join('\n');
        for(let node of scc) {
          this.sccMap[node] = sccId;
          sccReverseMap[sccId] = scc;
        }
      }
      for(let sccId of new Set(Object.values(this.sccMap))) {
        groupedNodes.push({
          id: sccId,
          labels: [],
          properties: [],
          clusterId: sccId,
          location: {start: {line: 0, column: 0}, end: {line: 0, column: 0}}
        });
      }

      // Clone this.filteredGraph.edges
      let groupedEdges = JSON.parse(JSON.stringify(this.filteredGraph.edges));

      for(let edge of groupedEdges) {
        edge.from = this.sccMap[edge.from] || edge.from;
        edge.to = this.sccMap[edge.to] || edge.to;
      }

      let visNodeDataSet = new visData.DataSet(groupedNodes);
      let visEdgeDataSet = new visData.DataSet(groupedEdges);
      let visOptions = {
        layout: {
          hierarchical: {
            enabled: true,
            levelSeparation: 150,
            nodeSpacing: 100,
            treeSpacing: 200,
            blockShifting: true,
            edgeMinimization: true,
            parentCentralization: true,
            direction: 'LR',
            sortMethod: 'directed',
            shakeTowards: 'leaves'
          }
        }
      };
      let tmpNetwork = new visNetwork.Network(document.createElement('div'), {
        nodes: visNodeDataSet,
        edges: visEdgeDataSet
      }, visOptions);
      for(let node of groupedNodes) {
        let position = tmpNetwork.getPosition(node.id);
        if(sccReverseMap[node.id] !== undefined) {
          // The node is cluster
          this.nodeLayout[node.id] = position;
          let i = 0;
          for(let sccNodeId of sccReverseMap[node.id]) {
            this.nodeLayout[sccNodeId] = {
              x: position.x,
              y: position.y + i * 100,
            };
            i += 1;
          }
        } else {
          this.nodeLayout[node.id] = position;
        }
      }

      // Scale down the positions to fit coordinate systems in Deck.gl
      for(let position of Object.values(this.nodeLayout)) {
        position.x /= 5;
        position.y /= 5;
      }

      if(this.config.sccMode === 'cluster') {
        this.groupedGraph = {
          nodes: groupedNodes,
          edges: groupedEdges
        };
      } else {
        this.groupedGraph = this.filteredGraph;
        if(this.config.sccMode === 'only-scc') {
          this.groupedGraph = {
            nodes: this.groupedGraph.nodes.filter(n => this.sccMap[n.id]),
            edges: this.groupedGraph.edges.filter(e => this.sccMap[e.from] && this.sccMap[e.to])
          };
        }
        for(let node of this.groupedGraph.nodes) {
          if(this.sccMap[node.id] === undefined) {
            delete node.clusterId;
          } else {
            node.clusterId = this.sccMap[node.id];
          }
        }
      }

      this.resetView(afterUpdate);
    } else {
      this.hierarchicalPositionMap = null;
      this.groupedGraph = this.filteredGraph;
      if(this.config.layout === 'map') {
        let lngKey = this.config.layoutSettings.lng;
        let latKey = this.config.layoutSettings.lat;
        this.nodeLayout = {};

        this.graph.nodes.forEach(node => {
          if(node.properties[latKey] && node.properties[lngKey]) {
            let lat = node.properties[latKey][0],
              lng = node.properties[lngKey][0];
            if(typeof (lat) === 'string') {
              lat = parseFloat(lat);
            }
            if(typeof (lng) === 'string') {
              lng = parseFloat(lng);
            }
            this.nodeLayout[node.id] = {x: lng, y: lat, z: 0};
          }
        });
        this.resetView(afterUpdate);
      } else if(this.config.layout === 'custom') {
        // Use position specified by users
        this.nodeLayout = {};
        for(const node of this.graph.nodes) {
          let x, y;
          if(node.properties[this.config.layoutSettings.x] || node.properties[this.config.layoutSettings.y]) {
            x = parseFloat(node.properties[this.config.layoutSettings.x][0]);
            y = parseFloat(node.properties[this.config.layoutSettings.y][0]);
          } else {
            x = y = 0;
          }
          this.nodeLayout[node.id] = {x, y, z: 0};
        }
        this.resetView(afterUpdate);
      } else {
        this.layoutNodesByD3(afterUpdate);
      }
    }
  },

  layoutNodesByD3(afterUpdate) {
    let count = {};
    const d3Nodes = this.graph.nodes.map((n) => {
      return {
        id: n.id
      };
    });
    const d3Edges = this.graph.edges.filter(e => this.nodeMap[e.from] && this.nodeMap[e.to]).map(e => {
      count[e.from] = (count[e.from] || 0) + 1;
      count[e.to] = (count[e.to] || 0) + 1;
      return {
        source: e.from,
        target: e.to,
      };
    });

    const SPRING_DISTANCE = 15;

    this.d3Simulation = d3Force.forceSimulation(d3Nodes)
      .force("charge", d3Force.forceManyBody().strength(n => -30 * Math.sqrt(count[n.id] || 1)))
      .force("link", d3Force.forceLink(d3Edges).id((n) => n.id).distance(link => {
        return SPRING_DISTANCE * Math.min(count[link.source.id], count[link.target.id])
      }))
      .force("centralGravityX", d3Force.forceX().strength(0.5))
      .force("centralGravityY", d3Force.forceY().strength(0.5));

    this.layoutNodes(() => {
      this.nodeLayout = {};
      for(const node of d3Nodes) {
        this.nodeLayout[node.id] = {x: node.x, y: node.y, z: 0};
      }
      this.resetView(afterUpdate);
    }, 1000);
  },

  layoutNodes(callback, maxStep) {
    this.shouldAbortLayout = false;
    this.layoutNodesRecursive(callback, maxStep, 0);
  },

  layoutNodesRecursive(callback, maxStep, current) {
    const LAYOUT_STEP = 10;
    if(this.shouldAbortLayout) {
      return;
    }
    if(current + LAYOUT_STEP >= maxStep) {
      callback();
    } else {
      this.d3Simulation.tick(LAYOUT_STEP);
      setTimeout(() => this.layoutNodesRecursive(callback, maxStep, current + LAYOUT_STEP), 0);
    }
  }
}