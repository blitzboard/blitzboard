'use strict';

const q = document.querySelector.bind(document);
const qa = document.querySelectorAll.bind(document);

class Blitzboard {
  static fondLoaded = false;
  static defaultConfig = {
    doubleClickWait: 200,
    node: {
      caption: ['id'],
      defaultIcon: true,
      thumbnail: 'thumbnail',
      saturation: '100%',
      brightness: '37%',
    },
    edge: {
      caption: ['label'],
      length: {
        distance: 'value',
      },
      width: {
        flow: 'throughput',
      },
      saturation: '0%',
      brightness: '62%',
    },
    zoom: { 
      max: 3.0,
      min: 0.25,
    },
    layoutSettings: {
      time_from: 'from',
      time_to: 'to',
      lng: 'lng',
      lat: 'lat'
    },
  };
  static iconPrefixes = ['fa-solid:', 'ion:', 'bx:bx-', 'gridicons:', 'akar-icons:'];
  static iconSizeCoef = 1.5;
  static minScaleOnMap = 0.3;
  static maxScaleOnMap = 1.0;
  static mapContainerId = 'map';
  static nodeTemplate = {
    id: null,
    labels: [],
    properties: {}
  }
  static edgeTemplate = {
    from: null,
    to: null,
    direction: '->',
    labels: [],
    properties: {}
  }

  static loadedIcons = {};
  
  constructor(container) {
    this.container = container;
    this.nodeColorMap = {};
    this.expandedNodes = [];
    this.nodeMap = {};
    this.config = { node: {}, edge: {}};
    this.nodeLineMap = {};
    this.edgeMap = {};
    this.edgeLineMap = {};
    this.prevZoomPosition = null;
    
    this.container.style.position = 'absolute';
    
    this.networkContainer = document.createElement('div');
    this.networkContainer.style = `
      height: 100%;
      width: 100%;
      top: 0;
      left: 0;
      position: absolute;
      z-index: 2;
    `;
    
    this.mapContainer = document.createElement('div');
    this.mapContainer.style = `
      height: 100%;
      width: 100%;
      top: 0;
      left: 0;
      position: absolute;
      z-index: 1;
    `;
    this.map = null;

    this.minTime = new Date(8640000000000000);
    this.maxTime = new Date(-8640000000000000);
    
    this.prevMouseEvent= null;
    this.timeScale = 1000;
    this.dragging = false;
    this.currentLatLng = null;
    this.redrawTimer = null;
    this.onNodeAdded = [];
    this.onEdgeAdded = [];
    this.onNodeFocused = [];
    this.onEdgeFocused = [];
    this.maxLine = 0;
    this.scrollAnimationTimerId = null;
    this.screen = document.createElement('div');
    this.screenText = document.createElement('div');
    this.screenText.style = `
      font-size: 2rem;
      background-color: rgba(255, 255, 255, 0.5);
      padding: 10px;
    `;
    this.screen.appendChild(this.screenText);
    this.screenText.innerText = "Now loading...";
    this.screen.style = `
      background-color: rgba(0, 0, 0, 0.3);
      z-index: 3;
      position: absolute;
      height: 100%;
      width: 100%;
      display: none;
      justify-content: center;
      align-items: center;
      font-size: 2rem;
    `;
    this.doubleClickTimer = null;
    
    let blitzboard = this;

    container.appendChild(this.screen);
    container.appendChild(this.networkContainer);
    container.appendChild(this.mapContainer);

    this.container.addEventListener('wheel', (e) => {
      if(blitzboard.config.layout === 'map')
      {
        if((e.deltaY < 0 && blitzboard.map._zoom < blitzboard.map.getMaxZoom()) ||
          (e.deltaY > 0 && blitzboard.map._zoom > blitzboard.map.getMinZoom()) ) {
          if(!blitzboard.currentLatLng) {
            blitzboard.currentLatLng = blitzboard.map.mouseEventToLatLng(e);
          }
          blitzboard.map.setZoomAround(blitzboard.currentLatLng, blitzboard.map._zoom - e.deltaY * 0.03, {animate: false});
        }
        let newScale = blitzboard.map._zoom / 12 + 0.4;
        newScale = Math.min(Blitzboard.maxScaleOnMap, Math.max(newScale, Blitzboard.minScaleOnMap));
        setTimeout( () => {
          blitzboard.network.moveTo({scale: newScale});
          blitzboard.updateNodeLocationOnMap();
        }, 10);
        blitzboard.map.invalidateSize();
        e.preventDefault();
        e.stopPropagation(); // Inhibit zoom on vis-network
      }
    }, true);

    this.container.addEventListener('mouseout', (e) => {
      blitzboard.prevMouseEvent = null;
      blitzboard.dragging = false;
    }, true);

    this.container.addEventListener('mouseup', (e) => {
      blitzboard.dragging = false;
      blitzboard.prevMouseEvent = null;
    }, true);

    this.container.addEventListener('mousemove', (e) => {
      if(blitzboard.dragging && blitzboard.config.layout === 'map' && blitzboard.prevMouseEvent) {
        blitzboard.map.panBy([blitzboard.prevMouseEvent.x - e.x, blitzboard.prevMouseEvent.y - e.y], {animate: false});
      }
      blitzboard.prevMouseEvent = e;
      blitzboard.currentLatLng = null;
    }, true);

    this.container.addEventListener('dblclick', (e) => {
      if(blitzboard.config.layout === 'map') {
        blitzboard.map.panTo(blitzboard.map.mouseEventToLatLng(e));
      }
    }, true);

    this.container.addEventListener('mousedown', (e) => {
      blitzboard.dragging = true;
      blitzboard.prevMouseEvent = e;
    }, true);
  }

