let config = {
  node: {
    icon: {
      programmer: 'f3a0',
      designer: 'f37b',
      location: 'f2e9',
      hackathon: 'f380'
    }
  },
  edge: {
    length: {
      distance: 'value', 
    },
    width: {
      flow: 'throughput',
    }
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
  layoutMapping: {
    x: 'x',
    y: 'y'
  },
  */         
};
