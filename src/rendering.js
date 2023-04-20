const DeckGL = require("@deck.gl/core");
const DeckGLLayers = require("@deck.gl/layers");
const DeckGLGeoLayers = require("@deck.gl/geo-layers");
const {getRandomColor, getHexColors, createLabelText, createTitle, retrieveHttpUrl} = require("./util");

const defaultNodeSize = 5;


function updateLayers() {
  const coordinateSystem = this.config.layout === 'map' ? DeckGL.COORDINATE_SYSTEM.LNGLAT : DeckGL.COORDINATE_SYSTEM.CARTESIAN;
  const sizeUnits = this.config.layout === 'map' ? 'meters' : 'common';

  const scale = 0.2;

  let highlightedNodes = new Set([...this.hoveredNodes, ...this.selectedNodes]);

  let tmpNodeData = this.nodeDataSet;
  if(this.config.sccMode === 'cluster') {
    for(let scc of Object.keys(this.sccReverseMap)) {
      tmpNodeData[scc] = this.toClusterNode(scc.split("\n"), this.config.node.caption);
      for(let nodeId of scc) {
        delete tmpNodeData[nodeId];
      }
    }
  }

  tmpNodeData = Object.values(tmpNodeData);

  let tmpEdgeData = JSON.parse(JSON.stringify(this.edgeDataSet))

  for(let edge of tmpEdgeData) {
    edge.from = this.sccMap[edge.from] || edge.from;
    edge.to = this.sccMap[edge.to] || edge.to;
  }


  this.nodeLayer = new DeckGLLayers.ScatterplotLayer({
    id: 'scatterplot-layer',
    data: tmpNodeData,
    pickable: true,
    opacity: 1, // TODO
    stroked: false,
    filled: true,
    billboard: this.config.layout !== 'map',
    coordinateSystem,
    getPosition: (n) => [n.x, n.y, n.z + (this.config.layout === 'map' ? 20 : 0)],
    getRadius: (n) => n._size * (this.config.layout === 'map' ? 100 : 1), // TODO
    radiusMinPixels: Blitzboard.minNodeSizeInPixels, // TODO,
    radiusScale: scale,
    getFillColor: (n) => {
      if(this.selectedNodes.has(n.id))
        return Blitzboard.selectedNodeColor;
      else if(highlightedNodes.has(n.id))
        return n.color;
      let color = [...n.color];
      for(let i = 0; i < 3; ++i)
        color[i] = (128 + color[i]) / 2;
      return color;
    },
    onHover: info => this.onNodeHover(info),
    updateTriggers: {
      getFillColor: [highlightedNodes],
    },
    radiusUnits: sizeUnits,
  });

  this.edgeLayer = new DeckGLLayers.LineLayer({
    id: "line-layer",
    pickable: true,
    coordinateSystem,
    billboard: this.config.layout !== 'map',
    data: tmpEdgeData,
    getWidth: edge => edge.width,
    getSourcePosition: (edge) => {
      let {x, y, z} = this.nodeDataSet[edge.from];
      return [x, y, z];
    },
    getTargetPosition: (edge) => {
      let {x, y, z} = this.nodeDataSet[edge.to];
      return [x, y, z];
    },
    getColor: (e) => {
      if(highlightedNodes.has(e.from) || highlightedNodes.has(e.to) || this.selectedEdges.has(e.id) || this.hoveredEdges.has(e.id)) {
        return [e.color, e.color, e.color, 255];
      }
      let color = [...e.color];
      for(let i = 0; i < 3; ++i)
        color[i] = (128 * 3 + color[i]) / 4;
      color[3] = 64;
      return color;
    },
    updateTriggers: {
      getColor: [highlightedNodes, this.selectedEdges, this.hoveredEdges],
    },
    onHover: info => this.onEdgeHover(info),
    widthUnits: ('common'),
    widthScale: 0.02 * (this.config.layout === 'map' ? 0.01 : 1),
    widthMinPixels: 1,
  });

  const fontSize = 3;

  const characterSet = tmpNodeData.map(n => Array.from(n.label)).flat();

  let textLayerAttributes = {
    id: 'node-text-layer',
    pickable: true,
    getPosition: (node) => {
      return [node.x,
        node.y + (this.config.layout === 'map' ? -0.001 * node._size / defaultNodeSize : node._size * scale),
        node.z];
    },
    getText: node => node.label,
    getSize: (n) => n._size / defaultNodeSize * fontSize * (this.config.layout === 'map' ? 100 : 1), // TODO: somewhy, we have to scale the size for map layout
    sizeMaxPixels: 60,
    billboard: this.config.layout !== 'map',
    getAngle: 0,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'top',
    coordinateSystem,
    sizeUnits: sizeUnits,
    sizeScale: scale,
    outlineWidth: 1,
    outlineColor: [255, 255, 255, 255],
    onHover: info => this.onNodeHover(info),
    fontSettings: {
      sdf: true
    },
    characterSet
  };

  textLayerAttributes.data = tmpNodeData;

  this.nodeTextLayer = new DeckGLLayers.TextLayer(textLayerAttributes);

  textLayerAttributes.data = Array.from(highlightedNodes).map(id => this.nodeDataSet[id]).filter(n => n);
  textLayerAttributes.fontWeight = 900; // bolder than bold
  textLayerAttributes.id = 'hilighted-node-text-layer';
  this.highlightedNodeTextLayer = new DeckGLLayers.TextLayer(textLayerAttributes);

  this.edgeTextLayer = new DeckGLLayers.TextLayer({
    id: 'edge-text-layer',
    data: tmpEdgeData,
    pickable: true,
    getPosition: (edge) => {
      let {x: fromX, y: fromY, z: fromZ} = this.nodeDataSet[edge.from];
      let {x: toX, y: toY, z: toZ} = this.nodeDataSet[edge.to];
      return [(fromX + toX) / 2, (fromY + toY) / 2, (fromZ + toZ) / 2];
    },
    getText: edge => edge.label,
    getSize: fontSize,
    sizeScale: scale,
    billboard: this.config.layout !== 'map',
    getAngle: 0,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'top',
    coordinateSystem,
    sizeUnits: sizeUnits,
    outlineWidth: 1,
    outlineColor: [255, 255, 255, 255],
    onHover: info => this.onEdgeHover(info),
    fontSettings: {
      sdf: true
    }
  });

  this.edgeArrowLayer = new DeckGLLayers.IconLayer({
    id: 'edge-arrow-layer',
    data: tmpEdgeData.filter(e => !e.undirected || e.direction === '->'),
    coordinateSystem,
    getIcon: n => ({
      url: this.svgToURL('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" preserveAspectRatio="xMidYMid meet" viewBox="0 0 15 15"><path fill="currentColor" d="M7.932 1.248a.5.5 0 0 0-.864 0l-7 12A.5.5 0 0 0 .5 14h14a.5.5 0 0 0 .432-.752l-7-12Z"/></svg>'),
      width: 240,
      height: 240
    }),
    sizeScale: 0.1,
    getPosition: (edge) => {
      let {x: fromX, y: fromY, z: fromZ} = this.nodeDataSet[edge.from];
      let {x: toX, y: toY, z: toZ} = this.nodeDataSet[edge.to];

      let angle = Math.atan2(fromY - toY, fromX - toX);
      let nodeSize = this.nodeDataSet[edge.to]._size;
      return [toX + Math.cos(angle) * (nodeSize * scale + 0.1),
        toY + Math.sin(angle) * (nodeSize * scale + 0.1), (fromZ + toZ) / 2];
    },
    getAngle: (edge) => {
      let {x: fromX, y: fromY, z: fromZ} = this.nodeDataSet[edge.from];
      let {x: toX, y: toY, z: toZ} = this.nodeDataSet[edge.to];
      return Math.atan2(-(fromY - toY), fromX - toX) * 180 / Math.PI + 90;
    },
    getSize: n => 6 * (this.config.layout === 'map' ? 100 : 1),
    sizeUnits: sizeUnits,
    getColor: n => [255, 0, 0]
  });


  this.iconLayer = this.createIconLayer(tmpNodeData, scale, sizeUnits, coordinateSystem);

  this.updateThumbnailLayer();

  if(this.config.layout === 'map') {
    this.tileLayer = new DeckGLGeoLayers.TileLayer({
      id: 'TileLayer',
      // data: "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
      data: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxZoom: 19,
      minZoom: 0,
      tileSize: 256,
      renderSubLayers: props => {
        const {
          bbox: {west, south, east, north}
        } = props.tile;

        return new DeckGLLayers.BitmapLayer(props, {
          data: null,
          image: props.data,
          bounds: [west, south, east, north]
        });
      },
      pickable: true,
    });

    this.layers = [
      this.tileLayer,
      this.edgeLayer,
      this.edgeTextLayer,
      this.nodeLayer,
      // this.edgeArrowLayer,
      this.nodeTextLayer,
      this.highlightedNodeTextLayer,
      this.iconLayer,
      ...this.thumbnailLayers
    ];

    this.network.setProps({
      layers: this.layers,
    });
  } else {
    this.layers = [
      this.edgeLayer,
      this.edgeTextLayer,
      this.nodeLayer,
      // edgeArrowLayer,
      this.nodeTextLayer,
      this.highlightedNodeTextLayer,
      this.iconLayer,
      ...this.thumbnailLayers
    ]
    this.network.setProps({
      layers: this.layers
    });
  }
}

