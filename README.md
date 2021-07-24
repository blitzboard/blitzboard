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
  x2: {
    url: 'https://123.456.xxx.xxx:7001/',
    mode: 'read-only',
    init: {
      endpoint: 'edge_match',
      parameters: [
        { key: 'edge_labels[]', value: 'respects' },
        { key: 'limit', value: 100 },
      ],
    },
  },
```
