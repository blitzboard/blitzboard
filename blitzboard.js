'use strict';

const q = document.querySelector.bind(document);
const qa = document.querySelectorAll.bind(document);


class Blitzboard {
  static fondLoaded = false;
  static defaultConfig = {
    node: {
      caption: ['id'],
      defaultIcon: true,
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
  };
  static iconPrefixes = ['fa-solid:', 'ion:', 'bx:bx-', 'gridicons:', 'akar-icons:'];
  static iconSizeCoef = 1.5;
  static minScaleOnMap = 0.3;
  static maxScaleOnMap = 1.0;
  static maxColumn = 100000;
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
    this.groups = new Set();
    this.expandedNodes = [];
    this.nodeMap = {};
    this.config = { node: {}, edge: {}}
    this.nodeLineMap = {};
    this.edgeMap = {};
    this.edgeLineMap = {};
    this.prevZoomPosition = null;
    this.map = null;
    this.prevMouseEvent= null;
    this.dragging = false;
    this.currentLatLng = null;
    this.redrawTimer = null;
    this.onNodeAdded = [];
    this.onEdgeAdded = [];
    this.maxLine = 0;
    this.scrollAnimationTimerId = null;

    let blitzboard = this;
    
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
        let newScale = blitzboard.map._zoom / 18;
        newScale = Math.min(Blitzboard.maxScaleOnMap, Math.max(newScale, Blitzboard.minScaleOnMap));
        setTimeout( () => blitzboard.network.moveTo({scale: newScale}), 10);
        blitzboard.map.invalidateSize();
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

  getNode(node_id) {
    return new Proxy(this.nodeMap[node_id], Blitzboard.blitzProxy);
  }
  
  getEdge(edge_id) {
    return new Proxy(this.edgeMap[edge_id], Blitzboard.blitzProxy);
  }
  
  calcNodePosition(pgNode) {
    let x, y, fixed, width;
    /*
    if(timeLineEnabled) {
      x = null;
      fixed = false;
      let positions = [];
      for(let prop of displayedTimeProps) {
        if(pgNode.properties[prop] && timeInterval > 0) {
          positions.push(timeScale * ((new Date(pgNode.properties[prop]).getTime()) - minTime.getTime()) * 1.0 / timeInterval - timeScale * 0.5);
        }
      }
      if(positions.length > 0) {
        fixed = true;
        let max = Math.max(...positions), min = Math.min(...positions);
        x = (max + min) / 2;
        width = max - min; 
      } else {
        x = 0;
      }
      y = 0;
    }
    else {
    */
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
    //}
    
    return {x, y, fixed, width};
  }

  toVisNode(pgNode, props, extraOptions = null) {
    const group = _.camelCase([...pgNode.labels].sort().join('_'));
    this.groups.add(group);

    let x, y, fixed, width;
    ({x, y, fixed, width} = this.calcNodePosition(pgNode));

    let url = retrieveHttpUrl(pgNode);
    let thumbnailUrl = retrieveThumbnailUrl(pgNode);
    let expanded = this.expandedNodes.includes(pgNode.id);

    let degree =  pgNode.properties['degree'];
    if(degree !== undefined) {
      degree = degree[0];
    } else {
      degree = 2; // assume degree to be two (default)
    }

    let attrs = {
      id: pgNode.id,
      group: group,
      label: createLabelText(pgNode, props),
      shape: (degree === 1 || expanded ? 'text' : 'dot'),
      size: expanded ? 25 : (2 + degree * 8),
      degree: degree,
      title: createTitleText(pgNode),
      fixed: {
        x: fixed,
        y: fixed
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
          if(blitzboard.redrawTimer) {
            clearTimeout(blitzboard.redrawTimer);
          }
          blitzboard.redrawTimer = setTimeout(() => {  // Add delay to avoid redraw too ofen
            blitzboard.network.redraw();
          }, 1000);
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
    if(width) {
      attrs['shape'] = 'box';
      attrs['widthConstraint'] = {
        minimum: width,
        maximum: width
      }
    }
    attrs = Object.assign(attrs, extraOptions);
    return attrs;
  }

  toVisEdge(pgEdge, props = this.config.edge.caption, id) {
    const edgeLabel = _.camelCase(pgEdge.labels.join('_'));
    if (!this.edgeColorMap[edgeLabel]) {
      this.edgeColorMap[edgeLabel] = getRandomColor(edgeLabel, this.config.edge.saturation || '0%', this.config.edge.brightness || '30%');
    }
    let length = null, lengthProp, width = null, widthProp;
    if(lengthProp = pgEdge.properties[this.config?.edge?.length?.[edgeLabel]]) {
      length = lengthProp[0];
    }
    if(widthProp = pgEdge.properties[this.config?.edge?.width?.[edgeLabel]]) {
      width = parseFloat(widthProp[0]);
    }

    return {
      id: id,
      from: pgEdge.from,
      to: pgEdge.to,
      color: this.edgeColorMap[edgeLabel],
      label: createLabelText(pgEdge, props),
      title: createTitleText(pgEdge),
      remoteId: id,
      length: length,
      width: width,
      hoverWidth: 0.5,
      smooth: blitzboard.config.layout === 'map' ? false : { roundness: 1 },
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
      ++this.maxLine;
      return mapped;
    });
    this.graph.nodes = this.graph.nodes.concat(newNodes);
    for(let callback of this.onNodeAdded) {
      // TODO: This function should return proxy instead of plain objects
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
      ++this.maxLine;
      return mapped;
    });
    this.graph.edges = this.graph.edges.concat(newEdges);
    for(let callback of this.onEdgeAdded) {
      // TODO: This function should return proxy instead of plain objects
      callback(newEdges);
    }
    if(update)
      this.update();
  }



  setGraph(input, update = true) {
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
        updateNodeLocationOnMap();
      }

      // this.groupColorMap =  [...this.groups].reduce((acc, group) => {
      //   acc[group] = {color: getRandomColor(group, this.config.node.saturation || '100%', this.config.node.brightness || '40%')}; return acc;
      // }, {});
      // this.options.groups = this.groupColorMap;
    }