function updateThumbnailLayer() {
  // TODO: Create individual layers for each node may lead to performance problem
  this.thumbnailLayers = this.nodeData.map((n) => {
    if(n.imageURL && this.visibleBounds && this.viewState?.zoom >= Blitzboard.zoomLevelToLoadImage) {
      let bounds =  [ n.x + n._size / defaultNodeSize, n.y + n._size / defaultNodeSize,
        n.x - n._size / defaultNodeSize,
        n.y - n._size / defaultNodeSize];
      let visible =
        this.visibleBounds.left <= n.x &&
        this.visibleBounds.top <= n.y &&
        n.x <= this.visibleBounds.right &&
        n.y <= this.visibleBounds.bottom;
      if(visible) {
        return new DeckGLLayers.BitmapLayer({
          id: 'bitmap-layer-' + n.id,
          bounds,
          image: n.imageURL
        });
      }
    }
    return null;
  }).filter(n => n !== null);
}

function iconRegisterer(name) {
  return (icons) => {
    if(Blitzboard.loadedIcons[name] !== 'retrieving')
      return;
    if(icons.length > 0) {
      let icon = null;

      function findIconWithHighestPriority(icons) {
        for(let prefix of Blitzboard.iconPrefixes) {
          for(let i of icons) {
            if(`${i.prefix}:${i.name}`.startsWith(prefix)) {
              return i;
            }
          }
        }
        return icons[0];
      }

      icon = findIconWithHighestPriority(icons);
      icon = icon || icons[0];
      let size = 1000;
      let svg = Iconify.renderSVG(`${icon.prefix}:${icon.name}`, {
        width: size,
        height: size
      });
      let img = new Image();
      svg.querySelectorAll(
        "path,circle,ellipse,rect").forEach((path) => {
        path.style.fill = "white";
        path.style.stroke = "white";
      });
      img.src = blitzboard.svgToURL(svg.outerHTML);
      Blitzboard.loadedIcons[name] = img.src;
      blitzboard.refreshIconLayer();
    }
  };
}

