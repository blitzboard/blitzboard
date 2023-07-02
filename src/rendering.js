const DeckGL = require("@deck.gl/core");
const DeckGLLayers = require("@deck.gl/layers");
const DeckGLGeoLayers = require("@deck.gl/geo-layers");
const DeckGLExtensions = require("@deck.gl/extensions");
const {
  getRandomColor,
  getHexColors,
  createLabelText,
  createTitle,
  retrieveHttpUrl,
  getColorFromText,
} = require("./util");

const defaultNodeSize = 5;
const defaultEdgeWidth = 1;
const highlightedNodeRadiusRate = 1.2;
const edgeArrowOffset = 0.2;

function edgeIsDirected(edge) {
  return (
    edge.direction === "->" ||
    edge.undirected === "false" ||
    edge.undirected === false
  );
}

function edgeArrowPosition(fromNode, toNode, scale, offset = edgeArrowOffset) {
  let { x: fromX, y: fromY, z: fromZ } = fromNode;
  let { x: toX, y: toY, z: toZ } = toNode;

  let angle = Math.atan2(fromY - toY, fromX - toX);
  let nodeSize = toNode._size;
  return [
    toX + Math.cos(angle) * (nodeSize * scale + offset),
    toY + Math.sin(angle) * (nodeSize * scale + offset),
    (fromZ + toZ) / 2,
  ];
}

class TimeLineLayer extends DeckGL.CompositeLayer {
  static layerName = "TimeLineLayer";
  static defaultProps = {
    id: "timeline-layer",
    verticalPosition: 0,
    tickSize: 20,
    timeForOneUnitLength: 1,
    centerTime: 0,
    timeUnit: "year",
  };
  renderLayers() {
    const coordinateSystem = DeckGL.COORDINATE_SYSTEM.CARTESIAN;
    const sizeUnits = "common";
    let props = this.props;

    function computePosition(timePoint) {
      // each timePoint should be DateTime
      let x =
        (timePoint.getTime() - props.centerTime) / props.timeForOneUnitLength;
      return [x, props.verticalPosition, 0];
    }

    return [
      new DeckGLLayers.LineLayer({
        id: `${props.id}-line`,
        coordinateSystem,
        billboard: true,
        data: props.data,
        getWidth: 1,
        getSourcePosition: computePosition,
        getTargetPosition: (timePoint) => {
          let [x, y, z] = computePosition(timePoint);
          return [x, y + props.tickSize, z];
        },
        getColor: [0, 0, 0, 255],
        widthUnits: "common",
        widthMaxPixels: 1,
        updateTriggers: {
          getSourcePosition: props.verticalPosition,
          getTargetPosition: [props.verticalPosition, props.tickSize],
        },
      }),

      new DeckGLLayers.TextLayer({
        id: `${props.id}-text`,
        data: props.data,
        getPosition: (timePoint) => {
          let [x, y, z] = computePosition(timePoint);
          return [x, y, z];
        },
        getText: (timePoint) => {
          if (props.timeUnit === "year") {
            return timePoint.getFullYear().toString();
          } else if (props.timeUnit === "month") {
            return timePoint.toLocaleDateString(undefined, {
              year: "numeric",
              month: "numeric",
            });
          } else if (props.timeUnit === "day") {
            return timePoint.toLocaleDateString();
          } else if (props.timeUnit === "hour") {
            return timePoint.toLocaleString(undefined, {
              hour: "numeric",
              minute: "numeric",
            });
          } else {
            return timePoint.toLocaleString(undefined, {
              hour: "numeric",
              minute: "numeric",
              second: "numeric",
            });
          }
        },
        sizeMaxPixels: 15,
        sizeMinPixels: 15,
        billboard: true,
        getAngle: 0,
        getTextAnchor: "middle",
        getColor: [0, 0, 0, 255],
        getAlignmentBaseline: "top",
        coordinateSystem,
        sizeUnits: sizeUnits,
        outlineWidth: 8,
        background: [255, 255, 255, 255],
        lineHeight: 1.2,
        outlineColor: [255, 255, 255, 192],
        fontSettings: {
          sdf: true,
          radius: 16,
          smoothing: 0.2,
        },
        updateTriggers: {
          getPosition: props.verticalPosition,
          getText: props.timeUnit,
        },
      }),
    ];
  }
}