  static blitzProxy = {
    get: function(target, prop, receiver) {
      if (prop === 'label') {
        return target.labels[0];
      }
      if (!(prop in target) && prop in target.properties) {
        return target.properties[prop][0]; 
      }
      return Reflect.get(target, prop, receiver);
    }
  };
  
  hasNode(node_id) {
    return !!this.nodeMap[node_id];
  }
  
  hasEdge(from, to, label = null) {
    for(let edge of this.graph.edges) {
      if(edge.from === from && edge.to === to && (!label || edge.labels.includes(label)))
        return true;
    }
    return false;
  }
  
  getAllNodes(label = null) {
    if(label)
      return this.graph.nodes.filter(node => node.labels.includes(label)).map(node => this.getNode(node.id));
    else
      return this.graph.nodes.map(node => this.getNode(node.id));
  }

  getNode(node_id) {
    return new Proxy(this.nodeMap[node_id], Blitzboard.blitzProxy);
  }
  
  getEdge(edge_id) {
    return new Proxy(this.edgeMap[edge_id], Blitzboard.blitzProxy);
  }
  
  calcNodePosition(pgNode) {
    let x, y, fixed, width;
    if(this.config.layout === 'timeline' && this.timeInterval > 0) {
      x = null;
      fixed = false;
      let fromProp = this.config.layoutSettings.time_from;
      let toProp = this.config.layoutSettings.time_to;
      let from = this.maxTime;
      let to = this.minTime;

      for (let prop of Object.keys(pgNode.properties)) {
        if (prop === fromProp || prop === toProp) {
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
    }
    else {
      if(this.config.layout == 'custom') {
        if (pgNode.properties[this.config.layoutSettings.x] || pgNode.properties[this.config.layoutSettings.y]) {
          x = parseInt(pgNode.properties[this.config.layoutSettings.x][0]);
          y = parseInt(pgNode.properties[this.config.layoutSettings.y][0]);
          fixed = true;
        }
      } else {
        x = null;
        y = null;
        fixed = this.config.layout === 'hierarchical';
        width = null;
      }
    }
    
    return {x, y, fixed, width};
  }

  retrieveThumbnailUrl(node) {
    if(this.config.node.thumbnail) {
      return node.properties[this.config.node.thumbnail]?.[0];
    }
    return null;
  }

  toVisNode(pgNode, props, extraOptions = null) {
    const group = [...pgNode.labels].sort().join('_');
    if(!this.nodeColorMap[group]) {
      this.nodeColorMap[group] = getRandomColor(group, this.config.node.saturation, this.config.node.brightness);
    }
    
    let x, y, fixed, width;
    ({x, y, fixed, width} = this.calcNodePosition(pgNode));

    let url = retrieveHttpUrl(pgNode);
    let thumbnailUrl = this.retrieveThumbnailUrl(pgNode);
    let expanded = this.expandedNodes.includes(pgNode.id);

    let degree =  pgNode.properties['degree'];
    let blitzboard = this;
    if(degree !== undefined) {
      degree = degree[0];
    } else {
      degree = 2; // assume degree to be two (default)
    }

    let attrs = {
      id: pgNode.id,
      color: this.nodeColorMap[group],
      label: createLabelText(pgNode, props),
      shape: (degree === 1 || expanded ? 'text' : 'dot'),
      size: expanded ? 25 : (2 + degree * 8),
      degree: degree,
      title: createTitleText(pgNode),
      fixed: {
        x: fixed,
        y: this.config.layout === 'timeline' ? false : fixed
      },
      borderWidth: url ? 3 : 1,
      url: url,
      x: x,
      y: y,
      font: {
        color: url ? 'blue' : 'black'
      },
      fixedByTime: fixed
    };
    
    function iconRegisterer(name) {
      return (icons) => {
        if (icons.length > 0) {
          let icon = null;
          if(icons.length > 1) {
            // Find icon with the highest priority 
            for (let prefix of Blitzboard.iconPrefixes) {
              for (let i of icons) {
                if (`${i.prefix}:${i.name}`.startsWith(prefix)) {
                  icon = i; 
                  break;
                }
              }
              if (icon) {
                break;
              }
            }
          }
          icon = icon || icons[0];
          let size = attrs.size * Blitzboard.iconSizeCoef;
          let svg = Iconify.renderSVG(`${icon.prefix}:${icon.name}`, {
            width: size,
            height: size
          });
          let img = new Image();
          // svg.viewBox.baseVal.width = size;
          // svg.viewBox.baseVal.height = size;
          svg.querySelectorAll("path").forEach((path) => {
            path.style.fill = "white";
            path.style.stroke = "white";
          });
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.outerHTML);
          Blitzboard.loadedIcons[name] = img;
          if(blitzboard) {
            if (blitzboard.redrawTimer) {
              clearTimeout(blitzboard.redrawTimer);
            }
            blitzboard.redrawTimer = setTimeout(() => {  // Add delay to avoid redraw too ofen
              blitzboard.network.redraw();
            }, 1000);
          }
        }
      };
    }

    for(let label of pgNode.labels) {
      let icon;
      if (icon = this.config.node.icon?.[label]) {
        if(icon.includes(':')) { // For icons in iconify
          Iconify.loadIcons([icon], iconRegisterer(icon));
          attrs['customIcon'] = {
            name: icon
          };
        } else { // For icon codes in Ionicons (to be backward compatible)
          let code = String.fromCharCode(parseInt(icon, 16));
          attrs['customIcon'] = {
            face: 'Ionicons',
            size: attrs.size * 1.5,
            code: code,
            color: 'white'
          };
          break;
        }
      }
    }


    if(!attrs['customIcon'] && this.config.node.defaultIcon) {
      for(let label of pgNode.labels) {
        let lowerLabel = label.toLowerCase();
        if (!Blitzboard.loadedIcons[lowerLabel]) {
          Blitzboard.loadedIcons[lowerLabel] = 'retrieving...'; // Just a placeholder to avoid duplicate fetching
          Iconify.loadIcons(
            Blitzboard.iconPrefixes.map((prefix) => prefix + lowerLabel),
            iconRegisterer(lowerLabel)
          );
        }
      }
    }
    

    if(thumbnailUrl) {
      attrs['shape'] = 'image';
      attrs['image'] = thumbnailUrl;
    }
    attrs = Object.assign(attrs, extraOptions);
    return attrs;
  }
  
  retrieveConfigProp(pgEdge, propName) {
    const edgeLabel = pgEdge.labels.join('_');
    let propConfig = this.config?.edge[propName];
    if((typeof propConfig) === 'function') {
      return propConfig(new Proxy(pgEdge, Blitzboard.blitzProxy));
    } else if((typeof propConfig) === 'object') {
      return pgEdge.properties[this.config?.edge[propName][edgeLabel]]?.[0];
    } else if((typeof propConfig) === 'string' && propConfig.startsWith('@')) {
      return pgEdge.properties[propConfig.substr(1)]?.[0];
    }
    return propConfig; // return as constant
  }

  toVisEdge(pgEdge, props = this.config.edge.caption, id) {
    const edgeLabel = pgEdge.labels.join('_');
    if (!this.edgeColorMap[edgeLabel]) {
      this.edgeColorMap[edgeLabel] = getRandomColor(edgeLabel, this.config.edge.saturation || '0%', this.config.edge.brightness || '30%');
    }
    let length = this.retrieveConfigProp(pgEdge, 'length');
    let width = parseFloat(this.retrieveConfigProp(pgEdge, 'width'));
    let color = this.retrieveConfigProp(pgEdge, 'color');
    console.log(color);

    return {
      id: id,
      from: pgEdge.from,
      to: pgEdge.to,
      color: color || this.edgeColorMap[edgeLabel],
      label: createLabelText(pgEdge, props),
      title: createTitleText(pgEdge),
      remoteId: id,
      length: length,
      width: width,
      hoverWidth: 0.5,
      smooth: this.map ? false : { roundness: 1 },
      arrows: {
        to: {
          enabled: pgEdge.direction == '->' || pgEdge.undirected === 'false'
        },
      }
    }
  }
  
  includesNode(node) {
    return this.graph.nodes.filter(e => e.id === node.id).length > 0;
  }
  
  addNode(node, update = true) {
    this.addNodes([node], update);
  }
  
  addNodes(nodes, update = true) {
    let newNodes;
    if (typeof nodes === 'string' || nodes instanceof String) {
      let pg = tryPgParse(nodes);
      newNodes = pg.nodes;
    } else {
      newNodes = nodes;
    }
    newNodes = newNodes.filter(node => !this.includesNode(node)).map((node) => {
      let mapped = deepMerge(Blitzboard.nodeTemplate, node);
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
  }
  
  addEdge(edge, update = true) {
    this.addEdges([edge], update);
  }

  addEdges(edges, update = true) {
    let newEdges;
    if (typeof edges === 'string' || edges instanceof String) {
      let pg = tryPgParse(edges);
      newEdges = pg.edges
    } else {
      newEdges = edges
    }
    newEdges = newEdges.map((edge) => {
      let mapped = deepMerge(Blitzboard.edgeTemplate, edge);
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
  }



  setGraph(input, update = true) {
    this.nodeColorMap = {};
    this.edgeColorMap = {};
    this.prevMouseEvent = null;
    this.dragging = false;
    let newPg;
    if (typeof input === 'string' || input instanceof String) {
      try {
        newPg = JSON.parse(input);
      } catch (err) {
        if (err instanceof SyntaxError)
          newPg = tryPgParse(input);
        else
          throw err;
      }
    } else {
      newPg = input;
    }
    if (newPg === null || newPg === undefined)
      return;
    this.graph = newPg;
    if(update)
      this.update();
  }


  setConfig(config, update = true) {
    this.config = deepMerge(Blitzboard.defaultConfig, config);
    if(config.layout === 'hierarchical') {
      // Remove redundant settings when layout is hierarchical
      this.config.layoutSettings = config.layoutSettings;
    }
    if(update)
      this.update(false);
  }
  
  update(applyDiff = true) {
    let blitzboard = this;
    applyDiff = applyDiff && this.nodeDataSet && this.edgeDataSet;
    if(applyDiff) {
      let nodesToDelete = new Set(Object.keys(this.nodeMap));
      let newEdgeMap = {};

      this.nodeLineMap = {};
      this.edgeLineMap = {};
      this.maxLine = 0;
      this.graph.nodes.forEach(node => {
        let existingNode = this.nodeMap[node.id];
        if(existingNode) {
          if(!nodeEquals(node, existingNode)) {
            this.nodeDataSet.remove(existingNode);
            let visNode = this.toVisNode(node, this.config.node.caption);
            this.nodeDataSet.update(visNode);
          }
        } else {
          let visNode = this.toVisNode(node, this.config.node.caption);
          this.nodeDataSet.add(visNode);
        }
        this.nodeMap[node.id] = node;
        nodesToDelete.delete(node.id);
        if(node.location) {
          for (let i = node.location.start.line; i <= node.location.end.line; i++) {
            if (i < node.location.end.line || node.location.end.column > 1)
              this.nodeLineMap[i] = node;
          }
          this.maxLine = Math.max(this.maxLine, node.location.end.line);
        }
      });

      this.graph.edges.forEach(edge => {
        let id = toNodePairString(edge);
        while(newEdgeMap[id]) {
          id += '_';
        }
        edge.id = id;
        newEdgeMap[id] = edge;
        let visEdge = this.toVisEdge(edge, this.config.edge.caption, id);
        this.edgeDataSet.update(visEdge);
        if(edge.location) {
          for (let i = edge.location.start.line; i <= edge.location.end.line; i++) {
            if (i < edge.location.end.line || edge.location.end.column > 1)
              this.edgeLineMap[i] = visEdge;
          }
        }
        this.maxLine = Math.max(this.maxLine, edge.location.end.line);
      });

      nodesToDelete.forEach((nodeId) => {
        this.nodeDataSet.remove(this.nodeMap[nodeId]);
        delete this.nodeMap[nodeId];
      });

      for(let edgeId of Object.keys(this.edgeMap)) {
        if(!newEdgeMap[edgeId]) {
          this.edgeDataSet.remove(edgeId);
        }
      }
      this.edgeMap = newEdgeMap;
      if(this.map) {
        blitzboard.updateNodeLocationOnMap();
      }
      if(this.config.layout === 'timeline') {
        blitzboard.updateNodeLocationOnTimeLine();
      }
    }
    
    this.prevZoomPosition = null;
    
    this.minTime = new Date(8640000000000000);
    this.maxTime = new Date(-8640000000000000);
    
    if(this.config.layout === 'timeline') {
      let fromProp = this.config.layoutSettings.time_from;
      let toProp = this.config.layoutSettings.time_to;
      
      this.graph.nodes.forEach(node => {
        for (let prop of Object.keys(node.properties)) {
          if (prop === fromProp || prop === toProp) {
            this.minTime = new Date(Math.min(this.minTime, new Date(node.properties[prop][0])));
            this.maxTime = new Date(Math.max(this.maxTime, new Date(node.properties[prop][0])));
          }
        }
      });
      this.timeInterval = this.maxTime - this.minTime;
    }

    if(applyDiff) return;

    this.nodeProps = new Set(['id', 'label']);
    this.edgeProps = new Set(['label']);
    this.graph.nodes.forEach((node) => {
      this.nodeMap[node.id] = node;
      if(node.location) {
        for (let i = node.location.start.line; i <= node.location.end.line; i++)
          if (i < node.location.end.line || node.location.end.column > 1)
            this.nodeLineMap[i] = node;
      }
      Object.keys(node.properties).filter((prop) => prop != 'degree').forEach(this.nodeProps.add, this.nodeProps);
    });
    this.graph.edges.forEach((edge) => {
      Object.keys(edge.properties).forEach(this.edgeProps.add, this.edgeProps);
    });

    let defaultNodeProps = this.config.node.caption;
    let defaultEdgeProps = this.config.edge.caption;

    this.nodeDataSet = new vis.DataSet();
    this.nodeDataSet.add(this.graph.nodes.map((node) => {
      return this.toVisNode(node, defaultNodeProps);
    }));
    
    this.edgeMap = {};
    this.edgeDataSet = new vis.DataSet(this.graph.edges.map((edge) => {
      let id = toNodePairString(edge);
      while(this.edgeMap[id]) {
        id += '_';
      }
      let visEdge = this.toVisEdge(edge, defaultEdgeProps, id);
      this.edgeMap[visEdge.id] = edge;
      if(edge.location) {
        for (let i = edge.location.start.line; i <= edge.location.end.line; i++)
          if (i < edge.location.end.line || edge.location.end.column > 1)
            this.edgeLineMap[i] = visEdge;
      }

      return visEdge;
    }));
    // create a network
    let data = {
      nodes: this.nodeDataSet,
      edges: this.edgeDataSet
    };

    let layout = {
      randomSeed: 1
    };

    if(this.config.layout === 'hierarchical') {
      layout.hierarchical = this.config.layoutSettings;
    } else {
      layout.hierarchical = false;
    }

    this.options = {
      layout:
        layout,
      interaction: {
        dragNodes: this.config.layout !== 'map',
        dragView: this.config.layout !== 'map',
        zoomView: this.config.layout !== 'map',
        hover: true,
      },
      physics: {
        enabled: this.config.layout !== 'map' && this.config.layout !== 'hierarchical',
        barnesHut: {
          springConstant:  this.config.layout === 'timeline' ? 0.004 : 0.016
        },
        stabilization: {
          enabled: false,
          iterations: 200,
          updateInterval: 25
        }
      },
      manipulation: false,

      edges: {
        arrows: {
          to: {
            enabled: true,
            scaleFactor: 0.3,
            type: "arrow"
          },
        },
      },
    };

    this.network = new vis.Network(this.networkContainer, data, this.options);

    if(this.config.layout === 'map') {
      this.mapContainer.style.display = 'block';
      let statistics = statisticsOfMap();
      let center = this.config?.layoutSettings?.center || statistics.center;
      if(this.map) {
        this.map.panTo(center);
      } else {
        this.map = L.map(this.mapContainer, {
          center: center,
          zoom: statistics.scale,
          minZoom: 3,
          zoomSnap: 0.01,
          zoomControl: false,
        });
        var tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="http://osm.org/copyright">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
        });
        tileLayer.addTo(this.map);

        this.map.on('move', () => blitzboard.updateNodeLocationOnMap());
        this.map.on('zoom', () => blitzboard.updateNodeLocationOnMap());
      }
      blitzboard.network.moveTo({scale: 1.0});
    } else {
      this.mapContainer.style.display = 'none';
      if(this.map) {
        this.map.remove();
      }
      this.map = null;
    }


    this.network.on('resize', (e) => {
      if(blitzboard.config.layout === 'map') {
        // Fix scale to 1.0 (delay is needed to override scale set by vis-network)  
        let newScale = Math.min(Blitzboard.maxScaleOnMap, Math.max(blitzboard.network.getScale(), Blitzboard.minScaleOnMap));
        setTimeout( () => {
          blitzboard.network.moveTo({scale: newScale});
          blitzboard.updateNodeLocationOnMap();
        }, 10); 
        blitzboard.map.invalidateSize();
      }
    });
    

    this.network.on('dragStart', (e) => {
      const node = this.nodeDataSet.get(e.nodes[0]);
      if(e.nodes.length > 0) {
        this.nodeDataSet.update({
          id: e.nodes[0],
          fixed: node.fixedByTime ? {x: true, y: true } : false
        });
      }
    });
    

    function statisticsOfMap() {
      let lngKey =  blitzboard.config.layoutSettings.lng;
      let latKey =  blitzboard.config.layoutSettings.lat;
      let lngSum = 0, latSum = 0, count = 0,
        lngMax = Number.MIN_VALUE, lngMin = Number.MAX_VALUE,
        latMax = Number.MIN_VALUE, latMin = Number.MAX_VALUE;
      blitzboard.graph.nodes.forEach(node => {
        if(node.properties[latKey] && node.properties[lngKey]) {
          let lng = parseFloat(node.properties[lngKey][0]);
          let lat = parseFloat(node.properties[latKey][0]);
          lngSum += lng;
          latSum += lat;
          lngMax = Math.max(lng, lngMax);
          lngMin = Math.min(lng, lngMin);
          latMax = Math.max(lat, latMax);
          latMin = Math.min(lat, latMin);
          ++count;
        }
      });
      if(count === 0)
        return [0, 0];
      return {
        center: [latSum / count, lngSum / count],
        scale: Math.max( -Math.log2(Math.max(Math.abs(lngMax - lngMin), Math.abs(latMax - latMin)) / 1000), 0)
      };
    }

    
    this.network.on("zoom", function(){
      let pos = blitzboard.network.getViewPosition();
      if(blitzboard.config.zoom?.min && blitzboard.network.getScale() < blitzboard.config.zoom.min)
      {
        blitzboard.network.moveTo({
          position: blitzboard.prevZoomPosition,
          scale: blitzboard.config.zoom?.min
        });
      }
      else if(blitzboard.config.zoom?.max && blitzboard.network.getScale() > blitzboard.config.zoom.max){
        blitzboard.network.moveTo({
          position: blitzboard.prevZoomPosition,
          scale: blitzboard.config.zoom.max,
        });
      } else {
        blitzboard.prevZoomPosition = pos;
      }
    });
    
    if(this.map) {
      this.updateNodeLocationOnMap();
    }
    
    this.network.on("hoverNode", (e) => {
      this.network.canvas.body.container.style.cursor = 'default';
      const node = this.nodeDataSet.get(e.node);
      if(node && node.url) {
        this.network.canvas.body.container.style.cursor = 'pointer';
        this.nodeDataSet.update({
          id: e.node,
          color: '#8888ff',
        });
        if(this.config.node.onHover) {
          this.config.node.onHover(this.getNode(e.node));
        }
      } else if(node && node.degree > 1 && !this.expandedNodes.includes(e.node)) {
        this.network.canvas.body.container.style.cursor = 'pointer';
      }
    });

    function plotTimes(startTime, interval, intervalUnit, timeForOnePixel, offsetX, offsetY, rightMostX, context, scale) {
      let currentTime = new Date(startTime);
      switch(intervalUnit) {
        case 'year':
          currentTime = new Date(currentTime.getFullYear()  - currentTime.getFullYear() % interval, 0, 1);
          break;
        case 'month':
          currentTime = new Date(currentTime.getFullYear(), currentTime.getMonth() - currentTime.getMonth() % interval, 1);
          break;
        case 'day':
          currentTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate());
          break;
        default:
          return;
      }
      let i = 0;
      while(++i < 100) {
        const nextPosition = -offsetX + (currentTime - startTime) / timeForOnePixel;
        if(nextPosition > rightMostX) break;
        if(intervalUnit === 'year')
          context.fillText(currentTime.getFullYear(), nextPosition, -offsetY);
        else
          context.fillText(currentTime.toLocaleDateString(), nextPosition, -offsetY);
        context.moveTo(nextPosition, -offsetY);
        context.lineTo(nextPosition, -offsetY + 25 / scale);
        context.stroke();
        switch(intervalUnit) {
          case 'year':
            currentTime.setFullYear(currentTime.getFullYear() + interval);
            break;
          case 'month':
            currentTime.setMonth(currentTime.getMonth() + interval);
            break;
          case 'day':
            currentTime.setDate(currentTime.getDate() + interval);
            break;
          default:
            return;
        }
      }
    }
    
    this.network.on("afterDrawing", (ctx) => {
      for(let node of this.graph.nodes) {
        node = this.nodeDataSet.get(node.id);
        if(node && node.shape !== 'image' && (node.customIcon || this.config.node.defaultIcon)) {
          let position = this.network.getPosition(node.id);
          let pgNode = this.nodeMap[node.id];
          if(node.customIcon) {
            if(node.customIcon.name && Blitzboard.loadedIcons[node.customIcon.name]) { // Iconiy
              ctx.drawImage(Blitzboard.loadedIcons[node.customIcon.name],
                position.x - node.size * Blitzboard.iconSizeCoef / 2, position.y - node.size * Blitzboard.iconSizeCoef / 2);
            } else { // Ionicons
              ctx.font = `${node.customIcon.size}px Ionicons`;
              ctx.fillStyle = "white";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(node.customIcon.code, position.x, position.y);
            }
          } else {
            if(!pgNode) {
              continue;
            }
            for (let label of pgNode.labels) {
              let lowerLabel = label.toLowerCase();
              if (Blitzboard.loadedIcons[lowerLabel]) {
                if(Blitzboard.loadedIcons[lowerLabel] != 'retrieving...')
                  ctx.drawImage(Blitzboard.loadedIcons[lowerLabel], position.x - node.size * Blitzboard.iconSizeCoef / 2, position.y - node.size * Blitzboard.iconSizeCoef / 2);
                break;
              }
            }
          }
        }
      }

     if(this.config.layout === 'timeline'){
        const context = this.network.canvas.getContext("2d");
        const view = this.network.canvas.body.view;
        const offsetY = (view.translation.y - 20) / view.scale;
        const offsetX = view.translation.x / view.scale;
        const timeForOnePixel = (this.maxTime - this.minTime) / this.timeScale;
        const timeOnLeftEdge = new Date(((this.maxTime.getTime() + this.minTime.getTime()) / 2) - timeForOnePixel * offsetX);
        const clientWidth = this.network.canvas.body.container.clientWidth;
        const rightMost = -offsetX + clientWidth / view.scale;
        const oneMonth = 31 * 24 * 60 * 60 * 1000;
        const oneDay = 24 * 60 * 60 * 1000;
        const twoMonth = oneMonth * 2;
        const fourMonth = twoMonth * 2;
        const oneYear = 365 * oneDay;
        const minDistance = 200;
        context.font = (20 / view.scale).toString() + "px Arial";
        context.fillStyle = "blue";
        const minimumInterval = timeForOnePixel * minDistance / view.scale;
        if(minimumInterval > oneYear ) {
          plotTimes(timeOnLeftEdge, minimumInterval / oneYear, 'year', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
        }
        else if(minimumInterval > fourMonth ) {
          plotTimes(timeOnLeftEdge, 4, 'month', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
        }
        else if(minimumInterval > twoMonth) {
          plotTimes(timeOnLeftEdge, 2, 'month', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
        }
        else if(minimumInterval > oneMonth) {
          plotTimes(timeOnLeftEdge, 1, 'month', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
        } else if(minimumInterval > oneDay * 16) {
          plotTimes(timeOnLeftEdge, 16, 'day', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
        } else if(minimumInterval > oneDay * 8) {
          plotTimes(timeOnLeftEdge, 8, 'day', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
        } else if(minimumInterval > oneDay * 4) {
          plotTimes(timeOnLeftEdge, 4, 'day', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
        } else if(minimumInterval > oneDay * 2) {
          plotTimes(timeOnLeftEdge, 2, 'day', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
        } else {
          plotTimes(timeOnLeftEdge, 1, 'day', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
        }
      }
    });
    this.network.on("blurNode", (params) => {
      this.network.canvas.body.container.style.cursor = 'default';
      let node = this.nodeDataSet.get(params.node);
      if(node && node.url) {
        this.nodeDataSet.update({
          id: params.node,
          color: null,
        });
      }
    });

    if (!Blitzboard.fondLoaded && document.fonts) {
      Blitzboard.fondLoaded = true;
      let blitzboard = this;
      // Decent browsers: Make sure the fonts are loaded.
      document.fonts.load('normal normal 400 24px/1 "FontAwesome"')
        .catch(
          console.error.bind(console, "Failed to load Font Awesome 4.")
        ).then(function () {
        blitzboard.network.redraw();
      })
        .catch(
          console.error.bind(
            console,
            "Failed to render the network with Font Awesome 4."
          )
        );
    }

    function clickHandler(e) {
      blitzboard.doubleClickTimer = null;
      if (e.nodes.length > 0) {
        if (blitzboard.config.node.onClick) {
          blitzboard.config.node.onClick(blitzboard.getNode(e.nodes[0]));
        }
      } else if (e.edges.length > 0) {
        if (blitzboard.config.edge.onClick) {
          blitzboard.config.edge.onClick(blitzboard.getEdge(e.edges[0]));
        }
      }
    }

    this.network.on("click", (e) => {
      if(!this.doubleClickTimer) {
        if (this.config.doubleClickWait <= 0) {
          clickHandler(e);
        } else {
          this.doubleClickTimer = setTimeout(() => clickHandler(e), this.config.doubleClickWait);
        }
      }
    });

    
    this.network.on("doubleClick", (e) => {
      clearTimeout(this.doubleClickTimer);
      this.doubleClickTimer = null;
      if(e.nodes.length > 0) {
        if(this.config.node.onDoubleClick) {
          this.config.node.onDoubleClick(this.getNode(e.nodes[0]));
        }
      } else if(e.edges.length > 0) {
        if(this.config.edge.onDoubleClick) {
          this.config.edge.onDoubleClick(this.getEdge(e.edges[0]));
        }
      }
    });
  }


  scrollNodeIntoView(node, select = true) {
    if(typeof(node) === 'string')
      node = this.nodeMap[node];
    if(!node)
      return;

    if(this.config.layout === 'map') {
      this.scrollMapToNode(this.nodeMap[node.id]);
    } else {
      this.scrollNetworkToPosition(this.network.getPosition(node.id));
    }
    if(select)
      this.network.selectNodes([node.id]);

    for(let callback of this.onNodeFocused) {
      // TODO: The argument should be proxy instead of plain objects
      callback(node);
    }
  }
  
  scrollNetworkToPosition(position) {
    clearTimeout(this.scrollAnimationTimerId);
    this.scrollAnimationTimerId = setTimeout(() => {
      const animationOption = {
        scale: 1.0,
        animation:
          {
            duration: 500,
            easingFuntcion: "easeInOutQuad"
          }
      };
      this.network.moveTo({ ...{position: position}, ...animationOption });
    }, 200); // Set delay to avoid calling moveTo() too much (seem to cause some bug on animation)
  }
  
  updateNodeLocationOnMap() {
    let nodePositions = [];
    let lngKey =  this.config.layoutSettings.lng;
    let latKey =  this.config.layoutSettings.lat;
    this.graph.nodes.forEach(node => {
      if(node.properties[latKey] && node.properties[lngKey]) {
        let point = this.map.latLngToContainerPoint([node.properties[latKey][0], node.properties[lngKey][0]]);
        point = this.network.DOMtoCanvas(point);
        nodePositions.push({
          id: node.id,
          x: point.x, y: point.y, fixed: true
        });
      }
    });
    this.nodeDataSet.update(nodePositions);
  }


  updateNodeLocationOnTimeLine() {
    let nodePositions = [];
    this.graph.nodes.forEach(node => {
      let x, y, fixed, width;
      ({x, y, fixed, width} = this.calcNodePosition(node));
      nodePositions.push({
        id: node.id,
        x, y
      });
    });
    this.nodeDataSet.update(nodePositions);
  }
  
  scrollMapToNode(node) {
    let lngKey = this.config.layoutSettings.lng;
    let latKey = this.config.layoutSettings.lat;
    this.map.panTo([node.properties[latKey][0] ,node.properties[lngKey][0]]);
  }
  
  scrollEdgeIntoView(edge, select = true) {
    if(typeof(edge) === 'string') {
      edge = this.edgeMap[edge];
    }

    if(this.config.layout === 'map') {
      this.scrollMapToNode(this.nodeMap[edge.from]);
    } else {
      const from = this.network.getPosition(edge.from);
      const to = this.network.getPosition(edge.to);
      this.scrollNetworkToPosition({ x: (from.x + to.x) / 2, y: (from.y + to.y) /2 });
    }
    if(select) {
      blitzboard.network.selectEdges([edge.id]);
    }

    for(let callback of this.onEdgeFocused) {
      // TODO: The argument should be proxy instead of plain objects
      callback(edge);
    }
  }
  
  showLoader(text = "Now loading...") {
    this.screen.style.display = 'flex';
    this.screenText.innerText = text;
  }
  
  hideLoader() {
    this.screen.style.display = 'none';
  }
}

let markers = [];
let nodeProps, edgeProps;

function arrayEquals(a, b) {
  return Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((val, index) => val === b[index]);
}

function nodeEquals(node1, node2) {
  if(node1.id != node2.id || !arrayEquals(node1.labels, node2.labels)) {
    return false;
  }
  let node1Keys = Object.keys(node1.properties);
  let node2Keys = Object.keys(node2.properties);
  if(node1Keys.length != node2Keys.length) {
    return false;
  }
  for(let key of node1Keys) {
    if(!arrayEquals(node1.properties[key], node2.properties[key]))
      return false;
  }
  return true;
}


function deepMerge(target, source) {
  const isObject = obj => obj && typeof obj === 'object' && !Array.isArray(obj);
  let result = Object.assign({}, target);
  if (isObject(target) && isObject(source)) {
    for (const [sourceKey, sourceValue] of Object.entries(source)) {
      const targetValue = target[sourceKey];
      if (isObject(sourceValue) && target.hasOwnProperty(sourceKey)) {
        result[sourceKey] = deepMerge(targetValue, sourceValue);
      }
      else {
        Object.assign(result, {[sourceKey]: sourceValue});
      }
    }
  }
  return result;
}

function retrieveHttpUrl(node) {
  let candidates = [];
  for(let entry of Object.entries(node.properties)) {
    for(let prop of entry[1]) {
      if(typeof(prop) === 'string' && (prop.startsWith("https://") || prop.startsWith("http://"))) {
        if(entry[0].toLowerCase() == 'url')
          return prop;
        candidates.push([entry[0], prop]);
      }
    }
  }
  return candidates[0];
}


function toNodePairString(pgEdge) {
  return `${pgEdge.from}-${pgEdge.to}`;
}


function wrapText(str, asHtml) {
  if(!str)
    return str;
  if(Array.isArray(str))
    str = str[0];
  const maxWidth = 40;
  let newLineStr = asHtml ? "<br>" : "\n", res = '';
  while (str.length > maxWidth) {
    res += str.slice(0, maxWidth) + newLineStr;
    str = str.slice(maxWidth);
  }
  return res + str;
}

function createLabelText(elem, props = null) {
  if (props != null) {
    // Use whitespace instead of empty string if no props are specified because Vis.js cannot update label with empty string)
    return props.length ? props.map((prop) => prop === 'id' ? elem.id : (prop === 'label' ? elem.labels : wrapText(elem.properties[prop]))).filter((val) => val).join('\n') : ' ';
  }
}

function createTitleText(elem) {
  let flattend_props = Object.entries(elem.properties).reduce((acc, prop) =>
    acc.concat(`<tr><td>${prop[0]}</td><td>${wrapText(prop[1], true)}</td></tr>`), []);
  if (elem.id) // for nodes
  {
    let idText = `<tr><td><b>${elem.id}</b></tr></td>`;
    flattend_props.splice(0, 0, idText);
    flattend_props.push(`<tr><td width="100px">label</td><td width="200px">${wrapText(elem.labels.join(':'), true)}</td></tr>`);
  }
  if (flattend_props.length === 0) {
    return null;
  }
  return htmlTitle(`<table style='fixed'>${flattend_props.join('')}</table>`);
}

// Create random colors, with str as seed, and with fixed saturation and lightness
function getRandomColor(str, saturation, brightness) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  let hue = hash % 360;
  return 'hsl(' + hue + `, ${saturation}, ${brightness})`;
}

function setSearchState(searching) {
  const icon =  q('#search-icon');
  if(searching) {
    icon.classList.remove("fa-search");
    icon.classList.add("fa-spinner");
    icon.classList.add("fa-spin");
  } else {
    icon.classList.add("fa-search");
    icon.classList.remove("fa-spinner");
    icon.classList.remove("fa-spin");
  }
}

function isDateString(str) {
  return isNaN(str) && !isNaN(Date.parse(str))
}

function tryPgParse(pg) {
  for(let marker of markers)
    marker.clear();
  markers = [];
  try {
    return pgParser.parse(pg);
  } catch(e) {
    console.log(e);
    if (!e.hasOwnProperty('location'))
      throw(e);
    let loc = e.location;
    // Mark leading characters in the error line
    markers.push(editor.markText({line: loc.start.line - 1, ch: 0}, {line: loc.start.line - 1, ch: loc.start.column - 1}, {className: 'syntax-error-line', message: e.message}));
    markers.push(editor.markText({line: loc.start.line - 1, ch: loc.start.column - 1}, {line: loc.end.line - 1, ch: loc.end.column - 1}, {className: 'syntax-error', message: e.message}));
    // Mark following characters in the error line
    markers.push(editor.markText({line: loc.end.line - 1, ch: loc.end.column - 1}, {line: loc.end.line - 1, ch: 10000},
      {className: 'syntax-error-line', message: e.message}));
    toastr.error(e.message, 'PG SyntaxError', {preventDuplicates: true})
    return null;
  }
}

function htmlTitle(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}