    if(applyDiff) return;

    this.groups = new Set();
    
    this.prevZoomPosition = null;
    
    minTime =  new Date(8640000000000000), maxTime = new Date(-8640000000000000);
    
    // graph.nodes.forEach(node => {
    //   for(let prop of Object.keys(node.properties)) {
    //     if(!timeProperties.has(prop) && isDateString(node.properties[prop])){
    //       timeProperties.add(prop);
    //     }
    //   }
    // });

    /*
    while(timeLineFolder.__controllers.length > 0) timeLineFolder.__controllers[0].remove();
    
    for(let prop of timeProperties) {
      let controller = timeLineFolder.add({[prop]: false}, prop, false);
      controller.onChange(onTimeLinePropertyController);
    }
    */

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

    //updateTimeLineNodes();
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

    this.groupColorMap =  [...this.groups].reduce((acc, group) => {
      acc[group] = {color: getRandomColor(group, this.config.node.saturation || '100%', this.config.node.brightness || '40%')}; return acc;
    }, {});

    this.options = {
      groups: this.groupColorMap,
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
          springConstant: 0.016
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
    
    // this.graph.nodes.forEach((node) => {
    //   L.marker([node.properties[this.config.layoutSettings.x][0], node.properties[this.config.layoutSettings.y][0]]).addTo(map);
    // });
    /*
    var polylinePoints = [
      [35.08850794862861, 137.15369183718374],
      [35.087384224892155, 137.15639550369508]
    ];
    L.polyline(polylinePoints).addTo(this.map);
    var polylinePoints = [
      [35.08850794862861, 137.15369183718374],
      [35.08850794862861, 137.156]
    ];
    L.polyline(polylinePoints).addTo(this.map);
    */

    this.network = new vis.Network(this.container, data, this.options);
    //this.container.style.background = 'transparent';

    // network.on('selectNode', (e) => {
    //   if (e.nodes.length > 0) {
    //     if(!localMode) {
    //       selectTimer = setTimeout(() => retrieveGraph(e.nodes[0], true), 300);
    //     }
    //   }
    // });


    if(this.config.layout === 'map') {
      let statistics = statisticsOfMap();
      let center = this.config?.layoutSettings?.center || statistics.center;
      if(this.map) {
        this.map.panTo(center);
      } else {
        this.map = L.map('map', {
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

        this.map.on('move', updateNodeLocationOnMap);
        this.map.on('zoom', updateNodeLocationOnMap);
      }
      blitzboard.network.moveTo({scale: 1.0});
    } else {
      if(this.map) {
        this.map.remove();
      }
      this.map = null;
    }


    this.network.on('resize', (e) => {
      if(blitzboard.config.layout === 'map') {
        // Fix scale to 1.0 (delay is needed to override scale set by vis-network)  
        let newScale = Math.min(Blitzboard.maxScaleOnMap, Math.max(blitzboard.network.getScale(), Blitzboard.minScaleOnMap));
        setTimeout( () => blitzboard.network.moveTo({scale: newScale}), 10); 
        blitzboard.map.invalidateSize();
      }
    });

    // network.on('doubleClick', (e) => {
    //   if (localMode) {
    //     if(e.nodes.length == 0) {
    //       let newNode = {
    //         id: newNodeId(),
    //         labels: ['New'],
    //         properties: {},
    //       };
    //       addNewNode(newNode, e.pointer.canvas.x, e.pointer.canvas.y);
    //     } else {
    //       const position = e.pointer.canvas;
    //       const node = e.nodes[0];
    //       nodeDataSet.update({id: node, fixed: {x: true, y: true}});
    //     }
    //   }
    //   else if (e.nodes.length > 0)
    //     retrieveGraph(e.nodes[0]);
    // });

    this.network.on('dragStart', (e) => {
      const node = this.nodeDataSet.get(e.nodes[0]);
      if(e.nodes.length > 0) {
        this.nodeDataSet.update({
          id: e.nodes[0],
          fixed: node.fixedByTime ? {x: true, y: true } : false
        });
      }
    });
    
    function updateNodeLocationOnMap() {
      let nodePositions = [];
      let xKey =  blitzboard.config.layoutSettings.x;
      let yKey =  blitzboard.config.layoutSettings.y;
      blitzboard.graph.nodes.forEach(node => {
        if(node.properties[yKey] && node.properties[xKey]) {
          let point = blitzboard.map.latLngToContainerPoint([node.properties[yKey][0], node.properties[xKey][0]]);
          point = blitzboard.network.DOMtoCanvas(point);
          nodePositions.push({
            id: node.id,
            x: point.x, y: point.y, fixed: true
          });
        }
      });
      blitzboard.nodeDataSet.update(nodePositions);
    }

    function statisticsOfMap() {
      let xKey =  blitzboard.config.layoutSettings.x;
      let yKey =  blitzboard.config.layoutSettings.y;
      let xSum = 0, ySum = 0, count = 0,
        xMax = Number.MIN_VALUE, xMin = Number.MAX_VALUE,
        yMax = Number.MIN_VALUE, yMin = Number.MAX_VALUE;
      blitzboard.graph.nodes.forEach(node => {
        if(node.properties[yKey] && node.properties[xKey]) {
          let x = parseFloat(node.properties[xKey][0]);
          let y = parseFloat(node.properties[yKey][0]);
          xSum += x;
          ySum += y;
          xMax = Math.max(x, xMax);
          xMin = Math.min(x, xMin);
          yMax = Math.max(y, yMax);
          yMin = Math.min(y, yMin);
          ++count;
        }
      });
      if(count === 0)
        return [0, 0];
      return {
        center: [ySum / count, xSum / count],
        scale: Math.max( -Math.log2(Math.max(Math.abs(xMax - xMin), Math.abs(yMax - yMin)) / 1000), 0)
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
      updateNodeLocationOnMap();
    }

    // if (!localMode) {
    //   network.on('doubleClick', (e) => {
    //     if (e.nodes.length > 0)
    //       retrieveGraph(e.nodes[0]);
    //   });
    //   network.on('dragEnd', (e) => {
    //     if(e.nodes.length > 0) {
    //       const node = nodeDataSet.get(e.nodes[0]);
    //       if(!node.fixed && this.expandedNodes.includes(e.nodes[0]) )
    //         nodeDataSet.update({
    //           id: e.nodes[0],
    //           fixed: true
    //         });
    //     }
    //   });
    // }

    this.network.on("hoverNode", (e) => {
      this.network.canvas.body.container.style.cursor = 'default';
      const node = this.nodeDataSet.get(e.node);
      if(node && node.url) {
        this.network.canvas.body.container.style.cursor = 'pointer';
        this.nodeDataSet.update({
          id: e.node,
          color: '#8888ff',
        });
      } else if(node && node.degree > 1 && !this.expandedNodes.includes(e.node)) {
        this.network.canvas.body.container.style.cursor = 'pointer';
      }
    });

    function plotTimes(startTime, interval, intervalUnit, timeForOnePixel, offsetX, offsetY, rightMostX, context, scale) {
      let currentTime = new Date(startTime);
      switch(intervalUnit) {
        case 'year':
          currentTime = new Date(currentTime.getFullYear(), 0, 1);
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
      while(true) {
        const nextPosition = -offsetX + (currentTime - startTime) / timeForOnePixel;
        if(nextPosition > rightMostX) break;
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

      // if(timeLineEnabled){
      //   const context = this.network.canvas.getContext("2d");
      //   const view = this.network.canvas.body.view;
      //   const offsetY = view.translation.y / view.scale;
      //   const offsetX = view.translation.x / view.scale;
      //   const timeForOnePixel = (maxTime - minTime) / timeScale;
      //   const timeOnLeftEdge = new Date(((maxTime.getTime() + minTime.getTime()) / 2) - timeForOnePixel * offsetX);
      //   const clientWidth = this.network.canvas.body.container.clientWidth;
      //   const rightMost = -offsetX + clientWidth / view.scale;
      //   const oneMonth = 31 * 24 * 60 * 60 * 1000;
      //   const oneDay = 24 * 60 * 60 * 1000;
      //   const twoMonth = oneMonth * 2;
      //   const fourMonth = twoMonth * 2;
      //   const oneYear = 365 * oneDay;
      //   const minDistance = 300;
      //   context.font = (20 / view.scale).toString() + "px Arial";
      //   const minimumInterval = timeForOnePixel * minDistance / view.scale;
      //   if(minimumInterval > oneYear ) {
      //     plotTimes(timeOnLeftEdge, 1, 'year', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
      //   }
      //   else if(minimumInterval > fourMonth ) {
      //     plotTimes(timeOnLeftEdge, 4, 'month', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
      //   }
      //   else if(minimumInterval > twoMonth) {
      //     plotTimes(timeOnLeftEdge, 2, 'month', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
      //   }
      //   else if(minimumInterval > oneMonth) {
      //     plotTimes(timeOnLeftEdge, 1, 'month', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
      //   } else if(minimumInterval > oneDay * 16) {
      //     plotTimes(timeOnLeftEdge, 16, 'day', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
      //   } else if(minimumInterval > oneDay * 8) {
      //     plotTimes(timeOnLeftEdge, 8, 'day', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
      //   } else if(minimumInterval > oneDay * 4) {
      //     plotTimes(timeOnLeftEdge, 4, 'day', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
      //   } else if(minimumInterval > oneDay * 2) {
      //     plotTimes(timeOnLeftEdge, 2, 'day', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
      //   } else {
      //     plotTimes(timeOnLeftEdge, 1, 'day', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
      //   }
      // }
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


    this.network.on("click", (e) => {
      if(e.nodes.length > 0) {
        if(this.config.node.onClick) {
          this.config.node.onClick(this.getNode(e.nodes[0]));
        }
      } else if(e.edges.length > 0) {
        if(this.config.edge.onClick) {
          this.config.edge.onClick(this.getEdge(e.edges[0]));
        }
      }
    });
    //
    //
    // this.network.on("click", (e) => {
    //   this.network.stopSimulation();
    //   if(e.nodes.length > 0) {
    //     let node = this.nodeDataSet.get(e.nodes[0]);
    //     if(srcNode) {
    //       let newEdge = {
    //         from: srcNode,
    //         to: node.id,
    //         undirected: false,
    //         labels: [],
    //         properties: {}
    //       };
    //       this.graph.edges.push(newEdge);
    //       let visEdge = this.toVisEdge(newEdge);
    //       this.edgeMap[visEdge.id] = newEdge;
    //       this.edgeDataSet.add(visEdge);
    //
    //       let oldPg = editor.getValue();
    //       newEdge.line = numberOfLines(oldPg) + 1;
    //       byProgram = true;
    //       editor.setValue(oldPg + `\n"${newEdge.from}" -> "${newEdge.to}" ${newEdge.labels.map((label) => ':' + label).join(' ')} `);
    //     } else if(localMode) {
    //       scrollToLine(nodeMap[e.nodes[0]].location);
    //     }
    //     if(node && node.url)
    //       window.open(node.url,'_blank');
    //   } else if(e.edges.length > 0) {
    //     scrollToLine(edgeMap[e.edges[0]].location);
    //   }
    // });
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
  
  scrollMapToNode(node) {
    let xKey = this.node.layoutSettings.x;
    let yKey = this.node.layoutSettings.y;
    this.map.panTo([node.properties[yKey][0] ,node.properties[xKey][0]]);
  }
  
  scrollEdgeIntoView(edge, select = true) {
    if(typeof(edge) === 'string') {
      edge = this.edgeMap[edge];
    }

    if(this.config.layout === 'map') {
      this.scrollMapToNode(edge.from);
    } else {
      const from = this.network.getPosition(edge.from);
      const to = this.network.getPosition(edge.to);
      this.scrollNetworkToPosition({ x: (from.x + to.x) / 2, y: (from.y + to.y) /2 });
    }
    if(select) {
      blitzboard.network.selectEdges([edge.id]);
    }
  }

}

let markers = [];
let nodeProps, edgeProps;
let minTime =  new Date(8640000000000000), maxTime = new Date(-8640000000000000);
let timeScale = 100.0;

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



/*
function updateTimeLineNodes() {
    if(timeLineEnabled) {
      let nodeCountWithTime = 0;
      graph.nodes.forEach(node => {
        for(let prop of displayedTimeProps) {
          let time = node.properties[prop];
          if(time) {
            ++nodeCountWithTime;
            time = new Date(time);
            minTime = time < minTime ? time : minTime;
            maxTime = time > maxTime ? time : maxTime;
          }
        }
      });
      timeInterval = maxTime.getTime() - minTime.getTime();
      timeScale = nodeCountWithTime * 100;
    }
}
*/

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

function retrieveThumbnailUrl(node) {
  for(let entry of Object.entries(node.properties)) {
    if(entry[0].toLowerCase() == 'thumbnail') {
      return entry[1][0]
    }
  }
  return null;
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


// function searchGraph() {
//   setSearchState(true);
//   const keyword = q('#search-input').value;
//   // timeProperties.clear();
//   domain = q('#url-input').value;
//   if (!domain.endsWith('/'))
//     domain += '/';
//   domain = 'http://' + domain;
//   const keywordPart = encodeURI(keyword.split(" ").map((word) => `\\"${word}\\"`).join(' AND '));
//   const query = `CALL db.index.fulltext.queryNodes("allProperties", "${keywordPart}") YIELD node RETURN node`;
//   axios.get(domain + `query?q=${query}`).then((response) => {
//     this.expandedNodes = response.data.pg.nodes.map((node) => node.id);
//
//     // TODO: use query which does not modify of backend
//     const subquery = `MATCH p=(n)-[r]-(another) WHERE id(n) in [${this.expandedNodes.join(',')}] WITH p, another, size((another)--()) as degree SET another.degree = degree RETURN p`
//     axios.get(domain + `query?q=${subquery}`).then((subresponse) => {
//       updateGraph(subresponse.data.pg);
//       setSearchState(false);
//     });
//   });
// }

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

function handleFileSelect(evt) {
  let files = evt.target.files; // FileList object
  // use the 1st file from the list
  const f = files[0];
  let reader = new FileReader();


  // Closure to capture the file information.
  reader.onload = (function (theFile) {
    return function (e) {
      editor.setValue(e.target.result);
      updateGraph();
    };
  })(f);
  // Read in the image file as a data URL.
  reader.readAsText(f);
};

function htmlTitle(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}