class NodeLayer extends DeckGL.CompositeLayer {
  static layerName = "NodeLayer";
  static defaultProps = {
    id: "node-layer",
    forMap: false,
    forTimeLine: false,
    textVisible: true,
    pickable: true,
    getNodePosition: { type: "accessor", value: (n) => [n.x, n.y, n.z] },
    onHover: { type: "accessor", value: (info) => {} },
    scale: 1.0,
    minNodeSizeInPixels: null,
    invisibleNodes: [],
  };
  renderLayers() {
    let characterSet = new Set();
    const coordinateSystem = this.props.forMap
      ? DeckGL.COORDINATE_SYSTEM.LNGLAT
      : DeckGL.COORDINATE_SYSTEM.CARTESIAN;
    const sizeUnits = this.props.forMap ? "meters" : "common";
    const scale = 0.2;
    const fontSize = 3;
    const billboard = !this.props.forMap;
    let props = this.props;
    let forMap = this.props.forMap;

    this.props.data.forEach((n) => {
      n.label.split("").forEach((c) => characterSet.add(c));
    });

    const thumbnailLayers = [];
    let nodeWithThumbnails = this.props.data.filter((n) => n.imageURL);
    const chunkSize = 1000;
    for (let i = 0; i < nodeWithThumbnails.length; i += chunkSize) {
      const chunk = nodeWithThumbnails.slice(i, i + chunkSize);
      thumbnailLayers.push(
        new DeckGLLayers.IconLayer({
          id: `${this.props.id}-thumbnail-layer-${i}`,
          data: chunk,
          getPosition: this.props.getNodePosition,
          getIcon: (node) => ({
            url: node.imageURL,
            width: 100,
            height: 100,
          }),
          sizeScale: scale,
          forMap,
          getSize: (n) =>
            props.forTimeLine
              ? 1
              : (n._size / defaultNodeSize) * 10 * (props.forMap ? 100 : 1),
          sizeUnits: sizeUnits,
          pickable: true,
          getCollisionPriority: (node) => node._size,
          collisionGroup: "thumbnail",
          collisionTestProps: {
            sizeScale: 15 * this.props.scale,
            sizeUnits: "pixels",
            getSize: Blitzboard.minImageSizeInPixels * 2,
          },
          sizeMinPixels: Blitzboard.minImageSizeInPixels,
          extensions: [new DeckGLExtensions.CollisionFilterExtension()],
          updateTriggers: {
            getPosition: props.updateTriggers.getNodePosition,
          },
        })
      );
    }

    return [
      new DeckGLLayers.TextLayer({
        id: `${props.id}-text`,
        data: props.data,
        pickable: true,
        getPosition: (node) => {
          if (props.invisibleNodes.includes(node.id)) {
            // FIXME: instead of change visibility, move far away
            return [Number.MAX_VALUE, Number.MAX_VALUE, 0];
          }
          let [x, y, z] = props.getNodePosition(node);
          return [
            x,
            y +
              (props.forMap
                ? (-0.001 * node._size) / defaultNodeSize
                : node._size * scale * this.props.scale) *
                1.1,
            z,
          ];
        },
        forMap,
        getText: (node) => node.label,
        getSize: (n) =>
          (n._size / defaultNodeSize) * fontSize * (props.forMap ? 100 : 1),
        sizeMaxPixels: 30,
        sizeMinPixels: 10,
        billboard,
        getAngle: 0,
        getTextAnchor: "middle",
        getColor: [0x33, 0x33, 0x33, 255],
        getAlignmentBaseline: "top",
        coordinateSystem,
        sizeUnits: sizeUnits,
        sizeScale: scale,
        visible: props.textVisible,
        outlineWidth: 8,
        lineHeight: 1.2,
        characterSet,
        outlineColor: [255, 255, 255, 192],
        fontSettings: {
          sdf: true,
          radius: 16,
          smoothing: 0.2,
        },
        updateTriggers: {
          getPosition: [
            props.updateTriggers.getNodePosition,
            props.invisibleNodes,
          ],
        },
      }),

      new DeckGLLayers.ScatterplotLayer({
        id: `${props.id}-scatterplot`,
        data: props.data,
        pickable: true,
        opacity: 1, // TODO
        stroked: false,
        filled: true,
        billboard,
        forMap,
        coordinateSystem,
        getPosition: props.getNodePosition,
        getRadius: (n) => {
          let radius = props.forTimeLine
            ? 0.001
            : n._size * (props.forMap ? 100 : 1) * this.props.scale; // TODO: avoid magic number
          return radius;
        },
        radiusMinPixels:  props.forTimeLine ? Blitzboard.minTimelineNodeSizeInPixels : Blitzboard.minNodeSizeInPixels,
        radiusScale: scale,
        getFillColor: (n) => {
          if (props.invisibleNodes.includes(n.id)) {
            return [0, 0, 0, 0];
          }
          return n.color;
        },
        radiusUnits: sizeUnits,
        updateTriggers: {
          getPosition: props.updateTriggers.getNodePosition,
          getFillColor: props.invisibleNodes,
        },
      }),

      new DeckGLLayers.IconLayer({
        id: `${props.id}-icon`,
        data: props.data,
        pickable: false,
        coordinateSystem,
        billboard,
        forMap,
        getIcon: (n) => {
          if (n.iconLabel && Blitzboard.loadedIcons[n.iconLabel]) {
            return {
              url: Blitzboard.loadedIcons[n.iconLabel],
              width: 240,
              height: 240,
              mask: true,
            };
          }
          return {
            url: "data:image/svg+xml;charset=utf-8,dummy", // dummy icon to avoid exception
            width: 24,
            height: 24,
            mask: true,
          };
        },
        sizeScale: scale,
        getPosition: props.getNodePosition,
        getSize: (n) =>
          (n._size / defaultNodeSize) *
          6 *
          (props.forMap ? 100 : 1) *
          this.props.scale,
        sizeUnits: sizeUnits,
        getColor: [255, 255, 255, 232],
        sizeMinPixels: Blitzboard.minNodeSizeInPixels * 1.2,
        updateTriggers: {
          getPosition: this.props.updateTriggers.getNodePosition,
          getIcon: this.props.updateTriggers.getIcon,
        },
      }),
      ...thumbnailLayers,
    ];
  }
}

function computeTimesToPlot(startTime, endTime, interval, intervalUnit) {
  let currentTime = new Date(startTime);
  switch (intervalUnit) {
    case "year":
      currentTime = new Date(
        currentTime.getFullYear() - (currentTime.getFullYear() % interval),
        0,
        1
      );
      break;
    case "month":
      currentTime = new Date(
        currentTime.getFullYear(),
        currentTime.getMonth() - (currentTime.getMonth() % interval),
        1
      );
      break;
    case "day":
      currentTime = new Date(
        currentTime.getFullYear(),
        currentTime.getMonth(),
        currentTime.getDate() - (currentTime.getDate() % interval)
      );
      break;
    case "hour":
      currentTime = new Date(
        currentTime.getFullYear(),
        currentTime.getMonth(),
        currentTime.getDate(),
        currentTime.getHours() - (currentTime.getHours() % interval)
      );
      break;
    case "minute":
      currentTime = new Date(
        currentTime.getFullYear(),
        currentTime.getMonth(),
        currentTime.getDate(),
        currentTime.getHours(),
        currentTime.getMinutes() - (currentTime.getMinutes() % interval)
      );

      break;
    case "second":
      currentTime = new Date(
        currentTime.getFullYear(),
        currentTime.getMonth(),
        currentTime.getDate(),
        currentTime.getHours(),
        currentTime.getMinutes(),
        currentTime.getSeconds() - (currentTime.getSeconds() % interval)
      );
    default:
      return;
  }
  let timeList = [];
  let i = 0;
  let maxLoop = 2000;
  while (currentTime < endTime && ++i < maxLoop) {
    timeList.push(new Date(currentTime));
    switch (intervalUnit) {
      case "year":
        currentTime.setFullYear(currentTime.getFullYear() + interval);
        break;
      case "month":
        currentTime.setMonth(currentTime.getMonth() + interval);
        break;
      case "day":
        currentTime.setDate(currentTime.getDate() + interval);
        break;
      case "hour":
        currentTime.setHours(currentTime.getHours() + interval);
        break;
      case "minute":
        currentTime.setMinutes(currentTime.getMinutes() + interval);
        break;
      case "second":
        currentTime.setSeconds(currentTime.getSeconds() + interval);
      default:
        return;
    }
  }
  return timeList;
}

