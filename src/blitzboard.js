require("leaflet/dist/leaflet.css");
require('@iconify/iconify');
require('leaflet');
require('./pg_parser_browserified.js');
let visData = require('vis-data');
let visNetwork = require('vis-network');
const createGraph = require("ngraph.graph");
const createLayout = require("ngraph.forcelayout");

const defaultWidth = 2;

module.exports = class Blitzboard {
  static fontLoaded = false;
  static defaultConfig = {
    doubleClickWait: 200,
    node: {
      caption: ['id'],
      defaultIcon: true,
      thumbnail: 'thumbnail',
      saturation: '100%',
      brightness: '37%',
      limit: 4000
    },
    edge: {
      caption: ['label'],
      saturation: '0%',
      brightness: '62%',
      limit: 50000,
      width: defaultWidth
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
    style: "border: solid 1px silver; background: radial-gradient(white, silver);",
    extraOptions: {
    }
  };
  static tooltipMaxWidth = 600;
  static iconPrefixes = ['fa-solid:', 'ion:', 'bx:bx-', 'gridicons:', 'akar-icons:'];
  static iconSizeCoef = 1.5;
  static minScaleOnMap = 0.3;
  static maxScaleOnMap = 1.0;
  static mapContainerId = 'map';
  static edgeDelimiter = '-';
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
  
  static renderedColors = {};
  
  constructor(container) {
    this.container = container;
    this.nodeColorMap = {};
    this.expandedNodes = [];
    this.nodeMap = {};
    this.config = Blitzboard.defaultConfig;
    this.nodeLineMap = {};
    this.edgeMap = {};
    this.edgeLineMap = {};
    this.prevZoomPosition = null;
    this.warnings = [];
    this.elementWithTooltip = null;
    this.addedNodes = new Set();
    this.addedEdges = new Set();
    this.deletedNodes = new Set();
    this.deletedEdges = new Set();
    
    this.staticLayoutMode = false;
    
    this.staticLayoutMode = false;
    
    this.container.style.position = 'absolute';
    
    this.networkContainer = document.createElement('div');
    this.networkContainer.style = this.networkContainerOriginalStyle = `
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
    this.tooltipDummy = document.createElement('div');
    this.tooltipDummy.style.position = 'absolute';
    this.tooltipDummy.classList.add('blitzboard-tooltip');
    this.tooltipDummy.style['background-color'] = 'rgba(0, 0, 0, 0)';
    this.tooltipDummy.style['z-index'] = '998';

    this.tooltip = document.createElement('span');
    this.tooltip.style.display = 'none';
    this.tooltip.classList.add('blitzboard-tooltiptext');
    this.tooltip.classList.add('blitzboard-tooltiptext-top');
    this.tooltip.style['z-index'] = '999';


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
    this.onUpdated = [];
    this.beforeParse = [];
    this.onParseError = [];
    this.maxLine = 0;
    this.nodeLayout = null;
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
    document.body.appendChild(this.tooltipDummy);
    this.tooltipDummy.appendChild(this.tooltip);
    this.tooltip.addEventListener('mouseleave', (e) => {
      if(e.relatedTarget !== blitzboard.network.canvas.getContext().canvas)
        blitzboard.hideTooltip();
    });

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
      blitzboard.dragging = false;
    }, true);

    this.container.addEventListener('mouseup', (e) => {
      blitzboard.dragging = false;
    }, true);
    
    this.container.addEventListener('mousemove', (e) => {
      if(blitzboard.dragging && blitzboard.config.layout === 'map' && blitzboard.prevMouseEvent) {
        blitzboard.map.panBy([blitzboard.prevMouseEvent.x - e.x, blitzboard.prevMouseEvent.y - e.y], {animate: false});
      }
      if(blitzboard.elementWithTooltip?.edge) {
        this.updateTooltipLocation();
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
    
    this.applyDynamicStyle(`
      .blitzboard-tooltip {
        position: absolute;
        display: inline-block;
        border-bottom: 1px dotted black;
      }
      
      .blitzboard-tooltip .blitzboard-tooltiptext {
        max-width: ${Blitzboard.tooltipMaxWidth}px;
        min-width: 200px;
        background: rgba(0, 0, 0, 0.7);
        color: #fff;
        text-align: center;
        border-radius: 6px;
        padding: 5px;
        position: absolute;
        z-index: 1;
        opacity: 1;
        transition: opacity 0.3s;
      }
      
      .blitzboard-tooltip .blitzboard-tooltiptext-top {
        bottom: 125%;
        left: 50%;
        margin-left: -6px;
      }
      
      .blitzboard-tooltip .blitzboard-tooltiptext-bottom {
        bottom: 100%;
        left: 50%;
        margin-left: -6px;
      }
      
      
      .blitzboard-tooltip .blitzboard-tooltiptext-left {
        top: 50%;
        left: 0%;
      }
      
      .blitzboard-tooltip .blitzboard-tooltiptext-right {
        top: -50%;
        left: 100%;
      }
      
      
      .blitzboard-tooltip .blitzboard-tooltiptext::after {
        content: "";
        position: absolute;
        border-width: 6px;
        border-style: solid;
      }
      
      .blitzboard-tooltip .blitzboard-tooltiptext-bottom::after {
        top: -12px;
        left: 50%;
        border-color: transparent transparent #555 transparent;
      }
      
      .blitzboard-tooltip .blitzboard-tooltiptext-left::after {
        top: 50%;
        left: 100%;
        border-color: transparent transparent transparent #555;
      }
      
      .blitzboard-tooltip .blitzboard-tooltiptext-top::after {
        top: 100%;
        left: 50%;
        border-color: #555 transparent transparent transparent;
      }

      .blitzboard-tooltip .blitzboard-tooltiptext-right::after {
        top: 50%;
        left: -12px;
        border-color: transparent #555 transparent transparent;
      }
      
      .blitzboard-tooltiptext th, .blitzboard-tooltiptext td {
        text-align: left;
        padding-left: 10px;
      }
      
      .blitzboard-tooltip a {
        color: #88BBFF;
      }
    `);
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
  }

  applyDynamicStyle(css) {
    var styleTag = document.createElement('style');
    var dynamicStyleCss = document.createTextNode(css);
    styleTag.appendChild(dynamicStyleCss);
    var header = document.getElementsByTagName('head')[0];
    header.appendChild(styleTag);
  };

  getHexColors(colorStr) {
    let computed = Blitzboard.renderedColors[colorStr];
    if(computed) {
      return computed;
    }
    let a = document.createElement('div');
    a.style.color = colorStr;
    let colors = window.getComputedStyle( document.body.appendChild(a) ).color.match(/\d+/g).map(function(a){ return parseInt(a,10); });
    document.body.removeChild(a);
    Blitzboard.renderedColors[colorStr] = colors;
    return colors;
  }
  
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
  
  tooltipPosition() {
    if(window.innerWidth < window.innerHeight) {
      return this.prevMouseEvent.clientY < window.innerHeight / 2 ? 'bottom' : 'top';
    }
    return this.prevMouseEvent.clientX < window.innerWidth / 2 ? 'right' : 'left';
  }
  
  updateTooltipLocation() {
    if(!this.elementWithTooltip)
      return;
    let position, offset = 10;
    if(this.elementWithTooltip.node) {
      position = this.network.canvasToDOM(this.network.getPosition(this.elementWithTooltip.node.id));
      let clientRect = this.container.getClientRects()[0];
      position.x += clientRect.x;
      position.y += clientRect.y;
      offset += this.elementWithTooltip.node.size * this.network.getScale();
    }
    else {
      position = {
        x: this.prevMouseEvent.clientX,
        y: this.prevMouseEvent.clientY
      };
    }
    position.x += window.scrollX;
    position.y += window.scrollY;
    
    switch(this.tooltipPosition()) {
      case 'left':
        this.tooltip.classList.add('blitzboard-tooltiptext-left');
        this.tooltip.classList.remove('blitzboard-tooltiptext-top');
        this.tooltip.classList.remove('blitzboard-tooltiptext-right');
        this.tooltip.classList.remove('blitzboard-tooltiptext-bottom');
        position.x -= offset;
        position.x -= this.tooltip.clientWidth;
        position.y -= this.tooltip.clientHeight / 2;
        break;
      case 'top':
        this.tooltip.classList.remove('blitzboard-tooltiptext-left');
        this.tooltip.classList.add('blitzboard-tooltiptext-top');
        this.tooltip.classList.remove('blitzboard-tooltiptext-right');
        this.tooltip.classList.remove('blitzboard-tooltiptext-bottom');
        position.x -= this.tooltip.clientWidth / 2;
        position.y -= offset;
        break;
      case 'right':
        this.tooltip.classList.remove('blitzboard-tooltiptext-left');
        this.tooltip.classList.remove('blitzboard-tooltiptext-top');
        this.tooltip.classList.add('blitzboard-tooltiptext-right');
        this.tooltip.classList.remove('blitzboard-tooltiptext-bottom');
        position.x += offset;
        position.y -= this.tooltip.clientHeight / 2;
        break;
      case 'bottom':
        this.tooltip.classList.remove('blitzboard-tooltiptext-left');
        this.tooltip.classList.remove('blitzboard-tooltiptext-top');
        this.tooltip.classList.remove('blitzboard-tooltiptext-right');
        this.tooltip.classList.add('blitzboard-tooltiptext-bottom');
        position.x -= this.tooltip.clientWidth / 2;
        position.y += this.tooltip.clientHeight;
        position.y += offset;
        break;
    }

    this.tooltipDummy.style.left = `${position.x}px`;
    this.tooltipDummy.style.top = `${position.y}px`;
  }
  
  showTooltip() {
    this.updateTooltipLocation();
    let title = this.elementWithTooltip.node ? this.elementWithTooltip.node._title : this.elementWithTooltip.edge._title;
    if(!title)
      return;
    
    this.tooltip.innerHTML = title;
    this.tooltip.style.display = 'block';
  }
  
  hideTooltip() {
    if(this.elementWithTooltip) {
      this.tooltip.style.display = 'none';
      this.elementWithTooltip = null;
    }
  }

  toVisNode(pgNode, props, extraOptions = null) {
    const group = [...pgNode.labels].sort().join('_');
    if(!this.nodeColorMap[group]) {
      this.nodeColorMap[group] = getRandomColor(group, this.config.node.saturation, this.config.node.brightness);
    }
    
    let x, y, fixed, width;

    if(this.staticLayoutMode && this.config.layout !== 'hierarchical' && this.config.layout !== 'map') {
      fixed = true;
      try {
        ({x, y} = this.nodeLayout.getNodePosition(pgNode.id));
      } catch {
        this.nodeLayout.graph.addNode(pgNode.id);
        ({x, y} = this.nodeLayout.getNodePosition(pgNode.id));
      }
      x *= 20;
      y *= 20;
      width = null;
    } else {
      ({x, y, fixed, width} = this.calcNodePosition(pgNode));
    }
    

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

    let color = this.retrieveConfigProp(pgNode, 'node', 'color');
    let opacity = parseFloat(this.retrieveConfigProp(pgNode, 'node', 'opacity'));
    let size  = parseFloat(this.retrieveConfigProp(pgNode, 'node', 'size'));
    let tooltip  = this.retrieveConfigProp(pgNode, 'node', 'title');

    color = color || this.nodeColorMap[group];
    
    if(opacity < 1) {
      let rgb = this.getHexColors(color);
      color = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`;
    }

    let attrs = {
      id: pgNode.id,
      color: color,
      label: createLabelText(pgNode, props),
      shape: 'dot',
      size: size || 25,
      degree: degree,
      _title: tooltip != null ? tooltip : this.createTitle(pgNode),
      fixed: {
        x: fixed,
        y: this.config.layout === 'timeline' ? false : fixed
      },
      borderWidth: url ? 3 : 1,
      url: url,
      x: x,
      y: y,
      chosen: this.retrieveConfigProp(pgNode, 'node', 'chosen'),
      font: {
        color: url ? 'blue' : 'black',
        strokeWidth: 2,
      },
      fixedByTime: fixed
    };
    
    let otherProps = this.retrieveConfigPropAll(pgNode,
      'node', ['color', 'size', 'opacity', 'title']);
    
    for(let key of Object.keys(otherProps)) {
      attrs[key] = otherProps[key] || attrs[key];
    }
    
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
          svg.querySelectorAll("path,circle,ellipse,rect").forEach((path) => {
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
  
  retrieveProp(pgElem, config, loadFunction = true) {
    if((typeof config) === 'function' && loadFunction) {
      return config(new Proxy(pgElem, Blitzboard.blitzProxy));
    } else if((typeof config) === 'string' && config.startsWith('@')) {
      return pgElem.properties[config.substr(1)]?.[0];
    }
    return config; // return as constant
  }
  
  retrieveConfigProp(pgElem, type, propName, loadFunction = true) {
    const labels = pgElem.labels.join('_');
    let propConfig = this.config?.[type][propName];
    if ((typeof propConfig) === 'object') {
      return this.retrieveProp(pgElem, propConfig[labels], loadFunction)
    }
    return this.retrieveProp(pgElem, propConfig, loadFunction);
  }

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
  }
  
  toVisEdge(pgEdge, props = this.config.edge.caption, id) {
    const edgeLabel = pgEdge.labels.join('_');
    if (!this.edgeColorMap[edgeLabel]) {
      this.edgeColorMap[edgeLabel] = getRandomColor(edgeLabel, this.config.edge.saturation || '0%', this.config.edge.brightness || '30%');
    }
    let color = this.retrieveConfigProp(pgEdge, 'edge', 'color');
    let opacity = parseFloat(this.retrieveConfigProp(pgEdge, 'edge', 'opacity')) || 1;
    let width = parseFloat(this.retrieveConfigProp(pgEdge, 'edge','width'));
    let tooltip  = this.retrieveConfigProp(pgEdge, 'edge', 'title');

    color = color || this.edgeColorMap[edgeLabel];

    if(opacity < 1) {
      let rgb = this.getHexColors(color);
      color = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`;
    }
    
    let attrs = {
      id: id,
      from: pgEdge.from,
      to: pgEdge.to,
      color: color,
      label: createLabelText(pgEdge, props),
      _title: tooltip != null ? tooltip : this.createTitle(pgEdge),
      remoteId: id,
      width: width || defaultWidth,
      hoverWidth: 0.5,
      smooth: this.map ? false : { roundness: 1 },
      chosen: this.retrieveConfigProp(pgEdge, 'edge', 'chosen'),
      arrows: {
        to: {
          enabled: pgEdge.direction == '->' || pgEdge.undirected === 'false'
        },
      }
    };

    let otherProps = this.retrieveConfigPropAll(pgEdge,
      'edge', ['color', 'opacity', 'width', 'title']);

    for(let key of Object.keys(otherProps)) {
      attrs[key] = otherProps[key] || attrs[key];
    }
    
    return attrs;
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
      let pg = this.tryPgParse(nodes);
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
  
  highlightNodePath(nodes) {
    let nodeIds = nodes;
    if(nodes.length > 0 && typeof nodes[0] !== 'string') {
      nodeIds = nodes.map((n) => n.id);
    }
    let edgeIds = [];
    for(let i = 0; i < nodeIds.length - 1; ++i) {
      edgeIds.push(`${nodeIds[i]}${Blitzboard.edgeDelimiter}${nodeIds[i + 1]}`);
    }
    this.network.selectEdges(edgeIds);
  }

  addEdges(edges, update = true) {
    let newEdges;
    if (typeof edges === 'string' || edges instanceof String) {
      let pg = this.tryPgParse(edges);
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


  tryPgParse(pg) {
    for(let callback of this.beforeParse) {
      callback();
    }
    try {
      return pgParser.parse(pg);
    } catch(e) {
      for(let callback of this.onParseError) {
        callback(e);
      }
      console.log(e);
      return null;
    }
  }

  createTitle(elem) {
    let flattend_props = Object.entries(elem.properties).reduce((acc, prop) =>
      acc.concat(`<tr valign="top"><td>${prop[0]}</td><td> ${convertToHyperLinkIfURL(prop[1])}</td></tr>`), []);
    if (!elem.from) // for nodes
    {
      let idText = `<tr><td><b>${elem.id}</b></td><td> <b>${wrapText(elem.labels.map((l) => ':' + l).join(' '), true)}</b></td></tr>`;
      flattend_props.splice(0, 0, idText);
    } else if(elem.labels.length > 0) {
      let idText = `<tr><td><b>${wrapText(elem.labels.map((l) => ':' + l).join(' '), true)} </b></td><td></td></tr>`;
      flattend_props.splice(0, 0, idText);
    }
    if (flattend_props.length === 0) {
      return null;
    }
    return `<table style='fixed'>${flattend_props.join('')}</table>`;
  }

  fit() {
    this.network.fit({animation: !this.staticLayoutMode });
  }

  setGraph(input, update = true, layout = null) {
    this.nodeColorMap = {};
    this.edgeColorMap = {};
    this.prevMouseEvent = null;
    this.dragging = false;
    let newPg;
    if (!input) {
      newPg = this.tryPgParse(''); // Set empty pg
    }
    else if (typeof input === 'string' || input instanceof String) {
      try {
        newPg = JSON.parse(input);
      } catch (err) {
        if (err instanceof SyntaxError) {
          newPg = this.tryPgParse(input);
          newPg = this.tryPgParse(input);
        }
        else
          throw err;
      }
    } else {
      newPg = input;
    }
    if (newPg === null || newPg === undefined)
      return;
    this.graph = newPg;
    
    this.nodeLayout = layout;

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
  
  validateGraph() {
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
  
  doLayoutStep(step = 1) {
    for(let i = 0; i < step; ++i) {
      this.nodeLayout.step();
    }
    let listToUpdate = [];
    this.nodeLayout.graph.forEachNode(node => {
      let position = this.nodeLayout.getNodePosition(node.id);
      listToUpdate.push({
        id: node.id,
        x: position.x * 20,
        y: position.y * 20
      });
    })
    this.nodeDataSet.update(listToUpdate);
  }
  
  update(applyDiff = true) {
    let blitzboard = this;
    this.warnings = [];
    applyDiff = applyDiff && this.nodeDataSet && this.edgeDataSet && !this.staticLayoutMode;
    
    if(this.config.style && this.config.layout !== 'map') {
      this.networkContainer.style = this.networkContainerOriginalStyle + ' ' + this.config.style;
    }
    
    if(applyDiff) {
      this.deletedNodes = new Set(Object.keys(this.nodeMap));
      this.addedNodes = new Set();
      this.addedEdges = new Set();
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
          this.addedNodes.add(node.id);
        }
        this.nodeMap[node.id] = node;
        this.deletedNodes.delete(node.id);
        if(node.location) {
          for (let i = node.location.start.line; i <= node.location.end.line; i++) {
            if (i < node.location.end.line || node.location.end.column > 1)
              this.nodeLineMap[i] = node;
          }
          this.maxLine = Math.max(this.maxLine, node.location.end.line);
        }
      });

      this.graph.edges.forEach(edge => {
        let id = this.toNodePairString(edge);
        if(!this.edgeMap[id])
          this.addedEdges.add(id);
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
          this.maxLine = Math.max(this.maxLine, edge.location.end.line);
        }
      });

      this.deletedNodes.forEach((nodeId) => {
        delete this.nodeMap[nodeId];
      });
      this.nodeDataSet.remove([...this.deletedNodes]);

      this.deletedEdges = [];
      for(let edgeId of Object.keys(this.edgeMap)) {
        if(!newEdgeMap[edgeId]) {
          this.deletedEdges.push(edgeId);
        }
      }
      this.edgeDataSet.remove(this.deletedEdges);
      this.edgeMap = newEdgeMap;
      if(this.map) {
        blitzboard.updateNodeLocationOnMap();
      }
      if(this.config.layout === 'timeline') {
        blitzboard.updateNodeLocationOnTimeLine();
      }
    } else {
      this.addedNodes = new Set(this.graph.nodes.map((n) => n.id));
      this.addedEdges = new Set(this.graph.edges.map((e) => e.id));
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

    if(this.staticLayoutMode) {

      let ngraph = createGraph();
      this.graph.nodes.forEach(node => {
        ngraph.addNode(node.id);
      });
      this.graph.edges.forEach(edge => {
        ngraph.addLink(edge.from, edge.to);
      });
      
      const physicsSettings = {
        // timeStep: 0.1,
        dimensions: 2,
        // gravity: -1.2,
        // theta: 1.8,
        // springLength: 300,
        springCoefficient: 0.7,
        // dragCoefficient: 0.9,
      };
      if(!this.nodeLayout) {
        this.nodeLayout = createLayout(ngraph, physicsSettings);
      } else if(!this.nodeLayout.getNodePosition && typeof(this.nodeLayout) === 'object') {
        // convert into layout of ngraph
        let ngraphLayout = createLayout(ngraph, physicsSettings);
        for(const [nodeId, position] of Object.entries(this.nodeLayout)) {
          if(ngraphLayout.graph.hasNode(nodeId))
            ngraphLayout.setNodePosition(nodeId, position.x, position.y);
        }
        this.nodeLayout = ngraphLayout;
      }
      for (let i = 0; i < 1000; ++i) {
        if(this.nodeLayout.step() && i >= 100) {
          console.log(`layout is stable at step #${i}`);
          break;
        }
      }
    }

    if(applyDiff) {
      this.validateGraph();

      for(let callback of this.onUpdated) {
        callback();
      }
      return;
    }
    
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

    this.validateGraph();


    let defaultNodeProps = this.config.node.caption;
    let defaultEdgeProps = this.config.edge.caption;

    this.nodeDataSet = new visData.DataSet();
    this.nodeDataSet.add(this.graph.nodes.map((node) => {
      return this.toVisNode(node, defaultNodeProps);
    }));
    
    this.edgeMap = {};
    this.edgeDataSet = new visData.DataSet(this.graph.edges.map((edge) => {
      let id = this.toNodePairString(edge);
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
    layout.improvedLayout = !this.staticLayoutMode;

    this.options = {
      layout:
        layout,
      interaction: {
        dragNodes: this.config.layout !== 'map',
        dragView: this.config.layout !== 'map',
        zoomView: this.config.layout !== 'map',
        hover: true,
        keyboard: {
          enabled: true, 
          bindToWindow: false
        },
        hideEdgesOnDrag: this.staticLayoutMode,
        hideEdgesOnZoom: this.staticLayoutMode
      },
      physics: {
        enabled: this.config.layout !== 'map' && this.config.layout !== 'hierarchical' && !this.staticLayoutMode,
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

    this.options = Object.assign(this.options, this.config.extraOptions);
    this.network = new visNetwork.Network(this.networkContainer, data, this.options);

    if(this.config.layout === 'map') {
      this.mapContainer.style.display = 'block';
      this.networkContainer.style.background = 'transparent';
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

    this.network.canvas.body.container.addEventListener('keydown', (e) => {
      // Key 0
      if(e.keyCode === 48)
        blitzboard.fit();
    });


    this.network.on('zoom', (e) => {
      blitzboard.updateTooltipLocation();
    });

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
      if(node) {
        if (node.url) {
          this.network.canvas.body.container.style.cursor = 'pointer';
          this.nodeDataSet.update({
            id: e.node,
            color: '#8888ff',
          });
        }
        if (this.config.node.onHover) {
          this.config.node.onHover(this.getNode(e.node));
        }
        
        this.elementWithTooltip = {
          node: node
        };
        this.showTooltip();
      } else if(node && node.degree > 1 && !this.expandedNodes.includes(e.node)) {
        this.network.canvas.body.container.style.cursor = 'pointer';
      }
    });

    this.network.on("hoverEdge", (e) => {
      const edge = this.edgeDataSet.get(e.edge);
      if (edge) {
        this.elementWithTooltip = {
          edge: edge,
          position: {
            x: e.event.offsetX,
            y: e.event.offsetY,
          }
        };
        this.showTooltip();
      }
    });

    this.network.on("selectNode", (e) => {
      // TODO: Should we show fixed tooltip on selection?
      // if(!this.network.getSelectedNodes().length && !this.network.getSelectedEdges().length) {
      //   const node = this.nodeDataSet.get(e.nodes[0]);
      //   if (node) {
      //     this.elementWithTooltip = {
      //       node: node
      //     };
      //     this.showTooltip();
      //   }
      // }
    });

    this.network.on("selectEdge", (e) => {
      // TODO: Should we show fixed tooltip on selection?
      // if(!this.network.getSelectedNodes().length && !this.network.getSelectedEdges().length) {
      //   const edge = this.edgeDataSet.get(e.edges[0]);
      //   if (edge) {
      //     this.elementWithTooltip = {
      //       edge: edge,
      //       position: {
      //         x: e.x,
      //         y: e.y,
      //       }
      //     };
      //     this.showTooltip();
      //   }
      // }
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
      this.updateTooltipLocation();
      for(let node of this.graph.nodes) {
        node = this.nodeDataSet.get(node.id);
        if(node && node.shape !== 'image' && (node.customIcon || this.config.node.defaultIcon)) {
          let position = this.network.getPosition(node.id);
          let pgNode = this.nodeMap[node.id];
          if(node.customIcon) {
            if(node.customIcon.name && Blitzboard.loadedIcons[node.customIcon.name]) { // Iconiy
              ctx.drawImage(Blitzboard.loadedIcons[node.customIcon.name],
                position.x - node.size * Blitzboard.iconSizeCoef / 2, position.y - node.size * Blitzboard.iconSizeCoef / 2,
                node.size * Blitzboard.iconSizeCoef, 
                node.size * Blitzboard.iconSizeCoef);
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
                  ctx.drawImage(Blitzboard.loadedIcons[lowerLabel], position.x - node.size * Blitzboard.iconSizeCoef / 2,
                    position.y - node.size * Blitzboard.iconSizeCoef / 2,
                    node.size * Blitzboard.iconSizeCoef,
                    node.size * Blitzboard.iconSizeCoef);
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
      this.hideTooltip();
    });

    this.network.on("blurEdge", (params) => {
      this.hideTooltip();
    });

    if (!Blitzboard.fontLoaded && document.fonts) {
      Blitzboard.fontLoaded = true;
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

    this.network.on("animationFinished", (e) => {
      blitzboard.network.renderer.dragging = false;
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
      } else {
        this.fit();
      }
    });

    for(let callback of this.onUpdated) {
      callback();
    }
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
      if(this.staticLayoutMode)
        blitzboard.network.renderer.dragging = true;
      const animationOption = {
        scale: 1.0,
        animation:
          {
            duration: 500,
            easingFunction: "easeInOutQuad"
          }
      };
      if(this.staticLayoutMode) {
        animationOption.animation = false;
      }
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
      this.network.selectEdges([edge.id]);
    }

    for(let callback of this.onEdgeFocused) {
      // TODO: The argument should be proxy instead of plain objects
      callback(edge);
    }
  }
  
  showLoader(text = "Now loading...") {
    this.screen.style.display = 'flex';
    this.screenText.innerText = text;
    this.screenText.style.display = text ? 'block' : 'none';
  }
  
  hideLoader() {
    this.screen.style.display = 'none';
  }

  toNodePairString(pgEdge) {
    return `${pgEdge.from}${Blitzboard.edgeDelimiter}${pgEdge.to}`;
  }
}



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


class DuplicateNodeError extends Error {
  constructor(nodes) {
    super(`Duplicate node: ${nodes.map(n => n.id).join(', ')}`);
    this.name = "NodeDuplicationError";
    this.nodes = nodes;
  }
}

module.exports.DuplicateNodeError = DuplicateNodeError;


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

function convertToHyperLinkIfURL(text) {
  if(!text)
    return text;
  if(Array.isArray(text))
    text = text[0];
  if(text.startsWith('http://') || text.startsWith('https://') ) {
    return `<a target="_blank" href="${text}">${wrapText(text)}</a>`;
  }
  return wrapText(text);
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

function isDateString(str) {
  return isNaN(str) && !isNaN(Date.parse(str))
}

function htmlTitle(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  return container;
}
