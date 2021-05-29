let config = {
  node: {
    icon: {
      programmer: 'f3a0',
      designer: 'f37b',
      location: 'f2e9',
      hackathon: 'f380'
    },
    saturation: '100%',
    brightness: '37%',
  },
  edge: {
    length: {
      distance: 'value', 
    },
    width: {
      flow: 'throughput',
    },
    saturation: '0%',
    brightness: '62%',
  },
  
  // LAYOUT -- (default), hierarchical, custom
  //
  // cf. https://visjs.github.io/vis-network/docs/network/layout.html
  //
  /*
  layout: 'hierarchical',
  layoutSettings: {
    enabled:true,
    levelSeparation: 150,
    nodeSpacing: 100,
    treeSpacing: 200,
    blockShifting: true,
    edgeMinimization: true,
    parentCentralization: true,
    direction: 'UD',        // UD, DU, LR, RL
    sortMethod: 'hubsize',  // hubsize, directed
    shakeTowards: 'leaves'  // roots, leaves
  },
  */
  /*
  layout: 'custom',
  layoutSettings: {
    x: 'x',
    y: 'y'
  },
  */         
};