const ANIMATION_TIME_MAX = 1000;

module.exports = {
  startEdgeAnimation() {
    if (this.animationTimerId || this.config.edge.animationDuration <= 0)
      return;
    const interval = 20;
    this.currentTime = 0;
    this.animationTimerId = setInterval(() => {
      if (
        this.highlightedTripsLayer.props.data.length === 0 ||
        this.currentTime >= ANIMATION_TIME_MAX
      ) {
        clearInterval(this.animationTimerId);
        this.animationTimerId = null;
      }
      this.currentTime +=
        (interval * ANIMATION_TIME_MAX) / this.config.edge.animationDuration;
      this.highlightedTripsLayer = this.highlightedTripsLayer.clone({
        currentTime: this.currentTime,
      });
      this.determineLayersToShow();
    }, interval);
  },

  updateLayers() {
    const coordinateSystem =
      this.config.layout === "map"
        ? DeckGL.COORDINATE_SYSTEM.LNGLAT
        : DeckGL.COORDINATE_SYSTEM.CARTESIAN;
    const sizeUnits = this.config.layout === "map" ? "meters" : "common";

    const scale = 0.2;

    let blitzboard = this;

    let tmpNodeData = this.nodeDataSet;

    tmpNodeData = Object.values(tmpNodeData);

    this.allEdgesToDraw = JSON.parse(JSON.stringify(this.edgeDataSet));

    let tmpEdgeData =
      this.config.edge.visibilityMode === "onFocus" ? [] : this.allEdgesToDraw;

    this.nodeLayerComp = new NodeLayer({
      id: "node-layer",
      data: tmpNodeData,
      forMap: this.config.layout === "map",
      forTimeLine: this.config.layout === "timeline",
      blitzboard: this,
      onHover: (info) => blitzboard.onNodeHover(info),
      getNodePosition: (n) => [
        n.x,
        n.y,
        n.z + (this.config.layout === "map" ? 20 : 0),
      ],
    });

    function edgeColor(e) {
      let color = [...e.color];
      if (
        (blitzboard.hoveredNode === e.from &&
          blitzboard.selectedNodes.size === 0) ||
        blitzboard.selectedNodes.has(e.from)
      ) {
        color = blitzboard.nodeDataSet[e.from].color;
      }
      if (
        (blitzboard.hoveredNode === e.to &&
          blitzboard.selectedNodes.size === 0) ||
        blitzboard.selectedNodes.has(e.to)
      ) {
        color = blitzboard.nodeDataSet[e.to].color;
      }
      return [color[0], color[1], color[2], 0xff];
    }

    this.edgeLayer = new DeckGLLayers.LineLayer({
      id: "line-layer",
      pickable: true,
      coordinateSystem,
      billboard: this.config.layout !== "map",
      data: tmpEdgeData,
      getWidth: (edge) => {
        return edge.width;
      },
      getSourcePosition: (edge) => {
        let { x, y, z } = this.nodeDataSet[edge.from];
        return [x, y, z];
      },
      getTargetPosition: (edge) => {
        let { x, y, z } = this.nodeDataSet[edge.to];
        if (edgeIsDirected(edge) && this.config.layout !== "timeline") {
          return edgeArrowPosition(
            this.nodeDataSet[edge.from],
            this.nodeDataSet[edge.to],
            scale,
            edgeArrowOffset * 2
          );
        }
        return [x, y, z];
      },
      getColor: edgeColor,
      updateTriggers: {
        getColor: [
          Array.from(new Set([this.hoveredNode, ...this.selectedNodes])),
          this.selectedEdges,
          this.hoveredEdges,
        ],
      },
      onHover: (info) => this.onEdgeHover(info),
      widthUnits: "common",
      widthScale:
        this.config.layout === "timeline"
          ? 0.0001
          : 0.1 * (this.config.layout === "map" ? 0.01 : 1),
      widthMinPixels: 1,
    });

    this.highlightedEdgeLayer = this.edgeLayer.clone({
      id: "highlighted-edge-layer",
      data: [],
      getWidth: (edge) => {
        if (
          blitzboard.selectedNodes.size > 0 &&
          !blitzboard.selectedNodes.has(edge.from) &&
          !blitzboard.selectedNodes.has(edge.to)
        )
          return edge.width;
        return parseFloat(edge.width) * 2;
      },
    });

    this.highlightedNodeLayer = this.nodeLayerComp.clone({
      id: "highlighted-node-layer",
      data: [],
      scale: 1.5,
      getNodePosition: (n) => {
        let candidateIdOfCenters =
          blitzboard.selectedNodes.size > 0
            ? [...blitzboard.selectedNodes]
            : blitzboard.hoveredNode
            ? [blitzboard.hoveredNode]
            : [];
        for (let centerNodeId of candidateIdOfCenters) {
          if (
            centerNodeId !== n.id &&
            blitzboard.nodesToEdges[centerNodeId].filter(
              (e) => e.from === n.id || e.to === n.id
            ).length > 0
          ) {
            let centerNode = blitzboard.nodeDataSet[centerNodeId];
            let [x, y] = blitzboard.computeVisiblePositionFromSource(
              n.x,
              n.y,
              centerNode.x,
              centerNode.y,
              n._size * scale
            );
            return [x, y, n.z];
          }
        }
        let { x, y, z } = n;
        return [x, y, z];
      },
    });

    const tripStep = 20;
    this.tripsLayer = new DeckGLGeoLayers.TripsLayer({
      id: "trips-layer",
      pickable: true,
      coordinateSystem,
      data: tmpEdgeData,
      getWidth: (edge) => edge.width,
      getPath: (edge) => {
        let { x: fromX, y: fromY } = this.nodeDataSet[edge.from];
        let { x: toX, y: toY } = this.nodeDataSet[edge.to];
        let path = [];
        for (let i = 0; i < tripStep; ++i) {
          let x = fromX + ((toX - fromX) * i) / (tripStep - 1);
          let y = fromY + ((toY - fromY) * i) / (tripStep - 1);
          path.push([x, y]);
        }
        return path;
      },
      getTimestamps: (edge) => {
        let timestamps = [];
        for (let i = 0; i < tripStep; ++i) {
          timestamps.push((i * ANIMATION_TIME_MAX) / tripStep);
        }
        return timestamps;
      },
      rounded: true,
      fadeTrail: true,
      trailLength: ANIMATION_TIME_MAX * 1.5,
      currentTime: ANIMATION_TIME_MAX,
      widthMinPixels: 4,
      getColor: (e) => {
        return [e.color[0], e.color[1], e.color[2], 192];
      },
      updateTriggers: {
        getColor: [
          Array.from(new Set([this.hoveredNode, ...this.selectedNodes])),
          this.selectedEdges,
          this.hoveredEdges,
        ],
      },
      onHover: (info) => this.onEdgeHover(info),
      widthUnits: "common",
      widthScale:
        this.config.layout === "timeline"
          ? 1e-6
          : 0.02 * (this.config.layout === "map" ? 0.01 : 1),
    });

    this.highlightedTripsLayer = this.tripsLayer.clone({
      id: "highlighted-trips-layer",
      data: [],
    });

    this.edgeArrowLayer = new DeckGLLayers.IconLayer({
      id: "edge-arrow-layer",
      data: tmpEdgeData.filter((e) => !e.undirected || e.direction === "->"),
      coordinateSystem,
      getIcon: (n) => ({
        url: this.svgToURL(
          '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" preserveAspectRatio="xMidYMid meet" viewBox="0 0 15 15"><path fill="currentColor" d="M7.932 1.248a.5.5 0 0 0-.864 0l-7 12A.5.5 0 0 0 .5 14h14a.5.5 0 0 0 .432-.752l-7-12Z"/></svg>'
        ),
        width: 240,
        height: 240,
        mask: true,
      }),
      sizeScale: 0.1,
      getPosition: (edge) => {
        let hovered =
          this.hoveredNode === edge.from ||
          this.selectedNodes.has(edge.from) ||
          this.hoveredNode === edge.to ||
          this.selectedNodes.has(edge.to);
        return edgeArrowPosition(
          this.nodeDataSet[edge.from],
          this.nodeDataSet[edge.to],
          scale,
          hovered ? edgeArrowOffset * 2 : edgeArrowOffset
        );
      },
      getAngle: (edge) => {
        let { x: fromX, y: fromY, z: fromZ } = this.nodeDataSet[edge.from];
        let { x: toX, y: toY, z: toZ } = this.nodeDataSet[edge.to];
        return (Math.atan2(-(fromY - toY), fromX - toX) * 180) / Math.PI + 90;
      },
      getSize: (edge) => {
        let size = 1 * (this.config.layout === "map" ? 100 : 1);
        if (
          this.hoveredNode === edge.from ||
          this.selectedNodes.has(edge.from) ||
          this.hoveredNode === edge.to ||
          this.selectedNodes.has(edge.to)
        ) {
          size *= 2;
        }
        return size;
      },
      sizeUnits: sizeUnits,
      sizeMinPixels: Blitzboard.minArrowSizeInPixels,
      getColor: edgeColor,
    });

    this.iconLayer = this.createIconLayer(
      tmpNodeData,
      scale,
      sizeUnits,
      coordinateSystem
    );

    this.updateThumbnailLayer(tmpNodeData, scale, sizeUnits, coordinateSystem);
    this.updateTextLayers();

    if (this.config.layout === "map") {
      this.tileLayer = new DeckGLGeoLayers.TileLayer({
        id: "TileLayer",
        data: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        maxZoom: 19,
        minZoom: 0,
        tileSize: 256,
        renderSubLayers: (props) => {
          const {
            bbox: { west, south, east, north },
          } = props.tile;

          return new DeckGLLayers.BitmapLayer(props, {
            data: null,
            image: props.data,
            bounds: [west, south, east, north],
          });
        },
        pickable: true,
      });
    } else if (this.config.layout === "timeline") {
      this.timelineLayer = new TimeLineLayer({
        data: [this.minTime],
        id: "timeline-layer",
        centerTime: (this.minTime.getTime() + this.maxTime.getTime()) / 2,
        timeForOneUnitLength: this.timeForOneUnitLength(),
      });
    }
    this.determineLayersToShow();
  },

  updateThumbnailLayer(nodeData, scale, sizeUnits, coordinateSystem) {
    this.thumbnailLayers = [];
    let nodes = nodeData.filter((n) => n.imageURL);
    const chunkSize = 1000;
    for (let i = 0; i < nodes.length; i += chunkSize) {
      const chunk = nodes.slice(i, i + chunkSize);
      this.thumbnailLayers.push(
        new DeckGLLayers.IconLayer({
          id: `thumbnail-layer-${i}`,
          data: chunk,
          getPosition: (node) => [node.x, node.y],
          getIcon: (node) => ({
            url: node.imageURL,
            width: 100,
            height: 100,
          }),
          getSize: (n) =>
            (n._size / defaultNodeSize) *
            10 *
            (this.config.layout === "map" ? 100 : 1),
          sizeScale: scale,
          sizeUnits: sizeUnits,
          pickable: true,
          getCollisionPriority: (node) => node._size,
          collisionGroup: "thumbnail",
          collisionTestProps: {
            sizeScale: 15,
            sizeUnits: "pixels",
            getSize: Blitzboard.minImageSizeInPixels * 2,
          },
          onHover: (info) => this.onNodeHover(info),
          sizeMinPixels: Blitzboard.minImageSizeInPixels,
          extensions: [new DeckGLExtensions.CollisionFilterExtension()],
        })
      );
    }
  },

  refreshIconLayer() {
    if (!this.nodeLayerComp) return;

    // Refresh variables to trigger update of icons
    Blitzboard.loadedIcons = { ...Blitzboard.loadedIcons };
    this.nodeLayerComp = this.nodeLayerComp.clone({
      updateTriggers: {
        getIcon: Blitzboard.loadedIcons,
      },
    });
    this.determineLayersToShow();
  },

  iconRegisterer(name) {
    let blitzboard = this;
    return (icons) => {
      if (Blitzboard.loadedIcons[name] !== "retrieving") return;
      if (icons.length > 0) {
        let icon = null;
        function findIconWithHighestPriority(icons) {
          for (let prefix of Blitzboard.iconPrefixes) {
            for (let i of icons) {
              if (`${i.prefix}:${i.name}`.startsWith(prefix)) {
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
          color: "rgba(255, 255, 255, 0.8)",
        });
        let img = new Image();
        img.src = blitzboard.svgToURL(svg.outerHTML);
        Blitzboard.loadedIcons[name] = img.src;
        blitzboard.refreshIconLayer();
      }
    };
  },

  svgToURL(svg) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  },

  shouldHighlight(elem) {
    if (elem.from) {
      // For edge
      if (this.config.edge.canFocus && this.hoveredEdges.has(elem.id))
        return true;
      return (
        this.hoveredNode === elem.from ||
        this.hoveredNode === elem.to ||
        this.selectedNodes.has(elem.from) ||
        this.selectedNodes.has(elem.to)
      );
    } else {
      return this.hoveredNode === elem.id || this.selectedNodes.has(elem.id);
    }
  },

  // TODO: consider name of function
  computeVisiblePositionFromSource(targetX, targetY, sourceX, sourceY, margin) {
    let x = targetX;
    let y = targetY;
    if (x < this.visibleBounds.left + margin) {
      let rate = (this.visibleBounds.left + margin - x) / (sourceX - x);
      // set rate from 0 to 1
      rate = Math.min(Math.max(rate, 0), 1);
      x = sourceX - (sourceX - x) * (1 - rate);
      y = sourceY - (sourceY - y) * (1 - rate);
    } else if (x > this.visibleBounds.right - margin) {
      let rate = (this.visibleBounds.right - margin - x) / (sourceX - x);
      rate = Math.min(Math.max(rate, 0), 1);
      x = sourceX - (sourceX - x) * (1 - rate);
      y = sourceY - (sourceY - y) * (1 - rate);
    }

    if (y < this.visibleBounds.top + margin) {
      let rate = (this.visibleBounds.top + margin - y) / (sourceY - y);
      rate = Math.min(Math.max(rate, 0), 1);
      y = sourceY - (sourceY - y) * (1 - rate);
      x = sourceX - (sourceX - x) * (1 - rate);
    } else if (y > this.visibleBounds.bottom - margin) {
      let rate = (this.visibleBounds.bottom - margin - y) / (sourceY - y);
      rate = Math.min(Math.max(rate, 0), 1);
      y = sourceY - (sourceY - y) * (1 - rate);
      x = sourceX - (sourceX - x) * (1 - rate);
    }
    return [x, y];
  },

  updateTextLayers() {
    const coordinateSystem =
      this.config.layout === "map"
        ? DeckGL.COORDINATE_SYSTEM.LNGLAT
        : DeckGL.COORDINATE_SYSTEM.CARTESIAN;
    const sizeUnits = this.config.layout === "map" ? "meters" : "common";

    const scale = 0.2;

    let highlightedNodes = new Set([this.hoveredNode, ...this.selectedNodes]);

    let tmpNodeData = this.nodeDataSet;

    tmpNodeData = Object.values(tmpNodeData);

    tmpEdgeData = JSON.parse(JSON.stringify(this.edgeDataSet));

    const fontSize = 3;

    let characterSet = new Set();
    tmpNodeData.forEach((n) => {
      n.label.split("").forEach((c) => characterSet.add(c));
    });

    this.nodeTextLayer = new DeckGLLayers.TextLayer({
      id: "node-text-layer",
      pickable: true,
      data: tmpNodeData,
      getPosition: (node) => {
        return [
          node.x,
          node.y +
            (this.config.layout === "map"
              ? (-0.001 * node._size) / defaultNodeSize
              : node._size * scale) *
              highlightedNodeRadiusRate,
          node.z,
        ];
      },
      getText: (node) => node.label,
      getSize: (n) =>
        (n._size / defaultNodeSize) *
        fontSize *
        (this.config.layout === "map" ? 100 : 1),
      sizeMaxPixels: 30,
      sizeMinPixels: 10,
      billboard: this.config.layout !== "map",
      getAngle: 0,
      getTextAnchor: "middle",
      // set text color to #333333
      getColor: (node) => [0x33, 0x33, 0x33, 255],
      getAlignmentBaseline: "top",
      coordinateSystem,
      sizeUnits: sizeUnits,
      sizeScale: scale,
      visible: this.viewState?.zoom > this.config.zoomLevelForText,
      outlineWidth: 8,
      lineHeight: 1.2,
      characterSet,
      outlineColor: [255, 255, 255, 192],
      fontSettings: {
        sdf: true,
        radius: 16,
        smoothing: 0.2,
      },
    });

    let blitzboard = this;

    function edgeTextColor(e) {
      let color = [...e.color];
      if (
        blitzboard.hoveredNode === e.from ||
        blitzboard.selectedNodes.has(e.from)
      ) {
        color = blitzboard.nodeDataSet[e.from].color;
      } else if (
        blitzboard.hoveredNode === e.to ||
        blitzboard.selectedNodes.has(e.to)
      ) {
        color = blitzboard.nodeDataSet[e.to].color;
      } else {
        color = [color[0] - 20, color[1] - 20, color[2] - 20];
      }

      return [color[0], color[1], color[2], 0xff];
    }

    this.edgeTextLayer = new DeckGLLayers.TextLayer({
      id: "edge-text-layer",
      data: tmpEdgeData,
      pickable: true,
      getPosition: (edge) => {
        let { x: fromX, y: fromY, z: fromZ } = this.nodeDataSet[edge.from];
        let { x: toX, y: toY, z: toZ } = this.nodeDataSet[edge.to];
        return [(fromX + toX) / 2, (fromY + toY) / 2, (fromZ + toZ) / 2];
      },
      getText: (edge) => edge.label,
      getSize: fontSize * (this.config.layout === "map" ? 100 : 1),
      sizeMaxPixels: 30,
      sizeMinPixels: 12,
      sizeScale: scale,
      getColor: edgeTextColor,
      billboard: this.config.layout !== "map",
      getAngle: 0,
      getTextAnchor: "middle",
      getAlignmentBaseline: "top",
      coordinateSystem,
      sizeUnits: sizeUnits,
      onHover: (info) => this.onEdgeHover(info),
      outlineWidth: 8,
      lineHeight: 1.2,
      outlineColor: [255, 255, 255, 192],
      characterSet: "auto",
      fontSettings: {
        sdf: true,
        radius: 16,
        smoothing: 0.2,
      },
    });
  },

  toClusterNode(pgNodeIds, props, extraOptions = null) {
    let nodes = pgNodeIds.map((id) => this.nodeMap[id]);
    let color = Blitzboard.SCCColor;

    let rgb = getHexColors(color);

    return {
      objectType: "node",
      id: nodes[0].id,
      color: rgb,
      label: nodes.map((node) => createLabelText(node, props)).join("\n"),
      shape: "dot",
      _size: nodes[0].size,
      _title: nodes.map((node) => createTitle(node)).join("\n"),
      borderWidth: 1,
      x: x,
      y: y,
      z: z,
    };
  },

  toVisNode(pgNode, extraOptions = null) {
    const group = [...pgNode.labels].sort().join("_");
    if (!this.nodeColorMap[group]) {
      this.nodeColorMap[group] = getColorFromText(group);
    }
    let props = this.config.node.caption;

    let x, y, z, fixed, width;

    fixed = true;
    try {
      ({ x, y, z = 0 } = this.nodeLayout[pgNode.id]);
    } catch {
      this.nodeLayout[pgNode.id] = { x: 0, y: 0, z: 0 };
      ({ x, y, z = 0 } = this.nodeLayout[pgNode.id]);
    }
    width = null;

    let url = retrieveHttpUrl(pgNode);
    let thumbnailUrl = this.retrieveThumbnailUrl(pgNode);

    let color = this.retrieveConfigProp(pgNode, "node", "color");

    let opacity = parseFloat(
      this.retrieveConfigProp(pgNode, "node", "opacity")
    );
    let size = parseFloat(this.retrieveConfigProp(pgNode, "node", "size"));
    let tooltip = this.retrieveConfigProp(pgNode, "node", "title");

    color = color || this.nodeColorMap[group];

    if (pgNode.clusterId) {
      color = getColorFromText("yellow");
    }

    let rgb = getHexColors(color);

    let attrs = {
      objectType: "node",
      id: pgNode.id,
      _size: size || defaultNodeSize,
      color: rgb,
      opacity,
      label: createLabelText(pgNode, props),
      shape: "dot",
      _title: tooltip != null ? tooltip : createTitle(pgNode),

      borderWidth: url ? 3 : 1,
      url: url,
      x: x,
      y: y,
      z: z,
      chosen: this.retrieveConfigProp(pgNode, "node", "chosen"),
      font: {
        color: url ? "blue" : "black",
        strokeWidth: 2,
      },
      fixedByTime: fixed,
    };

    if (this.config.layout !== "map") {
      attrs.size = attrs._size;
    }

    let otherProps = this.retrieveConfigPropAll(pgNode, "node", [
      "color",
      "size",
      "opacity",
      "title",
      "thumbnail",
    ]);

    for (let key of Object.keys(otherProps)) {
      attrs[key] = otherProps[key] || attrs[key];
    }

    let blitzboard = this;

    function registerIcon(icons, label) {
      let lowerLabel = label.toLowerCase();
      if (!Blitzboard.loadedIcons[lowerLabel]) {
        Blitzboard.loadedIcons[lowerLabel] = "retrieving"; // Avoid duplication of loading
        setTimeout(
          () => Iconify.loadIcons(icons, blitzboard.iconRegisterer(lowerLabel)),
          1000
        );
      }
      attrs["iconLabel"] = lowerLabel;
    }

    for (let label of pgNode.labels) {
      let icon;
      if ((icon = this.config.node.icon?.[label])) {
        registerIcon([icon], label);
        break;
      }
    }

    if (!attrs["iconLabel"] && this.config.node.icon?.["_default"]) {
      registerIcon(
        this.config.node.icon["_default"],
        pgNode.labels.length > 0 ? pgNode.labels[0] : "_default"
      );
    }

    if (
      !attrs["iconLabel"] &&
      (this.config.node.defaultIcon || this.config.node.autoIcon) &&
      pgNode.labels.length > 0
    ) {
      let lowerLabel = pgNode.labels[0].toLowerCase();
      registerIcon(
        Blitzboard.iconPrefixes.map((prefix) => prefix + lowerLabel),
        lowerLabel
      );
    }

    if (thumbnailUrl) {
      attrs.imageURL = thumbnailUrl;
    }
    attrs = Object.assign(attrs, extraOptions);
    return attrs;
  },

  retrieveProp(pgElem, config, loadFunction = true) {
    if (typeof config === "function" && loadFunction) {
      return config(new Proxy(pgElem, this.blitzProxy));
    } else if (typeof config === "string" && config.startsWith("@")) {
      return pgElem.properties[config.substr(1)]?.[0];
    }
    return config; // return as constant
  },

  retrieveConfigProp(pgElem, type, propName, loadFunction = true) {
    const labels = pgElem.labels.join("_");
    let propConfig = this.config?.[type][propName];
    if (typeof propConfig === "object") {
      return this.retrieveProp(pgElem, propConfig[labels], loadFunction);
    }
    return this.retrieveProp(pgElem, propConfig, loadFunction);
  },

  retrieveConfigPropAll(pgElem, type, except) {
    let keys = Object.keys(this.config?.[type]);
    let props = {};
    for (let key of keys) {
      if (except.includes(key)) continue;
      // TODO: How can we allow functions for arbitrary config?
      props[key] = this.retrieveConfigProp(pgElem, type, key, false);
    }
    return props;
  },

  toVisEdge(pgEdge, id) {
    let props = this.config.edge.caption;
    const edgeLabel = pgEdge.labels.join("_");
    let color = this.retrieveConfigProp(pgEdge, "edge", "color");
    let opacity =
      parseFloat(this.retrieveConfigProp(pgEdge, "edge", "opacity")) || 1;
    let width = parseFloat(this.retrieveConfigProp(pgEdge, "edge", "width"));
    let tooltip = this.retrieveConfigProp(pgEdge, "edge", "title");

    let rgb = color
      ? getHexColors(color)
      : this.config.layout === "map"
      ? [32, 64, 255]
      : [0xcc, 0xcc, 0xcc];
    let smooth =
      this.config.layout === "map" || this.config.layout === "hierarchical-scc"
        ? false
        : { roundness: 1 };

    let dashes = false;
    let attrs = {
      objectType: "edge",
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
      undirected: !edgeIsDirected(pgEdge),
      chosen: this.retrieveConfigProp(pgEdge, "edge", "chosen"),
    };

    let otherProps = this.retrieveConfigPropAll(pgEdge, "edge", [
      "color",
      "opacity",
      "width",
      "title",
    ]);

    for (let key of Object.keys(otherProps)) {
      attrs[key] = otherProps[key] || attrs[key];
    }

    return attrs;
  },

  createIconLayer(nodeData, scale, sizeUnits, coordinateSystem) {
    return new DeckGLLayers.IconLayer({
      id: "icon-layer",
      data: nodeData,
      pickable: false,
      coordinateSystem,
      billboard: this.config.layout !== "map",
      getIcon: (n) => {
        if (n.iconLabel && Blitzboard.loadedIcons[n.iconLabel]) {
          return {
            url: Blitzboard.loadedIcons[n.iconLabel],
            width: 240,
            height: 240,
            mask: true,
          };
        }
        return {
          url: "data:image/svg+xml;charset=utf-8,dummy", // dummy icon to avoid exception
          width: 24,
          height: 24,
          mask: true,
        };
      },
      sizeScale: scale,
      getPosition: (n) => [
        n.x,
        n.y,
        n.z + (this.config.layout === "map" ? 20 : 0),
      ],
      getSize: (n) =>
        (n._size / defaultNodeSize) *
        6 *
        (this.config.layout === "map" ? 100 : 1),
      sizeUnits: sizeUnits,
      getColor: [255, 255, 255, 232],
      sizeMinPixels: Blitzboard.minNodeSizeInPixels * 1.2,
      // updateTriggers: {
      //   getIcon: [Blitzboard.loadedIcons],
      // }
    });
  },

  updateViewByViewState(viewState) {
    this.network.setProps({
      initialViewState: {
        ...this.viewState,
        transitionDuration: 200,
      },
    });
  },

  createInitialViewState() {
    if (this.config.layout === "map") {
      return {
        latitude: (this.minY + this.maxY) / 2,
        longitude: (this.minX + this.maxX) / 2,
        zoom: 3,
      };
    } else {
      const sideBarWidth = this.sideBarWidth || 0;
      let rate =
        0.8 *
        Math.min(
          (this.container.clientWidth - sideBarWidth) / (this.maxX - this.minX),
          this.container.clientHeight / (this.maxY - this.minY)
        );

      return {
        target: [
          (this.minX + this.maxX + sideBarWidth / rate) / 2,
          (this.minY + this.maxY) / 2,
        ],
        zoom: Math.log(rate) / Math.log(2),
      };
    }
  },

  onViewStateChange(viewState) {
    this.viewState = viewState;
    let viewport = null;
    try {
      viewport = this.network.getViewports()[0];
    } catch (e) {
      // ignore
    }
    if (viewport) {
      const [left, top] = viewport.unproject([0, 0]);
      const [right, bottom] = viewport.unproject([
        viewport.width,
        viewport.height,
      ]);
      this.visibleBounds = {
        left,
        top,
        bottom,
        right,
      };
    }

    let textVisibility =
      this.viewState?.zoom >
      (this.config.layout === "map" ? 12.0 : this.config.zoomLevelForText); // TODO: make this configurable

    this.nodeLayerComp = this.nodeLayerComp.clone({
      textVisible: textVisibility,
    });

    this.edgeTextLayer = this.edgeTextLayer.clone({
      visible: textVisibility,
    });
    this.highlightedNodeLayer = this.highlightedNodeLayer.clone({
      updateTriggers: {
        getNodePosition: this.visibleBounds,
      },
    });

    if (
      this.config.layout === "timeline" &&
      this.visibleBounds &&
      this.viewState
    ) {
      let timeForOneUnitLength = this.timeForOneUnitLength();
      let zoomRate = Math.pow(2, this.viewState.zoom);
      let centerTime = (this.minTime.getTime() + this.maxTime.getTime()) / 2;

      let plotStartTime =
        centerTime + this.visibleBounds.left * timeForOneUnitLength;
      let plotEndTime =
        centerTime + this.visibleBounds.right * timeForOneUnitLength;

      let timeForOnePixel = timeForOneUnitLength / zoomRate;

      const oneSecond = 1000;
      const oneMinute = 60 * oneSecond;
      const oneHour = 60 * oneMinute;
      const oneDay = 24 * oneHour;
      const oneMonth = 31 * oneDay;
      const oneYear = 365 * oneDay;

      const minDistanceInPixels = 200;
      const minimumInterval = timeForOnePixel * minDistanceInPixels;
      let plotTimeInterval, intervalUnit;
      if (minimumInterval > oneYear) {
        intervalUnit = "year";
        plotTimeInterval = minimumInterval / oneYear;
      } else if (minimumInterval > oneMonth) {
        intervalUnit = "month";
        plotTimeInterval = minimumInterval / oneMonth;
      } else if (minimumInterval > oneDay) {
        intervalUnit = "day";
        plotTimeInterval = minimumInterval / oneDay;
      } else if (minimumInterval > oneHour) {
        intervalUnit = "hour";
        plotTimeInterval = minimumInterval / oneHour;
      } else if (minimumInterval > oneMinute) {
        intervalUnit = "minute";
        plotTimeInterval = minimumInterval / oneMinute;
      } else {
        intervalUnit = "second";
        plotTimeInterval = minimumInterval / oneSecond;
      }

      // round to the nearest power of 2
      plotTimeInterval = Math.pow(2, Math.ceil(Math.log(plotTimeInterval)));
      const tickSize = 40;

      this.timelineLayer = this.timelineLayer.clone({
        data: computeTimesToPlot(
          plotStartTime,
          plotEndTime,
          plotTimeInterval,
          intervalUnit
        ),
        verticalPosition: this.visibleBounds.top + tickSize / 2 / zoomRate,
        tickSize: tickSize / zoomRate,
        timeUnit: intervalUnit,
      });
    }

    this.determineLayersToShow();
  },

  timeForOneUnitLength() {
    return (this.maxTime - this.minTime) / this.timeScale;
  },

  updateHighlightState() {
    let nodesToHighlight = [this.hoveredNode]
      .concat(Array.from(this.selectedNodes))
      .filter((n) => n);
    this.nodeLayerComp = this.nodeLayerComp.clone({
      updateTriggers: {
        getRadius: nodesToHighlight,
        getFillColor: nodesToHighlight,
      },
    });

    let edgesToHighlight =
      this.selectedEdges.size > 0
        ? new Set(this.selectedEdges)
        : new Set(this.hoveredEdges);

    for (let nodeId of nodesToHighlight) {
      let edges = this.nodesToEdges[nodeId] || [];
      for (let edge of edges) {
        edgesToHighlight.add(edge.id);
      }
    }
    edgesToHighlight = Array.from(edgesToHighlight).map(
      (id) => this.edgeMap[id]
    );

    let relatedNodes = new Set(nodesToHighlight);
    for (let edge of edgesToHighlight) {
      relatedNodes.add(edge.from);
      relatedNodes.add(edge.to);
    }

    relatedNodes = Array.from(relatedNodes).map((id) => this.nodeDataSet[id]);

    this.highlightedNodeLayer = this.highlightedNodeLayer.clone({
      data: relatedNodes,
    });

    this.nodeLayerComp = this.nodeLayerComp.clone({
      invisibleNodes: relatedNodes.map((n) => n.id),
    });

    if (this.config.edge.visibilityMode !== "always") {
      let edgesToDraw;
      if (
        edgesToHighlight.length === 0 &&
        this.config.edge.visibilityMode === "noOtherFocused"
      ) {
        edgesToDraw = this.allEdgesToDraw;
      } else {
        edgesToDraw = edgesToHighlight;
      }
      this.edgeLayer = this.edgeLayer.clone({
        data: edgesToDraw,
      });
      this.edgeArrowLayer = this.edgeArrowLayer.clone({
        data: edgesToDraw,
      });
      this.edgeTextLayer = this.edgeTextLayer.clone({
        data: edgesToDraw,
      });
    } else {
      let triggers = [this.hoveredNode]
        .concat(Array.from(this.hoveredEdges))
        .concat(Array.from(this.selectedNodes))
        .concat(Array.from(this.selectedEdges));
      this.edgeArrowLayer = this.edgeArrowLayer.clone({
        updateTriggers: {
          getPosition: triggers,
          getColor: triggers,
          getSize: triggers,
        },
      });
      this.edgeTextLayer = this.edgeTextLayer.clone({
        updateTriggers: {
          getColor: triggers,
        },
      });
    }
    this.highlightedTripsLayer = this.highlightedTripsLayer.clone({
      data: edgesToHighlight.filter((edge) => edge && edge.direction !== "--"),
    });
    this.highlightedEdgeLayer = this.highlightedEdgeLayer.clone({
      widthMinPixels: this.config.edge.minWidthInPixels,
      data: edgesToHighlight,
    });
    if (edgesToHighlight.length > 0) this.startEdgeAnimation();

    this.determineLayersToShow();
  },

  determineLayersToShow() {
    switch (this.config.layout) {
      case "map":
        this.layers = [
          this.tileLayer,
          this.tripsLayer,
          this.highlightedTripsLayer,
          this.edgeTextLayer,
          this.nodeLayerComp,
          this.highlightedNodeLayer,
        ];
        break;
      case "timeline":
        this.layers = [
          this.tileLayer,
          this.tripsLayer,
          this.highlightedTripsLayer,
          this.edgeTextLayer,
          this.nodeLayerComp,
          this.highlightedNodeLayer,
          this.timelineLayer,
        ];
        break;
      default:
        this.layers = [
          this.edgeLayer,
          this.highlightedEdgeLayer,
          this.edgeTextLayer,
          this.edgeArrowLayer,
          this.nodeLayerComp,
          this.highlightedNodeLayer,
        ];
        break;
    }
    this.network.setProps({
      layers: this.layers,
    });
  },

  updateViews() {
    if (this.config.layout === "map") {
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
      if (this.config.style) {
        document.getElementById("deckgl-overlay").style =
          this.networkOriginalStyle + " " + this.config.style;
      }

      const view =
        this.config.dimensions === 2
          ? new DeckGL.OrthographicView({})
          : new DeckGL.OrbitView({});

      this.viewState = this.createInitialViewState();
      this.network.setProps({
        initialViewState: this.viewState,
        views: [view],
      });
      this.onViewStateChange(this.viewState);
    }
  },

  retrieveThumbnailUrl(node) {
    if (this.config.node.thumbnail) {
      return node.properties[this.config.node.thumbnail]?.[0];
    }
    return null;
  },
};
