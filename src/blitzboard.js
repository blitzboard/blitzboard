require('@iconify/iconify');
require('./pg_parser_browserified.js');
require('./scc.js');
const DeckGL = require('@deck.gl/core');
require('../css/blitzboard.css')
require('../css/ContextMenu.css')
const utilModule = require('./util.js')
const renderingModule = require('./rendering.js');
const layoutModule = require('./layout.js');
const apiModule = require('./api.js');
const UIModule = require('./ui.js');

const $ = require('jquery');
require('jquery-ui-bundle');
require('jquery-ui-bundle/jquery-ui.css');

class Blitzboard {
  static SCCColor = '#edc821';
  static selectedNodeColor = [0x21, 0x56, 0xee];
  static zoomLevelToLoadImage = 2.0;
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
      width: 1
    },
    zoom: {
      max: 3.0,
      min: 0.25,
    },
    layoutSettings: {
      time_from: 'from',
      time_to: 'to',
      lng: 'lng',
      lat: 'lat',
      x: 'x',
      y: 'y'
    },
    dimensions: 2,
    style: "border: solid 1px #E6E6E6; background: radial-gradient(white, #E6E6E6);",
    extraOptions: {
    },
  };
  static iconPrefixes = ['fa-solid:', 'ion:', 'bx:bx-', 'gridicons:', 'akar-icons:'];
  static edgeDelimiter = '-';

  static loadedIcons = {};

  constructor(container) {
    this.container = container;
    this.nodeColorMap = {};
    this.nodeMap = {};
    this.config = Blitzboard.defaultConfig;
    this.baseConfig = this.config;
    this.edgeMap = {};
    this.warnings = [];
    this.sccMode = 'cluster';
    this.configChoice = null;
    this.nodeLayout = {};
    this.hoveredNodes = new Set();
    this.hoveredEdges = new Set();
    this.selectedNodes = new Set();
    this.selectedEdges = new Set();
    this.clientIsMacLike = /(Mac|iPhone|iPod|iPad)/i.test( navigator.userAgentData?.platform || '');

    this.container.style.position = 'absolute';

    this.networkOriginalStyle = `
      height: 100%;
      width: 100%;
      top: 0;
      left: 0;
      position: absolute;
      z-index: 0;
    `;

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
    this.doubleClickTimer = null;

    let blitzboard = this;


    this.network = new DeckGL.Deck({
      parent: this.container,
      controller: {doubleClickZoom: false},
      getTooltip: (elem) => {
        if(blitzboard.contextMenu.isOpened || !elem?.object)
          return null;
        return {
          html: elem.object._title
        }
      },
      onViewStateChange: (viewState) => {
        const viewport = blitzboard.network.getViewports()[0];
        if(viewport) {
          const [left, top] = viewport.unproject([0, 0]);
          const [right, bottom] = viewport.unproject([viewport.width, viewport.height]);
          this.visibleBounds = {
            left, top, bottom, right
          };
        }
        this.viewState = viewState.viewState;
        this.updateThumbnailLayer();
        this.network.setProps({
          layers: this.layers
        });
      },
      onClick: (event, info) => blitzboard.onLayerClick(event, info),
      initialViewState: {
        target: [0, 0],
        zoom: 1
      },
      views: [new DeckGL.OrthographicView()],
      layers: [],
    });

    this.initializeUI();
  }


  isFilteredOutNode(node) {
    if(this.config.node.filter)
      return !this.config.node.filter(new Proxy(node, this.blitzProxy));
    return false;
  }

  isFilteredOutEdge(edge) {
    if(this.config.edge.filter) {
      return !this.config.edge.filter(new Proxy(edge, this.blitzProxy));
    }
    return false;
  }

  update(applyDiff = true, afterUpdate = null) {
    this.shouldAbortLayout = true;
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

    let blitzboard = this;

    this.filteredGraph = {};
    this.filteredGraph.nodes = this.graph.nodes.filter((node) => !blitzboard.isFilteredOutNode(node));

    this.filteredGraph.edges = this.graph.edges.filter((edge) => !blitzboard.isFilteredOutEdge(edge) || !blitzboard.nodeDataSet[edge.from] || !blitzboard.nodeDataSet[edge.to]);

    this.updateSearchInput();

    this.graph.nodes.forEach((node) => {
      this.nodeMap[node.id] = node;
    });

    this.validateGraph();
    this.determineLayout(afterUpdate);
  }

  resetView(afterUpdate = null) {
    this.nodeDataSet = {};
    this.minX = Number.MAX_VALUE;
    this.maxX = -Number.MAX_VALUE;
    this.minY = Number.MAX_VALUE;
    this.maxY = -Number.MAX_VALUE;
    this.filteredGraph.nodes.forEach((node) => {
      let visNode = this.toVisNode(node);
      this.nodeDataSet[node.id] = visNode;
      let tmpPosition = this.nodeLayout[node.id];
      this.minY = Math.min(this.minY, tmpPosition.y);
      this.maxY = Math.max(this.maxY, tmpPosition.y);
      this.minX = Math.min(this.minX, tmpPosition.x);
      this.maxX = Math.max(this.maxX, tmpPosition.x);
      return visNode;
    });

    const MINIMUM_AREA = 10;
    if(this.maxX - this.minX < MINIMUM_AREA) {
      this.maxX = this.minX + MINIMUM_AREA / 2;
      this.minX -= MINIMUM_AREA / 2;
    }
    if(this.maxY - this.minY < MINIMUM_AREA) {
      this.maxY = this.minY + MINIMUM_AREA / 2;
      this.minX -= MINIMUM_AREA / 2;
    }

    this.edgeMap = {};
    this.edgeDataSet = this.filteredGraph.edges.map((edge) => {
      // Create edge id from pair of nodes
      let id = `${edge.from}${Blitzboard.edgeDelimiter}${edge.to}`;
      while(this.edgeMap[id]) {
        id += '_';
      }
      let visEdge = this.toVisEdge(edge, id);
      this.edgeMap[visEdge.id] = edge;
      return visEdge;
    });

    this.edgeDataSet = this.edgeDataSet.filter(e => e !== null);

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

    let layout = {};

    if(this.config.layout === 'hierarchical') {
      layout.hierarchical = this.config.layoutSettings;
    } else {
      layout.hierarchical = false;
    }

    this.network.setProps({layers: []});

    this.nodeData = Object.values(this.nodeDataSet);
    this.updateLayers();
    this.clusterSCC();
    this.updateViews();
    this.updateSCCStatus();

    if(afterUpdate) {
      afterUpdate();
    }

    for(let callback of this.onUpdated) {
      callback();
    }
  }
}

class DuplicateNodeError extends Error {
  constructor(nodes) {
    super(`Duplicate node: ${nodes.map(n => n.id).join(', ')}`);
    this.name = "NodeDuplicationError";
    this.nodes = nodes;
  }
}



for(let module of [utilModule, renderingModule, layoutModule, apiModule, UIModule]) {
  for(let [key, value] of Object.entries(module)) {
    Blitzboard.prototype[key] = value;
  }
}

module.exports = Blitzboard;
module.exports.DuplicateNodeError = DuplicateNodeError;