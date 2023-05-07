const DeckGL = require("@deck.gl/core");
const DeckGLLayers = require("@deck.gl/layers");
const DeckGLGeoLayers = require("@deck.gl/geo-layers");
const {getRandomColor, getHexColors, createLabelText, createTitle, retrieveHttpUrl, getColorFromText} = require("./util");

const defaultNodeSize = 5;
const defaultEdgeWidth = 1;
const highlightedNodeRadiusRate = 1.2;

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

let currentTime = 0;

module.exports = {

  startEdgeAnimation() {
    if(this.animationTimerId)
      return;
    this.animationTimerId = setInterval(() => {
      if(this.highlightedTripsLayer.props.data.length === 0) {
        clearInterval(this.animationTimerId);
        this.animationTimerId = null;
      }
      currentTime = (currentTime + 2) % 110;
      this.highlightedTripsLayer = this.highlightedTripsLayer.clone({
        currentTime
      });
      this.determineLayersToShow();
    }, 20);
  },

  updateLayers() {
    const coordinateSystem = this.config.layout === 'map' ? DeckGL.COORDINATE_SYSTEM.LNGLAT : DeckGL.COORDINATE_SYSTEM.CARTESIAN;
    const sizeUnits = this.config.layout === 'map' ? 'meters' : 'common';

    const scale = 0.2;

    let blitzboard = this;

    let tmpNodeData = this.nodeDataSet;

    tmpNodeData = Object.values(tmpNodeData);

    this.allEdgesToDraw = JSON.parse(JSON.stringify(this.edgeDataSet))

    let tmpEdgeData = this.config.edge.visibilityMode === 'onFocus' ? [] : this.allEdgesToDraw;


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
      getRadius: (n) =>  {
        let radius = n._size * (this.config.layout === 'map' ? 100 : 1); // TODO: avoid magic number
        return radius;
      },
      radiusMinPixels: Blitzboard.minNodeSizeInPixels,
      radiusScale: scale,
      getFillColor: (n) => n.color,
      onHover: info => this.onNodeHover(info),
      radiusUnits: sizeUnits,
    });


    function edgeColor(e) {
      let color = [...e.color];
      if(blitzboard.hoveredNodes.has(e.from) || blitzboard.selectedNodes.has(e.from)) {
        color = blitzboard.nodeDataSet[e.from].color;
      }
      if(blitzboard.hoveredNodes.has(e.to) || blitzboard.selectedNodes.has(e.to)) {
        color = blitzboard.nodeDataSet[e.to].color;
      }
      return [color[0], color[1], color[2], 0XFF];
    }


    this.edgeLayer = new DeckGLLayers.LineLayer({
      id: "line-layer",
      pickable: true,
      coordinateSystem,
      billboard: this.config.layout !== 'map',
      data: tmpEdgeData,
      getWidth: edge => {
        if(this.hoveredNodes.has(edge.from) || this.selectedNodes.has(edge.from) || this.hoveredNodes.has(edge.to) || this.selectedNodes.has(edge.to)) {
          return parseFloat(edge.width) * 2;
        }
        return edge.width;
      },
      getSourcePosition: (edge) => {
        let {x, y, z} = this.nodeDataSet[edge.from];
        return [x, y, z];
      },
      getTargetPosition: (edge) => {
        let {x, y, z} = this.nodeDataSet[edge.to];
        return [x, y, z];
      },
      getColor: edgeColor,
      updateTriggers: {
        getColor: [Array.from(new Set([...this.hoveredNodes, ...this.selectedNodes])), this.selectedEdges, this.hoveredEdges],
      },
      onHover: info => this.onEdgeHover(info),
      widthUnits: ('common'),
      widthScale: 0.2 * (this.config.layout === 'map' ? 0.01 : 1),
      widthMinPixels: 1,
    });

    this.tripsLayer = new DeckGLGeoLayers.TripsLayer({
      id: "trips-layer",
      pickable: true,
      coordinateSystem,
      data: tmpEdgeData,
      getWidth: edge => edge.width,
      getPath: edge => {
        let {x: fromX, y: fromY} = this.nodeDataSet[edge.from];
        let {x: toX, y: toY} = this.nodeDataSet[edge.to];
        let path = [];
        for(let i = 0; i < 10; ++i) {
          let x = fromX + (toX - fromX) * i / 9;
          let y = fromY + (toY - fromY) * i / 9;
          path.push([x, y]);
        }
        return path;
      },
      getTimestamps: edge => {
        let timestamps = [];
        for(let i = 0; i < 10; ++i) {
          timestamps.push(i * 10);
        }
        return timestamps;
      },
      rounded: true,
      fadeTrail: true,
      trailLength: 100,
      currentTime: 100,
      widthMinPixels: 4,
      // getColor: (e) => {
      //   if(this.shouldHighlight(e)) {
      //     return [e.color, e.color, 0, 255];
      //   }
      //   let color = [...e.color];
      //   for(let i = 0; i < 3; ++i)
      //     color[i] = (128 * 3 + color[i]) / 4;
      //   color[3] = 192;
      //   color[2] = 0;
      //   return color;
      // },
      getColor: [32, 64, 255, 192],
      updateTriggers: {
        getColor: [Array.from(new Set([...this.hoveredNodes, ...this.selectedNodes])), this.selectedEdges, this.hoveredEdges],
      },
      onHover: info => this.onEdgeHover(info),
      widthUnits: ('common'),
      widthScale: 0.02 * (this.config.layout === 'map' ? 0.01 : 1),
    });

    this.highlightedTripsLayer = this.tripsLayer.clone({
      id: 'highlighted-trips-layer',
      data: []
    });

    this.edgeArrowLayer = new DeckGLLayers.IconLayer({
      id: 'edge-arrow-layer',
      data: tmpEdgeData.filter(e => !e.undirected || e.direction === '->'),
      coordinateSystem,
      getIcon: n => ({
        url: this.svgToURL('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" preserveAspectRatio="xMidYMid meet" viewBox="0 0 15 15"><path fill="currentColor" d="M7.932 1.248a.5.5 0 0 0-.864 0l-7 12A.5.5 0 0 0 .5 14h14a.5.5 0 0 0 .432-.752l-7-12Z"/></svg>'),
        width: 240,
        height: 240,
        mask: true
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
      getSize: edge => {
        let size = 5 * (this.config.layout === 'map' ? 100 : 1);
        if(this.hoveredNodes.has(edge.from) || this.selectedNodes.has(edge.from) || this.hoveredNodes.has(edge.to) || this.selectedNodes.has(edge.to)) {
          size *= 2;
        }
        return size;
      },
      sizeUnits: sizeUnits,
      sizeMinPixels: Blitzboard.minNodeSizeInPixels,
      getColor: edgeColor
    });

    this.iconLayer = this.createIconLayer(tmpNodeData, scale, sizeUnits, coordinateSystem);

    this.updateThumbnailLayer();
    this.updateTextLayers();

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

    }
    this.determineLayersToShow();
  },

  updateThumbnailLayer() {
    this.thumbnailLayers = this.nodeData.filter(n => n.imageURL).map((n) => {
      let bounds =  [ n.x + n._size / defaultNodeSize, n.y + n._size / defaultNodeSize,
        n.x - n._size / defaultNodeSize,
        n.y - n._size / defaultNodeSize];
      return new DeckGLLayers.BitmapLayer({
        id: 'bitmap-layer-' + n.id,
        bounds,
        image: n.imageURL
      });
    });
  },

  refreshIconLayer() {
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
  },

  iconRegisterer(name) {
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
          height: size,
          color: "rgba(255, 255, 255, 0.8)"
        });
        let img = new Image();
        img.src = blitzboard.svgToURL(svg.outerHTML);
        Blitzboard.loadedIcons[name] = img.src;
        blitzboard.refreshIconLayer();
      }
    };
  },

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
  },

  svgToURL(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  },

  shouldHighlight(elem) {
    if(elem.from) {
      // For edge
      if(this.config.edge.canFocus && this.hoveredEdges.has(elem.id))
        return true
      return this.hoveredNodes.has(elem.from) || this.hoveredNodes.has(elem.to) || this.selectedNodes.has(elem.from) || this.selectedNodes.has(elem.to)
    } else {
      return this.hoveredNodes.has(elem.id) || this.selectedNodes.has(elem.id);
    }
  },

  updateTextLayers() {
    const coordinateSystem = this.config.layout === 'map' ? DeckGL.COORDINATE_SYSTEM.LNGLAT : DeckGL.COORDINATE_SYSTEM.CARTESIAN;
    const sizeUnits = this.config.layout === 'map' ? 'meters' : 'common';

    const scale = 0.2;

    let highlightedNodes = new Set([...this.hoveredNodes, ...this.selectedNodes]);

    let tmpNodeData = this.nodeDataSet;

    tmpNodeData = Object.values(tmpNodeData);

    tmpEdgeData = JSON.parse(JSON.stringify(this.edgeDataSet))

    const fontSize = 3;

    let characterSet = new Set();
    tmpNodeData.forEach(n => {
      n.label.split('').forEach(c => characterSet.add(c));
    });

    let textLayerAttributes = {
      id: 'node-text-layer',
      pickable: true,
      getPosition: (node) => {
        return [node.x,
          node.y + (this.config.layout === 'map' ? -0.001 * node._size / defaultNodeSize : node._size * scale) * highlightedNodeRadiusRate,
          node.z];
      },
      getText: node => node.label,
      getSize: (n) => n._size / defaultNodeSize * fontSize * (this.config.layout === 'map' ? 100 : 1),
      sizeMaxPixels: 30,
      sizeMinPixels: 5,
      billboard: this.config.layout !== 'map',
      getAngle: 0,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'top',
      coordinateSystem,
      sizeUnits: sizeUnits,
      sizeScale: scale,
      visible: this.viewState?.zoom > this.config.zoomLevelForText,
      outlineWidth: 1,
      lineHeight: 1.2,
      outlineColor: [255, 255, 255, 255],
      // fontSettings: {
      //   sdf: true,
      // },
      onHover: info => this.onNodeHover(info),
      characterSet: characterSet
    };

    textLayerAttributes.data = tmpNodeData;

    this.nodeTextLayer = new DeckGLLayers.TextLayer(textLayerAttributes);

    textLayerAttributes = {...textLayerAttributes};
    textLayerAttributes.data = Array.from(highlightedNodes).map(id => this.nodeDataSet[id]).filter(n => n);
    textLayerAttributes.fontWeight = 900; // bolder than bold
    textLayerAttributes.id = 'hilighted-node-text-layer';
    this.highlightedNodeTextLayer = new DeckGLLayers.TextLayer(textLayerAttributes);

    function edgeTextColor(e) {
      let color = [...e.color];
      if(blitzboard.hoveredNodes.has(e.from) || blitzboard.selectedNodes.has(e.from)) {
        color = blitzboard.nodeDataSet[e.from].color;
      }
      else if(blitzboard.hoveredNodes.has(e.to) || blitzboard.selectedNodes.has(e.to)) {
        color = blitzboard.nodeDataSet[e.to].color;
      } else {
        color = [color[0] - 20, color[1] - 20, color[2] - 20];
      }

      return [color[0], color[1], color[2], 0XFF];
    }

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
      getSize: fontSize * (this.config.layout === 'map' ? 100 : 1),
      sizeMaxPixels: 30,
      sizeMinPixels: 12,
      sizeScale: scale,
      getColor: edgeTextColor,
      billboard: this.config.layout !== 'map',
      getAngle: 0,
      getTextAnchor: 'middle',
      lineHeight: 1.2,
      getAlignmentBaseline: 'top',
      coordinateSystem,
      sizeUnits: sizeUnits,
      outlineWidth: 1,
      outlineColor: [255, 255, 255, 255],
      onHover: info => this.onEdgeHover(info),
      characterSet: 'auto'
    });
  },

  toClusterNode(pgNodeIds, props, extraOptions = null) {
    let nodes = pgNodeIds.map(id => this.nodeMap[id]);
    let color = Blitzboard.SCCColor;

    let rgb = getHexColors(color);

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
      this.nodeColorMap[group] = getColorFromText(group);
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

    color = color || this.nodeColorMap[group];

    if(pgNode.clusterId) {
      color = getColorFromText('yellow');
    }

    let rgb = getHexColors(color);

    let attrs = {
      objectType: 'node',
      id: pgNode.id,
      _size: size || defaultNodeSize,
      color: rgb,
      opacity,
      label: createLabelText(pgNode, props),
      shape: 'dot',
      _title: tooltip != null ? tooltip : createTitle(pgNode),

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
      fixedByTime: fixed
    };

    if(this.config.layout !== 'map') {
      attrs.size = attrs._size;
    }

    let otherProps = this.retrieveConfigPropAll(pgNode,
      'node', ['color', 'size', 'opacity', 'title', 'thumbnail']);

    for(let key of Object.keys(otherProps)) {
      attrs[key] = otherProps[key] || attrs[key];
    }

    let blitzboard = this;

    function registerIcon(icons, label) {
      let lowerLabel = label.toLowerCase();
      if(!Blitzboard.loadedIcons[lowerLabel]) {
        Blitzboard.loadedIcons[lowerLabel] = 'retrieving'; // Avoid duplication of loading
        setTimeout(() =>
          Iconify.loadIcons(icons, blitzboard.iconRegisterer(lowerLabel)), 1000);
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
      return config(new Proxy(pgElem, this.blitzProxy));
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
    let color = this.retrieveConfigProp(pgEdge, 'edge', 'color');
    let opacity = parseFloat(this.retrieveConfigProp(pgEdge, 'edge', 'opacity')) || 1;
    let width = parseFloat(this.retrieveConfigProp(pgEdge, 'edge', 'width'));
    let tooltip = this.retrieveConfigProp(pgEdge, 'edge', 'title');


    let rgb = color ? getHexColors(color) : [0xCC, 0xCC, 0xCC];
    let smooth = this.config.layout === 'map' || this.config.layout === 'hierarchical-scc' ? false : {roundness: 1};

    let dashes = false;
    let attrs = {
      objectType: 'edge',
      id: id,
      from: pgEdge.from,
      to: pgEdge.to,
      color: rgb,
      label: createLabelText(pgEdge, props),
      _title: tooltip != null ? tooltip : createTitle(pgEdge),
      remoteId: id,
      width: width || defaultEdgeWidth,
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
            height: 240,
            mask: true
          }
        }
        return {
          url: 'data:image/svg+xml;charset=utf-8,dummy', // dummy icon to avoid exception
          width: 24,
          height: 24,
          mask: true
        }
      },
      sizeScale: scale,
      getPosition: (n) => [n.x, n.y, n.z + (this.config.layout === 'map' ? 20 : 0)],
      getSize: n => n._size / defaultNodeSize * 6 * (this.config.layout === 'map' ? 100 : 1),
      sizeUnits: sizeUnits,
      getColor: [255, 255, 255, 232],
      sizeMinPixels: Blitzboard.minNodeSizeInPixels * 1.2,
      // updateTriggers: {
      //   getIcon: [Blitzboard.loadedIcons],
      // }
    });
  },

  createInitialViewState() {
    if(this.config.layout === 'map') {
      return {
        latitude: (this.minY + this.maxY) / 2,
        longitude: (this.minX + this.maxX) / 2,
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

  onViewStateChange(viewState) {
    this.viewState = viewState;
    let textVisibility = this.viewState?.zoom > (this.config.layout === 'map' ? 12.0 : this.config.zoomLevelForText); // TODO: make this configurable
    this.nodeTextLayer = this.nodeTextLayer.clone({
      visible: textVisibility,
    });
    this.edgeTextLayer = this.edgeTextLayer.clone({
      visible: textVisibility,
    });
    this.determineLayersToShow();
  },

  updateHighlightState() {
    let nodesToHighlight = Array.from(this.hoveredNodes).concat(Array.from(this.selectedNodes));
    this.nodeLayer = this.nodeLayer.clone({
      updateTriggers: {
        getRadius: nodesToHighlight,
        getFillColor: nodesToHighlight
      },
    });

    let edgesToHighlight = new Set(Array.from(this.hoveredEdges).concat(Array.from(this.selectedEdges)));

    for(let nodeId of nodesToHighlight) {
      let edges = this.nodesToEdges[nodeId] || [];
      for(let edge of edges) {
        edgesToHighlight.add(edge.id);
      }
    }
    edgesToHighlight = Array.from(edgesToHighlight).map(id => this.edgeMap[id]);
    if(this.config.edge.visibilityMode !== 'always') {
      let edgesToDraw;
      if(edgesToHighlight.length === 0 &&  this.config.edge.visibilityMode === 'noOtherFocused') {
        edgesToDraw = this.allEdgesToDraw;
      } else {
        edgesToDraw = edgesToHighlight;
      }
      this.edgeLayer = this.edgeLayer.clone({
        data: edgesToDraw
      });
      this.edgeArrowLayer = this.edgeArrowLayer.clone({
        data: edgesToDraw
      });
      this.edgeTextLayer = this.edgeTextLayer.clone({
        data: edgesToDraw
      });
    } else {
      let triggers = Array.from(this.hoveredNodes).concat(Array.from(this.hoveredEdges)).concat(Array.from(this.selectedNodes)).concat(Array.from(this.selectedEdges));
      this.edgeLayer = this.edgeLayer.clone({
        updateTriggers: {
          getColor: triggers,
          getWidth: triggers,
        }
      });
      this.edgeArrowLayer = this.edgeArrowLayer.clone({
        updateTriggers: {
          getColor: triggers,
          getSize: triggers,
        }
      });
      this.edgeTextLayer = this.edgeTextLayer.clone({
        updateTriggers: {
          getColor: triggers,
        }
      });
    }
    this.highlightedTripsLayer = this.highlightedTripsLayer.clone({
      data: edgesToHighlight.filter(edge => edge && edge.direction !== '--')
    });
    if(edgesToHighlight.length > 0)
      this.startEdgeAnimation();

    this.determineLayersToShow();
  },

  determineLayersToShow() {
    if(this.config.layout === 'map') {
      this.layers = [
        this.tileLayer,
        // this.edgeLayer,
        this.tripsLayer,
        this.highlightedTripsLayer,
        this.edgeTextLayer,
        this.nodeTextLayer,
        this.nodeLayer,
        // this.edgeArrowLayer,
        this.highlightedNodeTextLayer,
        this.iconLayer,
        ...this.thumbnailLayers
      ];
    } else {
      this.layers = [
        this.edgeLayer,
        this.edgeTextLayer,
        // this.tripsLayer,
        // this.highlightedTripsLayer,
        this.nodeTextLayer,
        this.edgeArrowLayer,
        this.nodeLayer,
        this.highlightedNodeTextLayer,
        this.iconLayer,
        ...this.thumbnailLayers
      ];
    }
    this.network.setProps({
      layers: this.layers
    });
  },


  updateViews() {
    if(this.config.layout === 'map') {
      this.viewState = this.createInitialViewState();
      let view = new DeckGL.MapView({});
      this.network.setProps({
        initialViewState: this.viewState,
      });

      setTimeout(() => {
        this.network.setProps({
          views: [view],
        });

        this.onViewStateChange(this.viewState);
      }, 200); // TODO: This is a hack to make sure the map is rendered correctly
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
      this.onViewStateChange(this.viewState);
    }
  },

  retrieveThumbnailUrl(node) {
    if(this.config.node.thumbnail) {
      return node.properties[this.config.node.thumbnail]?.[0];
    }
    return null;
  }
}