function refreshIconLayer() {
  if(!this.iconLayer)
    return;

  // Refresh variables to trigger update of icons
  Blitzboard.loadedIcons = {...Blitzboard.loadedIcons};
  let oldLayer = this.iconLayer;
  this.iconLayer = this.createIconLayer(this.nodeData, this.iconLayer.props.sizeScale, this.iconLayer.props.sizeUnits, this.iconLayer.props.coordinateSystem);
  // replace with new one
  for(let i = 0; i < this.layers.length; ++i) {
    if(this.layers[i] === oldLayer) {
      this.layers[i] = this.iconLayer;
      break;
    }
  }
  this.network.setProps({layers: [...this.layers]});
}


function plotTimes(startTime, interval, intervalUnit, timeForOnePixel, offsetX, offsetY, rightMostX, context, scale) {
  let currentTime = new Date(startTime);
  switch(intervalUnit) {
    case 'year':
      currentTime = new Date(currentTime.getFullYear() - currentTime.getFullYear() % interval, 0, 1);
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

// this.network.on("afterDrawing", (ctx) => {
//   this.updateTooltipLocation();
//  if(this.config.layout === 'timeline'){
//     const context = this.network.canvas.getContext("2d");
//     const view = this.network.canvas.body.view;
//     const offsetY = (view.translation.y - 20) / view.scale;
//     const offsetX = view.translation.x / view.scale;
//     const timeForOnePixel = (this.maxTime - this.minTime) / this.timeScale;
//     const timeOnLeftEdge = new Date(((this.maxTime.getTime() + this.minTime.getTime()) / 2) - timeForOnePixel * offsetX);
//     const clientWidth = this.network.canvas.body.container.clientWidth;
//     const rightMost = -offsetX + clientWidth / view.scale;
//     const oneMonth = 31 * 24 * 60 * 60 * 1000;
//     const oneDay = 24 * 60 * 60 * 1000;
//     const twoMonth = oneMonth * 2;
//     const fourMonth = twoMonth * 2;
//     const oneYear = 365 * oneDay;
//     const minDistance = 200;
//     context.font = (20 / view.scale).toString() + "px Arial";
//     context.fillStyle = "blue";
//     const minimumInterval = timeForOnePixel * minDistance / view.scale;
//     if(minimumInterval > oneYear ) {
//       plotTimes(timeOnLeftEdge, minimumInterval / oneYear, 'year', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
//     }
//     else if(minimumInterval > fourMonth ) {
//       plotTimes(timeOnLeftEdge, 4, 'month', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
//     }
//     else if(minimumInterval > twoMonth) {
//       plotTimes(timeOnLeftEdge, 2, 'month', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
//     }
//     else if(minimumInterval > oneMonth) {
//       plotTimes(timeOnLeftEdge, 1, 'month', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
//     } else if(minimumInterval > oneDay * 16) {
//       plotTimes(timeOnLeftEdge, 16, 'day', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
//     } else if(minimumInterval > oneDay * 8) {
//       plotTimes(timeOnLeftEdge, 8, 'day', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
//     } else if(minimumInterval > oneDay * 4) {
//       plotTimes(timeOnLeftEdge, 4, 'day', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
//     } else if(minimumInterval > oneDay * 2) {
//       plotTimes(timeOnLeftEdge, 2, 'day', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
//     } else {
//       plotTimes(timeOnLeftEdge, 1, 'day', timeForOnePixel, offsetX, offsetY, rightMost, context, view.scale);
//     }
//   }
// });

// this.network.on("doubleClick", (e) => {
//   clearTimeout(this.doubleClickTimer);
//   this.doubleClickTimer = null;
//   if(e.nodes.length > 0 && !blitzboard.network.isCluster(e.nodes[0])) {
//     if(this.config.node.onDoubleClick) {
//       this.config.node.onDoubleClick(this.getNode(e.nodes[0]));
//     }
//   } else if(e.edges.length > 0) {
//     if(this.config.edge.onDoubleClick) {
//       this.config.edge.onDoubleClick(this.getEdge(e.edges[0]));
//     }
//   } else {
//     this.fit();
//   }
// });


function updateNodeLocationOnTimeLine() {
  let nodePositions = [];
  this.graph.nodes.forEach(node => {
    let x, y, fixed, width;
    ({x, y, fixed, width} = this.calcNodePosition(node));
    nodePositions.push({
      id: node.id,
      x, y
    });
  });
}


module.exports = {
  updateLayers,
  updateThumbnailLayer,
  refreshIconLayer,
  iconRegisterer,
  updateNodeLocationOnTimeLine,
  svgToURL(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  },


  toClusterNode(pgNodeIds, props, extraOptions = null) {
    let nodes = pgNodeIds.map(id => this.nodeMap[id]);
    let color = Blitzboard.SCCColor;

    let rgb = getHexColors(color);
    let precomputePosition = this.hierarchicalPositionMap != null ? this.hierarchicalPositionMap[nodes[0].id] : undefined;
    let x = 0, y = 0, z = 0;
    if(precomputePosition) {
      x = precomputePosition.x;
      y = precomputePosition.y;
    }

    return {
      objectType: 'node',
      id: nodes[0].id,
      color: rgb,
      label: nodes.map(node => createLabelText(node, props)).join("\n"),
      shape: 'dot',
      _size: nodes[0].size,
      _title: nodes.map(node => createTitle(node)).join("\n"),
      borderWidth: 1,
      x: x,
      y: y,
      z: z,
    };
  },

  toVisNode(pgNode, extraOptions = null) {
    const group = [...pgNode.labels].sort().join('_');
    if(!this.nodeColorMap[group]) {
      this.nodeColorMap[group] = getRandomColor(group, this.config.node.saturation, this.config.node.brightness);
    }
    let props = this.config.node.caption;

    let x, y, z, fixed, width;

    fixed = true;
    try {
      ({x, y, z = 0} = this.nodeLayout[pgNode.id]);
    } catch {
      this.nodeLayout[pgNode.id] = {x: 0, y: 0, z: 0};
      ({x, y, z = 0} = this.nodeLayout[pgNode.id]);
    }
    width = null;


    let url = retrieveHttpUrl(pgNode);
    let thumbnailUrl = this.retrieveThumbnailUrl(pgNode);

    let color = this.retrieveConfigProp(pgNode, 'node', 'color');
    let opacity = parseFloat(this.retrieveConfigProp(pgNode, 'node', 'opacity'));
    let size = parseFloat(this.retrieveConfigProp(pgNode, 'node', 'size'));
    let tooltip = this.retrieveConfigProp(pgNode, 'node', 'title');
    let clusterId = null;

    color = color || this.nodeColorMap[group];
    //
    // if(this.sccMap[pgNode.id]) {
    //   color = Blitzboard.SCCColor;
    //   clusterId = this.sccMap[pgNode.id];
    // }

    let rgb = getHexColors(color);
    let precomputePosition = this.hierarchicalPositionMap != null ? this.hierarchicalPositionMap[pgNode.id] : undefined;
    if(precomputePosition) {
      x = precomputePosition.x;
      y = precomputePosition.y;
    }

    let attrs = {
      objectType: 'node',
      id: pgNode.id,
      color: rgb,
      opacity,
      label: createLabelText(pgNode, props),
      shape: 'dot',
      _size: size || defaultNodeSize,
      _title: tooltip != null ? tooltip : createTitle(pgNode),
      fixed: {
        x: precomputePosition ? true : fixed,
        y: this.config.layout === 'timeline' ? false : (precomputePosition ? true : fixed),
      },

      borderWidth: url ? 3 : 1,
      url: url,
      x: x,
      y: y,
      z: z,
      chosen: this.retrieveConfigProp(pgNode, 'node', 'chosen'),
      font: {
        color: url ? 'blue' : 'black',
        strokeWidth: 2,
      },
      clusterId,
      fixedByTime: fixed
    };

    if(this.config.layout !== 'map') {
      attrs.size = attrs._size;
    }

    let otherProps = this.retrieveConfigPropAll(pgNode,
      'node', ['color', 'size', 'opacity', 'title']);

    for(let key of Object.keys(otherProps)) {
      attrs[key] = otherProps[key] || attrs[key];
    }

    function registerIcon(icons, label) {
      let lowerLabel = label.toLowerCase();
      if(!Blitzboard.loadedIcons[lowerLabel]) {
        Blitzboard.loadedIcons[lowerLabel] = 'retrieving'; // Avoid duplication of loading
        setTimeout(() =>
          Iconify.loadIcons(icons, iconRegisterer(lowerLabel)), 1000);
      }
      attrs['iconLabel'] = lowerLabel;
    }

    for(let label of pgNode.labels) {
      let icon;
      if(icon = this.config.node.icon?.[label]) {
        registerIcon([icon], label);
        break;
      }
    }

    if(!attrs['iconLabel'] && this.config.node.icon?.['_default']) {
      registerIcon(this.config.node.icon['_default'], pgNode.labels.length > 0 ? pgNode.labels[0] : '_default');
    }

    if(!attrs['iconLabel'] && (this.config.node.defaultIcon || this.config.node.autoIcon) && pgNode.labels.length > 0) {
      let lowerLabel = pgNode.labels[0].toLowerCase();
      registerIcon(Blitzboard.iconPrefixes.map((prefix) => prefix + lowerLabel), lowerLabel);
    }

    if(thumbnailUrl) {
      attrs.imageURL = thumbnailUrl;
    }
    attrs = Object.assign(attrs, extraOptions);
    return attrs;
  },

  retrieveProp(pgElem, config, loadFunction = true) {
    if((typeof config) === 'function' && loadFunction) {
      return config(new Proxy(pgElem, Blitzboard.blitzProxy));
    } else if((typeof config) === 'string' && config.startsWith('@')) {
      return pgElem.properties[config.substr(1)]?.[0];
    }
    return config; // return as constant
  },

  retrieveConfigProp(pgElem, type, propName, loadFunction = true) {
    const labels = pgElem.labels.join('_');
    let propConfig = this.config?.[type][propName];
    if((typeof propConfig) === 'object') {
      return this.retrieveProp(pgElem, propConfig[labels], loadFunction)
    }
    return this.retrieveProp(pgElem, propConfig, loadFunction);
  },

  retrieveConfigPropAll(pgElem, type, except) {
    let keys = Object.keys(this.config?.[type]);
    let props = {};
    for(let key of keys) {
      if(except.includes(key))
        continue;
      // TODO: How can we allow functions for arbitrary config?
      props[key] = this.retrieveConfigProp(pgElem, type, key, false);
    }
    return props;
  },

  toVisEdge(pgEdge, id) {
    let props = this.config.edge.caption;
    const edgeLabel = pgEdge.labels.join('_');
    if(!this.edgeColorMap[edgeLabel]) {
      this.edgeColorMap[edgeLabel] = getRandomColor(edgeLabel, this.config.edge.saturation || '0%', this.config.edge.brightness || '30%');
    }
    let color = this.retrieveConfigProp(pgEdge, 'edge', 'color');
    let opacity = parseFloat(this.retrieveConfigProp(pgEdge, 'edge', 'opacity')) || 1;
    let width = parseFloat(this.retrieveConfigProp(pgEdge, 'edge', 'width'));
    let tooltip = this.retrieveConfigProp(pgEdge, 'edge', 'title');

    color = color || this.edgeColorMap[edgeLabel];

    let rgb = getHexColors(color);
    let smooth = this.config.layout === 'map' || this.config.layout === 'hierarchical-scc' ? false : {roundness: 1};

    let dashes = false;
    // if(this.sccMap[pgEdge.from] && this.sccMap[pgEdge.from] === this.sccMap[pgEdge.to]) {
    //   smooth = {roundness: 0.5};
    //   dashes = true;
    // }
    let attrs = {
      objectType: 'edge',
      id: id,
      from: pgEdge.from,
      to: pgEdge.to,
      color: rgb,
      label: createLabelText(pgEdge, props),
      _title: tooltip != null ? tooltip : createTitle(pgEdge),
      remoteId: id,
      width: width || defaultWidth,
      hoverWidth: 0.5,
      dashes,
      smooth: smooth,
      chosen: this.retrieveConfigProp(pgEdge, 'edge', 'chosen'),
      arrows: {
        to: {
          enabled: pgEdge.direction == '->' || pgEdge.undirected === 'false' || pgEdge.undirected === false
        },
      }
    };

    let otherProps = this.retrieveConfigPropAll(pgEdge,
      'edge', ['color', 'opacity', 'width', 'title']);

    for(let key of Object.keys(otherProps)) {
      attrs[key] = otherProps[key] || attrs[key];
    }

    return attrs;
  },
  createIconLayer(nodeData, scale, sizeUnits, coordinateSystem) {
    return new DeckGLLayers.IconLayer({
      id: 'icon-layer',
      data: nodeData,
      pickable: false,
      coordinateSystem,
      billboard: this.config.layout !== 'map',
      getIcon: (n) => {
        if(n.iconLabel && Blitzboard.loadedIcons[n.iconLabel]) {
          return {
            url: Blitzboard.loadedIcons[n.iconLabel],
            width: 240,
            height: 240
          }
        }
        return {
          url: 'data:image/svg+xml;charset=utf-8,dummy', // dummy icon to avoid exception
          width: 24,
          height: 24
        }
      },
      sizeScale: scale,
      getPosition: (n) => [n.x, n.y, n.z + (this.config.layout === 'map' ? 20 : 0)],
      getSize: n => n._size / defaultNodeSize * 6 * (this.config.layout === 'map' ? 100 : 1),
      sizeUnits: sizeUnits,
      getColor: n => ([255, 0, 0]),
      sizeMinPixels: Blitzboard.minNodeSizeInPixels,
      updateTriggers: {
        getIcon: [Blitzboard.loadedIcons],
      }
    });
  },
  createInitialViewState() {
    if(this.config.layout === 'map') {
      return {
        latitude: (this.minY + this.maxY) / 2,
        longitude: (this.minX + this.maxX) / 2,
        pitch: Blitzboard.pitch,
        zoom: 3
      };
    } else {
      let rate = 0.9 * Math.min(this.container.clientWidth / (this.maxX - this.minX), this.container.clientHeight / (this.maxY - this.minY));

      return {
        target: [(this.minX + this.maxX) / 2, (this.minY + this.maxY) / 2],
        zoom: Math.log(rate) / Math.log(2)
      };
    }
  },

  updateViews() {
    if(this.config.layout === 'map') {
      this.viewState = this.createInitialViewState();
      this.network.setProps({
        initialViewState: this.viewState,
        views: [new DeckGL.MapView()],
      });
    } else {
      if(this.config.style) {
        document.getElementById('deckgl-overlay').style = this.networkOriginalStyle + ' ' + this.config.style;
      }

      const view = this.config.dimensions === 2 ? new DeckGL.OrthographicView({}) : new DeckGL.OrbitView({});

      this.viewState = this.createInitialViewState();
      this.network.setProps({
        initialViewState: this.viewState,
        views: [view],
      });
    }
  },

  retrieveThumbnailUrl(node) {
    if(this.config.node.thumbnail) {
      return node.properties[this.config.node.thumbnail]?.[0];
    }
    return null;
  }

}