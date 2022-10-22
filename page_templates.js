let baseConfig = `{
  node: {
    caption: ['id'],
    defaultIcon: true,
    /*
    icon: {
      'person': 'carbon:person',
    },
    color: {
      'person': 'blue',
      'dog': '@color',
    },
    size: {
      'dog': 20,
    },
    */
  },
  edge: {
    caption: ['label'],
    width: 3,
    opacity: 0.5,
  },
  
  layout: 'force',
  
  /*
  layout: 'hierarchical',
  layoutSettings: {
    edgeMinimization: true,
    parentCentralization: true,
    direction: 'UD',        // UD, DU, LR, RL
    sortMethod: 'hubsize',  // hubsize, directed
    shakeTowards: 'leaves'  // roots, leaves
  },
  */
  /*
  layout: 'map',
  layoutSettings: {
    lng: 'lng',
    lat: 'lat'
  },
  */
  /*
  layout: 'custom',
  layoutSettings: {
    x: 'x',
    y: 'y'
  },
  */
}
`;


let pageTemplates = [
  {
    name: 'RelationShip',
    pg: `
Alice :person age:15
Bob :person age:15

Alice -> Choco :has since:2015
Bob -> Shiro :has since:2017

Choco :dog color:chocolate
Shiro :dog color:silver

Choco -- Shiro :friend since:2018
`,
    config: baseConfig
  },
  { name: 'Blank page' ,
    pg: '',
    config: baseConfig
  },
];
