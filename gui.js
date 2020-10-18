


// nodeFolder.open();
// edgeFolder.open();
timeLineFolder.open();

physicsController.onChange(() =>
  network.setOptions({physics: {enabled:physicsController.getValue()}})
);

timeLineEnabledController.onChange(() => {
  timeLineEnabled = timeLineEnabledController.getValue();
  updateTimeLineNodes();
  if(timeLineEnabled) {
    fixedMap = [];
    graph.nodes.forEach((node) => {
      let x, y, fixed;
      ({x, y, fixed} =  calcNodePosition(node));
      if(fixed) {
        moveNodeWithAnimation(node.id, x, y);
        fixedMap.push({id: node.id, fixed: {x: true, y: false}});
      }
    });
    nodeDataSet.update(fixedMap);
  } else {
    nodeDataSet.update(graph.nodes.map((node) => {
      return {
        id:node.id,
        fixed: false          
      }
    }));
  }
});

timeLinePropertyController.onChange(() =>
  displayedTimeProp = timeLinePropertyController.getValue()
);

          