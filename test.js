window.addEventListener("load",function() {
      let container = document.getElementById('graph');
      let helloGraph = new HelloGraph(container);
      let config =
      
{
  node: {
    caption: ['id', 'name'],
    icon: {
      person: 'f3a0',
      graph: 'f341',
    },
    saturation: '100%',
    brightness: '37%',
  },
  edge: {
    caption: ['label', 'date'],
    length: {
      distance: 'value', 
    },
    width: {
      flow: 'throughput',
    },
    saturation: '0%',
    brightness: '62%',
  },

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

      let graph = {"nodes":[{"id":"I","location":{"start":{"offset":0,"line":1,"column":1},"end":{"offset":27,"line":2,"column":1}},"labels":["person"],"properties":{"name":["your name"]}},{"id":"You","location":{"start":{"offset":27,"line":2,"column":1},"end":{"offset":39,"line":3,"column":1}},"labels":["person"],"properties":{}},{"id":"Graph","location":{"start":{"offset":39,"line":3,"column":1},"end":{"offset":52,"line":4,"column":1}},"labels":["graph"],"properties":{}}],"edges":[{"from":"I","to":"Graph","location":{"start":{"offset":52,"line":4,"column":1},"end":{"offset":90,"line":5,"column":1}},"direction":"->","labels":["say"],"properties":{"word":["Hello"],"date":["today"]}},{"from":"You","to":"I","location":{"start":{"offset":90,"line":5,"column":1},"end":{"offset":132,"line":6,"column":1}},"direction":"->","labels":["say"],"properties":{"word":["Goodbye"],"date":["yesterday"]}}],"nodeCount":3,"edgeCount":2,"nodeLabels":{"person":2,"graph":1},"edgeLabels":{"say":2},"nodeProperties":{"name":1},"edgeProperties":{"word":2,"date":2}};
      helloGraph.updateGraph(graph, config);
      });
    