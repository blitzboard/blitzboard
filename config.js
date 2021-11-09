let defaultConfig =
`
{
  node: {
    caption: ['id'],
    defaultIcon: true,
  },
  edge: {
    caption: ['label'],
  },
  layout: 'default',

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
  layout: 'custom',
  layoutSettings: {
    x: 'x',
    y: 'y'
  },
  */
}
`
