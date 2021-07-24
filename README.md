Please visit https://g2glab.github.io/hellograph/

## Note for Contributing

The `index.html` is automatically generated from `index.haml` by `watch_haml_change.sh` (requires [haml](https://github.com/haml/haml)).
Other javascripts can be edited directly!

## Config

Default

```json
{
  "node": {
    "icon": {
      "person": "f3a0",
      "graph": "f341"
    },
    "saturation": "100%",
    "brightness": "37%"
  },
  "edge": {
    "length": {
      "distance": "value"
    },
    "width": {
      "flow": "throughput"
    },
    "saturation": "0%",
    "brightness": "62%"
  }
}
```

### Node Icon

```json
  "node": {
    "icon": {
      "<label_name>": "<ionicons_css_content>",
    },
```

[Ionicons Cheatsheet](https://ionic.io/ionicons/v2/cheatsheet.html)

### Layout

Hierarchical layout:

```json
  "layout": "hierarchical",
  "layoutSettings": {
    "enabled": true,
    "levelSeparation": 150,
    "nodeSpacing": 100,
    "treeSpacing": 200,
    "blockShifting": true,
    "edgeMinimization": true,
    "parentCentralization": true,
    "direction": "UD",
    "sortMethod": "hubsize",
    "shakeTowards": "leaves"
  },
```

Custom Layout:

```json
  "layout": "custom",
  "layoutSettings": {
    "x": "prop_x",
    "y": "prop_y"
  }
```

Reference:

https://visjs.github.io/vis-network/docs/network/layout.html

### Database Access

```json
  "remoteUrl": "http://<ip_address>:<port>/",
```

### How to embed your graph into other websites

Load scripts in the header of the your html:  

```html
<link href='https://code.ionicframework.com/ionicons/2.0.1/css/ionicons.min.css' rel='stylesheet'>
<script src='https://unpkg.com/vis-network/standalone/umd/vis-network.min.js'></script>
<script src='https://cdn.jsdelivr.net/gh/g2glab/hellograph@embed/hello_graph.js'></script>
```

Place div tag with `id='graph'`:

```html
<div style="width:100%; height: 1000px;" id='graph'></div>
```

Download `embed_pg.js` from the button on the graph editor.

Load the script in your html (make sure other libraries have been already loaded):

```html
<script src='./embed_pg.js'></script>
```

You can also call the API with graph data (in pg format) and config:

```javascript
let helloGraph = new HelloGraph(document.getElementById('graph'));
helloGraph.update(pg, config);
```