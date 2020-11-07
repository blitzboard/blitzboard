


// nodeFolder.open();
// edgeFolder.open();
timeLineFolder.open();

physicsController.onChange(() =>
  network.setOptions({physics: {enabled:physicsController.getValue()}})
);

function updateForTime() {
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
        fixed: expandedNodes.includes(node.id)
      }
    }));
  }
}

function onTimeLinePropertyController() {
  displayedTimeProp = timeLinePropertyController.getValue();
  updateForTime();
}

timeLineEnabledController.onChange(() => {
  timeLineEnabled = timeLineEnabledController.getValue();
  updateForTime();
});

timeLinePropertyController.onChange(onTimeLinePropertyController);

          