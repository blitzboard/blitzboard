require('@iconify/iconify');
require('./pg_parser_browserified.js');
require('./scc.js');
const DeckGL = require('@deck.gl/core');
const DeckGLLayers = require('@deck.gl/layers');
const DeckGLGeoLayers = require('@deck.gl/geo-layers');
require('../css/blitzboard.css')
let visData = require('vis-data');
let visNetwork = require('vis-network');

const d3Force = require("d3-force");

const defaultWidth = 1;

module.exports = class Blitzboard {
  static SCCColor = '#edc821';
  static selectedNodeColor = [0x21, 0x56, 0xee];
  static minNodeSizeInPixels = 3;
  static defaultConfig = {
    doubleClickWait: 200,
    node: {
      caption: ['id'],
      autoIcon: true,
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
    dimensions: 2,
    style: "border: solid 1px #E6E6E6; background: radial-gradient(white, #E6E6E6);",
    extraOptions: {
    },
  };
  static tooltipMaxWidth = 600;
  static defaultNodeSize = 5;
  static iconPrefixes = ['fa-solid:', 'ion:', 'bx:bx-', 'gridicons:', 'akar-icons:'];
  static iconSizeCoef = 1.5;
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

  static pitch = 0;

  constructor(container) {
    this.container = container;
    this.nodeColorMap = {};
    this.expandedNodes = [];
    this.nodeMap = {};
    this.config = Blitzboard.defaultConfig;
    this.baseConfig = this.config;
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
    this.sccMode = 'cluster';
    this.configChoice = null;
    this.hoveredNodes = new Set();
    this.hoveredEdges = new Set();
    this.selectedNodes = new Set();
    this.selectedEdges = new Set();

    this.staticLayoutMode = true;

    this.container.style.position = 'absolute';

    this.networkContainer = document.createElement('div');
    this.networkContainer.style = this.networkContainerOriginalStyle = `
      height: 100%;
      width: 100%;
      top: 0;
      left: 0;
      position: absolute;
      z-index: 0;
    `;

    this.tooltipDummy = document.createElement('div');
    this.tooltipDummy.style.position = 'absolute';
    this.tooltipDummy.classList.add('blitzboard-tooltip');
    this.tooltipDummy.style['background-color'] = 'rgba(0, 0, 0, 0)';
    this.tooltipDummy.style['z-index'] = '2000';

    this.tooltip = document.createElement('span');
    this.tooltip.style.display = 'none';
    this.tooltip.classList.add('blitzboard-tooltiptext');
    this.tooltip.classList.add('blitzboard-tooltiptext-top');
    this.tooltip.style['z-index'] = '2001';

    this.configChoiceDiv = document.createElement('div');
    this.configChoiceDiv.id = "blitzboard-config-choice-div";
    this.configChoiceDiv.style =
      `
      max-width: 400px;
      top: 20px;
      right: 80px;
      position: absolute;
      z-index: 2000;
      display: none;
    `;

    this.configChoiceLabel = document.createElement('label');
    this.configChoiceLabel.id = "blitzboard-config-choice-label";
    this.configChoiceLabel.style =
      `
      max-width: 200px;
      display: inline;
    `;

    this.configChoiceDropdown = document.createElement('select');
    this.configChoiceDropdown.id = "blitzboard-config-choice-dropdown";
    this.configChoiceDropdown.style =
      `
      max-width: 200px;
      display: inline;
    `;


    this.searchBarDiv = document.createElement('div');
    this.searchBarDiv.id = "blitzboard-search-bar-div";
    this.searchBarDiv.style =
      `
      width: 280px;
      top: 60px;
      right: 80px;
      height: 30px;
      position: absolute;
      z-index: 2000;
    `;

    this.searchInput = document.createElement('input');
    this.searchInput.type = "text";
    this.searchInput.id = "blitzboard-search-input";
    this.searchInput.type = 'search';
    this.searchButton = document.createElement('label');
    this.searchButton.id = "blitzboard-search-button";
    this.searchButton.setAttribute('for', 'blitzboard-search-input');

    this.minTime = new Date(8640000000000000);
    this.maxTime = new Date(-8640000000000000);

    this.prevMouseEvent = null;
    this.timeScale = 1000;
    this.dragging = false;
    this.onNodeAdded = [];
    this.onEdgeAdded = [];
    this.onNodeFocused = [];
    this.onEdgeFocused = [];
    this.onUpdated = [];
    this.onClear = [];
    this.beforeParse = [];
    this.onParseError = [];
    this.maxLine = 0;
    this.nodeLayout = null;
    this.scrollAnimationTimerId = null;
    this.screen = document.createElement('div');
    this.screenText = document.createElement('div');
    this.screenText.classList.add('blitzboard-loader');
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
    container.appendChild(this.searchBarDiv);
    container.appendChild(this.configChoiceDiv);
    this.configChoiceDiv.appendChild(this.configChoiceLabel);
    this.configChoiceDiv.appendChild(this.configChoiceDropdown);
    this.searchBarDiv.appendChild(this.searchButton);
    this.searchBarDiv.appendChild(this.searchInput);
    document.body.appendChild(this.tooltipDummy);
    this.tooltipDummy.appendChild(this.tooltip);
    this.tooltip.addEventListener('mouseleave', (e) => {
      if(e.relatedTarget !== blitzboard.network.canvas.getContext().canvas)
        blitzboard.hideTooltip();
    });


    this.configChoiceDropdown.addEventListener('change', (e) => {
      this.configChoice = e.target.value;
      this.showLoader();
      setTimeout(() => {
        this.update(false);
        this.hideLoader();
      }, 100); // Add short delay to show loader
    });

    this.searchButton.addEventListener('click', (e) => {
      if(blitzboard.searchInput.clientWidth > 0) {
        blitzboard.config.onSearchInput(blitzboard.searchInput.value);
      } else {
        blitzboard.searchInput.style.width = '250px';
        blitzboard.searchInput.style["padding-right"] = '30px';
        blitzboard.searchButton.style.right = '250px';
      }
    })


    this.searchInput.addEventListener('transitionend', (e) => {
      if(this.searchInput.clientWidth > 0) {
        $(this.searchInput).autocomplete("search", this.searchInput.value);
      }
    });


    this.searchInput.addEventListener('keydown', (e) => {
      // Enter
      if(e.keyCode === 13 && blitzboard.config.onSearchInput)
        blitzboard.config.onSearchInput(blitzboard.searchInput.value);
    });

    this.searchInput.addEventListener('blur', (e) => {
      if(e.target.value === '') {
        blitzboard.searchInput.style.width = '0px';
        blitzboard.searchInput.style["padding-right"] = '0px';
        blitzboard.searchButton.style.right = '0px';
      }
    });

    this.container.addEventListener('mouseout', (e) => {
      blitzboard.dragging = false;
    }, true);

    this.container.addEventListener('mouseup', (e) => {
      blitzboard.dragging = false;
    }, true);

    this.container.addEventListener('mousemove', (e) => {
      if(blitzboard.elementWithTooltip?.edge) {
        this.updateTooltipLocation();
      }
      blitzboard.prevMouseEvent = e;
    }, true);


    this.container.addEventListener('mousedown', (e) => {
      blitzboard.dragging = true;
      blitzboard.prevMouseEvent = e;
    }, true);

    const balloonHandleSize = 12;


    function clickHandler(e) {
      clearTimeout(blitzboard.doubleClickTimer);
      blitzboard.doubleClickTimer = null;
      let needUpdate = blitzboard.selectedNodes.size > 0 || blitzboard.selectedEdges.size > 0;

      blitzboard.selectedNodes.clear();
      blitzboard.selectedEdges.clear();

      if(e.picked) {
        let object = e.object;
        if(object?.objectType === 'node') {
          if(blitzboard.config.node.onClick)
            blitzboard.config.node.onClick(blitzboard.getNode(object.id));
          blitzboard.selectedNodes.add(object.id);
          needUpdate = true;
        } else if(object?.objectType === 'edge' && blitzboard.config.edge.onClick) {
          blitzboard.config.edge.onClick(blitzboard.getEdge(object.id));
          blitzboard.selectedEdges.add(object.id);
          needUpdate = true;
        }
      }
      if(needUpdate)
        blitzboard.updateLayers();
    }

    this.network = new DeckGL.Deck({
      parent: this.container,
      controller: {doubleClickZoom: false},
      getTooltip: (elem) => {
        if(!elem?.object)
          return null;
        return {
          html: elem.object._title
        }
      },
      onClick: (info, event) => {
        if(!this.doubleClickTimer) {
          if(this.config.doubleClickWait <= 0) {
            clickHandler(info);
          } else {
            this.doubleClickTimer = setTimeout(() => clickHandler(info), this.config.doubleClickWait);
          }
        } else {
          clearTimeout(this.doubleClickTimer);
          this.doubleClickTimer = null;
          if(info.picked) {
            let object = info.object;
            if(object.objectType === 'node' && this.config.node.onDoubleClick) {
              this.config.node.onDoubleClick(this.getNode(object.id));
            } else if(object.objectType === 'edge' && this.config.edge.onDoubleClick) {
              this.config.edge.onDoubleClick(this.getEdge(object.id));
            }
          } else {
            if(event.target === this.network.canvas)
              this.fit();
          }
        }

        // if(e.nodes.length > 0 && !blitzboard.network.isCluster(e.nodes[0])){
        //   let node = e.nodes[0]
        //   this.upstreamNodes = this.getUpstreamNodes(node);
        //   this.downstreamNodes = this.getDownstreamNodes(node);
        //   this.network.setSelection({nodes: [], edges: []}); // reset
        //   this.highlightedNodes = Array.from(this.upstreamNodes).concat(Array.from(this.downstreamNodes));
        //   this.network.selectNodes( this.highlightedNodes, true);
        // }
      },
      initialViewState: {
        target: [0, 0],
        zoom: 1
      },
      views: [new DeckGL.OrthographicView()],
      layers: [],
    });

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
      }
      
      .blitzboard-tooltip .blitzboard-tooltiptext-bottom {
        bottom: 100%;
        left: 50%;
      }
      
      
      .blitzboard-tooltip .blitzboard-tooltiptext-left {
        top: calc(50% - ${balloonHandleSize / 2}px);
        left: 0%;
      }
      
      .blitzboard-tooltip .blitzboard-tooltiptext-right {
        top: calc(-50% + ${balloonHandleSize / 2}px);
        left: 100%;
      }
      
      
      .blitzboard-tooltip .blitzboard-tooltiptext::after {
        content: "";
        position: absolute;
        top: -${balloonHandleSize / 2}px;
        border-width: ${balloonHandleSize}px;
        border-style: solid;
      }
      
      .blitzboard-tooltip .blitzboard-tooltiptext-bottom::after {
        top: -${balloonHandleSize * 2}px;
        left: calc(50% - ${balloonHandleSize / 2}px);
        border-color: transparent transparent #555 transparent;
      }
      
      .blitzboard-tooltip .blitzboard-tooltiptext-left::after {
        top: calc(50% - ${balloonHandleSize}px);
        left: 100%;
        border-color: transparent transparent transparent #555;
      }
      
      .blitzboard-tooltip .blitzboard-tooltiptext-top::after {
        top: 100%;
        left: calc(50% - ${balloonHandleSize / 2}px);
        border-color: #555 transparent transparent transparent;
      }

      .blitzboard-tooltip .blitzboard-tooltiptext-right::after {
        top: calc(50% - ${balloonHandleSize / 2}px);
        left: -${balloonHandleSize * 2}px;
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
      if(prop === 'label') {
        return target.labels[0];
      }
      if(!(prop in target) && prop in target.properties) {
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
    let colors = window.getComputedStyle(document.body.appendChild(a)).color.match(/\d+/g).map(function(a) {
      return parseInt(a, 10);
    });
    colors.push(255);
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
      if(this.config.layout == 'custom') {
        if(pgNode.properties[this.config.layoutSettings.x] || pgNode.properties[this.config.layoutSettings.y]) {
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
    if(!this.prevMouseEvent)
      return null;
    if(window.innerWidth < window.innerHeight) {
      return this.prevMouseEvent.clientY < window.innerHeight / 2 ? 'bottom' : 'top';
    }
    return this.prevMouseEvent.clientX < window.innerWidth / 2 ? 'right' : 'left';
  }

  updateTooltipLocation() {
    if(!this.elementWithTooltip)
      return;
    let position, offset = 20;
    const edgeOffset = 10;
    if(this.elementWithTooltip.node) {
      position = this.network.canvasToDOM(this.network.getPosition(this.elementWithTooltip.node.id));
      let clientRect = this.container.getClientRects()[0];
      position.x += clientRect.x;
      position.y += clientRect.y;
      offset += this.elementWithTooltip.node._size * this.network.getScale();
    } else {
      if(!this.prevMouseEvent)
        return;
      position = {
        x: this.prevMouseEvent.clientX,
        y: this.prevMouseEvent.clientY
      };
      offset += edgeOffset;
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

  svgToURL(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  toVisNode(pgNode, props, extraOptions = null) {
    const group = [...pgNode.labels].sort().join('_');
    if(!this.nodeColorMap[group]) {
      this.nodeColorMap[group] = getRandomColor(group, this.config.node.saturation, this.config.node.brightness);
    }

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
    let expanded = this.expandedNodes.includes(pgNode.id);

    let degree = pgNode.properties['degree'];
    let blitzboard = this;
    if(degree !== undefined) {
      degree = degree[0];
    } else {
      degree = 2; // assume degree to be two (default)
    }

    let color = this.retrieveConfigProp(pgNode, 'node', 'color');
    let opacity = parseFloat(this.retrieveConfigProp(pgNode, 'node', 'opacity'));
    let size = parseFloat(this.retrieveConfigProp(pgNode, 'node', 'size'));
    let tooltip = this.retrieveConfigProp(pgNode, 'node', 'title');
    let clusterId = null;

    color = color || this.nodeColorMap[group];

    if(this.sccMap[pgNode.id]) {
      color = Blitzboard.SCCColor;
      clusterId = this.sccMap[pgNode.id];
    }

    let rgb = this.getHexColors(color);
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
      _size: size || Blitzboard.defaultNodeSize,
      degree: degree,
      _title: tooltip != null ? tooltip : this.createTitle(pgNode),
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
    if((typeof propConfig) === 'object') {
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
    if(!this.edgeColorMap[edgeLabel]) {
      this.edgeColorMap[edgeLabel] = getRandomColor(edgeLabel, this.config.edge.saturation || '0%', this.config.edge.brightness || '30%');
    }
    let color = this.retrieveConfigProp(pgEdge, 'edge', 'color');
    let opacity = parseFloat(this.retrieveConfigProp(pgEdge, 'edge', 'opacity')) || 1;
    let width = parseFloat(this.retrieveConfigProp(pgEdge, 'edge', 'width'));
    let tooltip = this.retrieveConfigProp(pgEdge, 'edge', 'title');

    color = color || this.edgeColorMap[edgeLabel];

    let rgb = this.getHexColors(color);
    let smooth = this.config.layout === 'map' || this.config.layout === 'hierarchical-scc' ? false : {roundness: 1};

    let dashes = false;
    if(this.sccMap[pgEdge.from] && this.sccMap[pgEdge.from] === this.sccMap[pgEdge.to]) {
      smooth = {roundness: 0.5};
      dashes = true;
    }
    let attrs = {
      objectType: 'edge',
      id: id,
      from: pgEdge.from,
      to: pgEdge.to,
      color: rgb,
      label: createLabelText(pgEdge, props),
      _title: tooltip != null ? tooltip : this.createTitle(pgEdge),
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
  }

  includesNode(node) {
    return this.graph.nodes?.filter(e => e.id === node.id).length > 0;
  }

  addNode(node, update = true) {
    this.addNodes([node], update);
  }

  addNodes(nodes, update = true) {
    let newNodes;
    if(typeof nodes === 'string' || nodes instanceof String) {
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
    if(typeof edges === 'string' || edges instanceof String) {
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
    if(!elem.from) // for nodes
    {
      let idText = `<tr><td><b>${elem.id}</b></td><td> <b>${wrapText(elem.labels.map((l) => ':' + l).join(' '), true)}</b></td></tr>`;
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

  fit() {
    // Set dummy viewState in advance so that the redrawing is triggered
    this.network.setProps({
      initialViewState: {target: [0, 0], zoom: 3},
    });

    this.network.setProps({
      initialViewState: this.createInitialViewState(),
    });
  }

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
  }

  clearGraph(update = true) {
    this.graph = this.tryPgParse(''); // Set empty pg
    for(let callback of this.onClear) {
      callback();
    }
    if(update)
      this.update();
  }

  setGraph(input, update = true, layout = null) {
    this.nodeColorMap = {};
    this.edgeColorMap = {};
    this.prevMouseEvent = null;
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
      this.update();
  }


  setConfig(config, update = true) {
    this.config = deepMerge(Blitzboard.defaultConfig, config);

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

    this.baseConfig = deepMerge({}, this.config); // Save config before apply configChoices
    Blitzboard.loadedIcons = {};
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

  /// Return a set of upstream nodes from node specified by srcNodeId
  getUpstreamNodes(srcNodeId) {
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
  }

  /// Return a set of downstream nodes from node specified by srcNodeId
  getDownstreamNodes(srcNodeId) {
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
  }

  computeHierarchicalPositions() {
    this.hierarchicalPositionMap = {};
    let tmpNodeDataSet = new visData.DataSet(this.graph.nodes);
    let tmpEdgeDataSet = new visData.DataSet(this.graph.edges);
    let tmpOptions = {
      layout: {
        hierarchical: this.config.layoutSettings
      }
    }
    let tmpNetwork = new visNetwork.Network(this.networkContainer, {
      nodes: tmpNodeDataSet,
      edges: tmpEdgeDataSet
    }, tmpOptions);
    for(let node of this.graph.nodes) {
      let position = tmpNetwork.getPosition(node.id);
      this.hierarchicalPositionMap[node.id] = position;
    }
  }


  computeHierarchicalSCCPositions() {
    this.hierarchicalPositionMap = {};
    let sccList = stronglyConnectedComponents(this.graph.edges);
    let tmpNodes = this.graph.nodes.filter(n => {
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
      tmpNodes.push({
        id: sccId,
        labels: [],
        properties: [],
        location: {start: {line: 0, column: 0}, end: {line: 0, column: 0}}
      });
    }

    let tmpEdges = JSON.parse(JSON.stringify(this.graph.edges));

    for(let edge of tmpEdges) {
      edge.from = this.sccMap[edge.from] || edge.from;
      edge.to = this.sccMap[edge.to] || edge.to;
    }

    let tmpNodeDataSet = new visData.DataSet();
    tmpNodeDataSet.add(tmpNodes);

    let tmpEdgeDataSet = new visData.DataSet(tmpEdges);
    let tmpOptions = {
      layout: {
        hierarchical: this.config.layoutSettings
      }
    }
    let tmpNetwork = new visNetwork.Network(this.networkContainer, {
      nodes: tmpNodeDataSet,
      edges: tmpEdgeDataSet
    }, tmpOptions);
    for(let node of tmpNodes) {
      let position = tmpNetwork.getPosition(node.id);
      if(sccReverseMap[node.id] !== undefined) {
        // The node is cluster
        let i = 0;

        this.hierarchicalPositionMap[node.id] = position;

        for(let sccNodeId of sccReverseMap[node.id]) {
          this.hierarchicalPositionMap[sccNodeId] = {
            x: position.x,
            y: position.y + i * 100,
          };
          i += 1;
        }
      } else {
        this.hierarchicalPositionMap[node.id] = position;
      }
    }
  }


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
  }

  onNodeHover(hoverInfo) {
    this.hoveredNodes = new Set();
    if(hoverInfo.object) {
      this.hoveredNodes.add(hoverInfo.object.id);
    }
    // TODO: Can we avoid update of whole layers?
    this.updateLayers();
    if (this.config.node.onHover) {
      this.config.node.onHover(this.getNode(hoverInfo.object.id));
    }
  }

  onEdgeHover(hoverInfo) {
    this.hoveredEdges = new Set();
    if(hoverInfo.object) {
      this.hoveredEdges.add(hoverInfo.object.id);
    }
    // TODO: Can we avoid update of whole layers?
    this.updateLayers();
    if (this.config.edge.onHover) {
      this.config.edge.onHover(this.getEdge(hoverInfo.object.id));
    }
  }

  updateLayers() {
    const coordinateSystem = this.config.layout === 'map' ? DeckGL.COORDINATE_SYSTEM.LNGLAT : DeckGL.COORDINATE_SYSTEM.CARTESIAN;
    const sizeUnits = this.config.layout === 'map' ? 'meters' : 'common';

    const scale = 0.2;

    let highlightedNodes = new Set([...this.hoveredNodes, ...this.selectedNodes]);

    this.nodeLayer = new DeckGLLayers.ScatterplotLayer({
      id: 'scatterplot-layer',
      data: this.nodeData,
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

    const edgeLayer = new DeckGLLayers.LineLayer({
      id: "line-layer",
      pickable: true,
      coordinateSystem,
      billboard: this.config.layout !== 'map',
      data: this.edgeDataSet,
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

    const characterSet = this.nodeData.map(n => Array.from(n.label)).flat();

    let textLayerAttributes = {
      id: 'node-text-layer',
      pickable: true,
      getPosition: (node) => {
        return [node.x,
          node.y + (this.config.layout === 'map' ? -0.001 * node._size / Blitzboard.defaultNodeSize : node._size * scale),
          node.z];
      },
      getText: node => node.label,
      getSize: (n) => n._size / Blitzboard.defaultNodeSize * fontSize * (this.config.layout === 'map' ? 100 : 1), // TODO: somewhy, we have to scale the size for map layout
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

    textLayerAttributes.data = this.nodeData;

    const nodeTextLayer = new DeckGLLayers.TextLayer(textLayerAttributes);

    textLayerAttributes.data = Array.from(highlightedNodes).map(id => this.nodeDataSet[id]);
    textLayerAttributes.fontWeight = 900; // bolder than bold
    textLayerAttributes.id = 'hilighted-node-text-layer';
    const highlightedNodeTextLayer = new DeckGLLayers.TextLayer(textLayerAttributes);

    const edgeTextLayer = new DeckGLLayers.TextLayer({
      id: 'edge-text-layer',
      data: this.edgeDataSet,
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

    const edgeArrowLayer = new DeckGLLayers.IconLayer({
      id: 'edge-arrow-layer',
      data: this.edgeDataSet.filter(e => !e.undirected || e.direction === '->'),
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


    this.iconLayer = this.createIconLayer(this.nodeData, scale, sizeUnits, coordinateSystem);


    // TODO: Create individual layers for each node may lead to performance problem
    this.thumbnailLayers = this.nodeData.map((n) => {
      if(n.imageURL) {
        return new DeckGLLayers.BitmapLayer({
          id: 'bitmap-layer-' + n.id,
          bounds: [ n.x + n._size / Blitzboard.defaultNodeSize, n.y + n._size / Blitzboard.defaultNodeSize,
            n.x - n._size / Blitzboard.defaultNodeSize,
            n.y - n._size / Blitzboard.defaultNodeSize],
          image: n.imageURL
        });
      }
      return null;
    }).filter(n => n);

    if(this.config.layout === 'map') {
      const tileLayer = new DeckGLGeoLayers.TileLayer({
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
        tileLayer,
        edgeLayer,
        edgeTextLayer,
        this.nodeLayer,
        edgeArrowLayer,
        nodeTextLayer,
        highlightedNodeTextLayer,
        this.iconLayer,
        ...this.thumbnailLayers
      ];

      this.network.setProps({
        layers: this.layers,
      });
    } else {
      this.layers = [
        edgeLayer,
        edgeTextLayer,
        this.nodeLayer,
        // edgeArrowLayer,
        nodeTextLayer,
        highlightedNodeTextLayer,
        this.iconLayer,
        ...this.thumbnailLayers
      ]
      this.network.setProps({
        layers: this.layers
      });
    }
  }

  updateViews() {
    if(this.config.layout === 'map') {
      this.viewState = this.createInitialViewState();
      this.network.setProps({
        initialViewState: this.viewState,
        views: [new DeckGL.MapView()],
      });
    } else {
      const view = this.config.dimensions === 2 ? new DeckGL.OrthographicView({}) : new DeckGL.OrbitView({});

      this.viewState = this.createInitialViewState();
      this.network.setProps({
        initialViewState: this.viewState,
        views: [view],
      });
    }
  }

  isFilteredOutNode(node) {
    if(this.config.node.filter)
      return !this.config.node.filter(new Proxy(node, Blitzboard.blitzProxy));
    return false;
  }

  isFilteredOutEdge(edge) {
    if(this.config.edge.filter) {
      return !this.config.edge.filter(new Proxy(edge, Blitzboard.blitzProxy));
    }
    return false;
  }

  update(applyDiff = true) {
    this.staticLayoutMode = true;
    let blitzboard = this;
    this.warnings = [];

    if(this.baseConfig.configChoices?.configs) {
      let chosenConfig;
      if(this.configChoice) {
        chosenConfig = this.baseConfig.configChoices.configs[this.configChoice];
      } else {
        chosenConfig = Object.values(this.baseConfig.configChoices.configs)[0];
      }
      if(chosenConfig) {
        this.config = deepMerge(this.baseConfig, chosenConfig);
      }
    }


    if(this.config.layout === 'hierarchical-scc') {
      this.config.layoutSettings = {
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
      };
    }

    applyDiff = applyDiff && this.nodeDataSet && this.edgeDataSet && !this.staticLayoutMode && this.config.layout !== 'hierarchical-scc';

    if(this.config.style && this.config.layout !== 'map') {
      document.getElementById('deckgl-overlay').style = this.networkContainerOriginalStyle + ' ' + this.config.style;
    }


    this.hideTooltip();

    this.nodeLineMap = {};
    this.edgeLineMap = {};

    if(applyDiff) {
      this.deletedNodes = new Set(Object.keys(this.nodeMap));
      this.addedNodes = new Set();
      this.addedEdges = new Set();
      let newEdgeMap = {};

      this.maxLine = 0;
      this.graph.nodes.forEach(node => {
        if(this.isFilteredOutNode(node)) return;
        let existingNode = this.nodeMap[node.id];
        if(existingNode) {
          if(!nodeEquals(node, existingNode)) {
            delete this.nodeDataSet[node.id];
            let visNode = this.toVisNode(node, this.config.node.caption);
            this.nodeDataSet[node.id] = visNode;
          }
        } else {
          let visNode = this.toVisNode(node, this.config.node.caption);
          this.nodeDataSet[visNode.id] = visNode;
          this.addedNodes.add(node.id);
        }
        this.nodeMap[node.id] = node;
        this.deletedNodes.delete(node.id);
        if(node.location) {
          for(let i = node.location.start.line; i <= node.location.end.line; i++) {
            if(i < node.location.end.line || node.location.end.column > 1)
              this.nodeLineMap[i] = node;
          }
          this.maxLine = Math.max(this.maxLine, node.location.end.line);
        }
      });

      this.graph.edges.forEach(edge => {
        if(this.isFilteredOutEdge(edge) || !this.nodeMap[edge.from] || !this.nodeMap[edge.to]) return;
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
          for(let i = edge.location.start.line; i <= edge.location.end.line; i++) {
            if(i < edge.location.end.line || edge.location.end.column > 1)
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
        for(let prop of Object.keys(node.properties)) {
          if(prop === fromProp || prop === toProp) {
            this.minTime = new Date(Math.min(this.minTime, new Date(node.properties[prop][0])));
            this.maxTime = new Date(Math.max(this.maxTime, new Date(node.properties[prop][0])));
          }
        }
      });
      this.timeInterval = this.maxTime - this.minTime;
    }


    if($(this.searchInput).autocomplete("instance")){
      $(this.searchInput).autocomplete( "destroy" );
    }

    if(this.config.searchCandidates) {
      if(!Array.isArray(this.config.searchCandidates) && typeof this.config.searchCandidates === 'object') {
        let candidateSource = new Set();
        if(this.config.searchCandidates.node) {
          [this.config.searchCandidates.node].flat(2).forEach(prop => {
            this.graph.nodes.map(e => e[prop] || e.properties[prop]).flat().filter(p => p).forEach(p => candidateSource.add(p));
          });
        }
        if(this.config.searchCandidates.edge) {
          [this.config.searchCandidates.edge].flat(2).forEach(prop => {
            this.graph.edges.map(e => e[prop] || e.properties[prop]).flat().filter(p => p).forEach(p => candidateSource.add(p));
          });
        }
        candidateSource = Array.from(candidateSource);
        const autocompleteMax = 20;
        $(this.searchInput).autocomplete({
          select: (event, ui) => {
            blitzboard.config.onSearchInput(ui.item.value);
          },
          source: (request, response) => {
            let filtered;
            if(request.term)
              filtered = candidateSource.filter(c => c.startsWith(request.term));
            else
              filtered = candidateSource;
            filtered = filtered.slice(0, autocompleteMax);
            response(filtered);
          },
          minLength: 0
        });
      } else {
        $(this.searchInput).autocomplete({
          select: (event, ui) => {
            blitzboard.config.onSearchInput(ui.item.value);
          },
          source: this.config.searchCandidates,
          minLength: 0
        });
      }
    }

    if(this.config.layout === 'hierarchical') {
      this.computeHierarchicalPositions();
      this.sccMap = {};
    }
    else if(this.config.layout === 'hierarchical-scc') {
      this.computeHierarchicalSCCPositions();
    } else {
      this.hierarchicalPositionMap = null;
      this.sccMap = {};
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
        for(let i = node.location.start.line; i <= node.location.end.line; i++)
          if(i < node.location.end.line || node.location.end.column > 1)
            this.nodeLineMap[i] = node;
      }
      Object.keys(node.properties).filter((prop) => prop != 'degree').forEach(this.nodeProps.add, this.nodeProps);
    });
    this.graph.edges.forEach((edge) => {
      Object.keys(edge.properties).forEach(this.edgeProps.add, this.edgeProps);
    });

    this.validateGraph();

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
    } else if(this.staticLayoutMode) {
      if(!this.nodeLayout || typeof this.nodeLayout !== 'object' || Object.keys(this.nodeLayout).length === 0) {
        const d3Nodes = this.graph.nodes.map((n) => {
          return {
            id: n.id
          };
        });
        const d3Edges = this.graph.edges.filter(e => this.nodeMap[e.from] && this.nodeMap[e.to]).map(e => {
          return {
            source: e.from,
            target: e.to,
          };
        });

        const SPRING_DISTANCE = 15;

        let d3Simulation = d3Force.forceSimulation(d3Nodes)
          .force("charge", d3Force.forceManyBody())
          .force("link", d3Force.forceLink(d3Edges).id((n) => n.id).distance(SPRING_DISTANCE))
          .force("centralGravityX", d3Force.forceX().strength(0.5))
          .force("centralGravityY", d3Force.forceY().strength(0.5));

        d3Simulation.tick(1000);

        this.nodeLayout = {};
        for(const node of d3Nodes) {
          this.nodeLayout[node.id] = {x: node.x, y: node.y, z: 0};
        }
      }
    }


    let defaultNodeProps = this.config.node.caption;
    let defaultEdgeProps = this.config.edge.caption;

    this.nodeDataSet = {};
    this.minX = Number.MAX_VALUE;
    this.maxX = -Number.MAX_VALUE;
    this.minY = Number.MAX_VALUE;
    this.maxY = -Number.MAX_VALUE;
    this.graph.nodes.forEach((node) => {
      if(this.isFilteredOutNode(node)) return;
      let visNode = this.toVisNode(node, defaultNodeProps);
      this.nodeDataSet[node.id] = visNode;
      let tmpPosition = blitzboard.nodeLayout[node.id];
      this.minY = Math.min(this.minY, tmpPosition.y);
      this.maxY = Math.max(this.maxY, tmpPosition.y);
      this.minX = Math.min(this.minX, tmpPosition.x);
      this.maxX = Math.max(this.maxX, tmpPosition.x);
      return visNode;
    });

    this.edgeMap = {};
    this.edgeDataSet = this.graph.edges.map((edge) => {
      if(this.isFilteredOutEdge(edge) || !this.nodeDataSet[edge.from] || !this.nodeDataSet[edge.to])
        return null;

      let id = this.toNodePairString(edge);
      while(this.edgeMap[id]) {
        id += '_';
      }
      let visEdge = this.toVisEdge(edge, defaultEdgeProps, id);
      this.edgeMap[visEdge.id] = edge;
      if(edge.location) {
        for(let i = edge.location.start.line; i <= edge.location.end.line; i++)
          if(i < edge.location.end.line || edge.location.end.column > 1)
            this.edgeLineMap[i] = visEdge;
      }
      return visEdge;
    });

    this.edgeDataSet = this.edgeDataSet.filter(e => e); // remove null

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
        dragNodes: this.config.layout !== 'map' && this.config.layout !== 'hierarchical-scc',
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
          springConstant: this.config.layout === 'timeline' ? 0.004 : 0.016,
          gravitationalConstant: -4000,
        },
        stabilization: {
          enabled: this.config.layout === 'hierarchical-scc',
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

    this.nodeData = Object.values(this.nodeDataSet);
    this.updateLayers();
    this.updateViews();

    this.clusterSCC();

    this.container.addEventListener('keydown', (e) => {
      // Key 0
      if(e.keyCode === 48) {
        blitzboard.fit();
        e.preventDefault();
      }
    });

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

    this.updateSCCStatus();

    for(let callback of this.onUpdated) {
      callback();
    }
  }

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
      getSize: n => n._size / Blitzboard.defaultNodeSize * 6 * (this.config.layout === 'map' ? 100 : 1),
      sizeUnits: sizeUnits,
      getColor: n => ([255, 0, 0]),
      sizeMinPixels: Blitzboard.minNodeSizeInPixels,
      updateTriggers: {
        getIcon: [Blitzboard.loadedIcons],
      }
    });
  }

  updateSCCStatus() {
    if(this.config.layout === 'hierarchical-scc') {
      switch(this.config.sccMode) {
        case 'expand':
          this.expandSCC();
          break;
        case 'cluster':
          this.clusterSCC();
          break;
        case 'only-scc':
          this.hideExceptSCC();
          break;
      }
    }
  }

  clusterSCC() {
    for(let clusterId of Object.values(this.sccMap)) {
      let position = this.hierarchicalPositionMap[clusterId];
      let clusterOptions = {
        joinCondition: function(n) {
          return n.clusterId === clusterId;
        },
        clusterNodeProperties: {
          id: clusterId,
          color: Blitzboard.SCCColor,
          x: position.x,
          y: position.y,
          fixed: true,
          shape: 'dot',
          label: clusterId
        }
      };
      this.network.cluster(clusterOptions);
    }
  }

  expandSCC() {
    let nodeIndices = new Set(this.network.clustering.body.nodeIndices);

    for(let clusterId of Array.from(new Set(Object.values(this.sccMap)))) {
      if(!nodeIndices.has(clusterId))
        continue;
      this.network.openCluster(clusterId);
    }
    this.network.stabilize(100);
  }

  showHiddenNodes() {
    let toBeUpdated = [];
    for(let node of this.nodeDataSet._data.values()) {
      if(node.hidden)
        toBeUpdated.push({id: node.id, hidden: false});
    }
    this.nodeDataSet.update(toBeUpdated);
  }

  hideExceptSCC() {
    this.expandSCC();
    let toBeUpdated = [];
    for(let node of this.nodeDataSet._data.values()) {
      if(node.clusterId >= 0)
        toBeUpdated.push({id: node.id, hidden: true});
    }
    this.nodeDataSet.update(toBeUpdated);
  }

  scrollNodeIntoView(node, select = true) {
    if(typeof (node) === 'string')
      node = this.nodeDataSet[node];
    else
      node = this.nodeDataSet[node.id];
    if(!node)
      return;

    if(select) {
      this.selectedNodes.clear();
      this.selectedEdges.clear();
      this.selectedNodes.add(node.id);
      this.updateLayers();
    }

    this.scrollNetworkToPosition(node);
    for(let callback of this.onNodeFocused) {
      // TODO: The argument should be proxy instead of plain objects
      callback(node);
    }
  }

  scrollNetworkToPosition(position) {

    if(this.config.layout === 'map') {
      this.network.setProps({
        initialViewState: {
          latitude: position.y,
          longitude: position.x,
          zoom: 13,
          pitch: Blitzboard.pitch,
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
    // this.nodeDataSet.update(nodePositions);
  }


  scrollEdgeIntoView(edge, select = true) {
    if(typeof (edge) === 'string') {
      edge = this.edgeMap[edge];
    }

    const from = this.nodeLayout[edge.from];
    const to = this.nodeLayout[edge.to];
    this.scrollNetworkToPosition({x: (from.x + to.x) / 2, y: (from.y + to.y) / 2});
    if(select) {
      this.selectedNodes.clear();
      this.selectedEdges.clear();
      this.selectedEdges.add(edge.id);
      this.updateLayers();
    }

    for(let callback of this.onEdgeFocused) {
      // TODO: The argument should be proxy instead of plain objects
      callback(edge);
    }
  }

  showLoader() {
    this.screen.style.display = 'flex';
    this.screenText.style.display = 'block';
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

function convertToHyperLinkIfURL(text) {
  if(!text)
    return text;
  if(Array.isArray(text))
    text = text[0];
  if(text.startsWith('http://') || text.startsWith('https://')) {
    return `<a target="_blank" href="${text}">${wrapText(text)}</a>`;
  }
  return wrapText(text);
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

function isDateString(str) {
  return isNaN(str) && !isNaN(Date.parse(str))
}
