


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
      let x, y, fixed, width;
      ({x, y, fixed, width} =  calcNodePosition(node));
      console.log(fixed);
      if(fixed) {
        moveNodeWithAnimation(node.id, x, y);
        if(width) {
          fixedMap.push({id: node.id, fixed: {x: true, y: false}, shape: "box", widthConstraint: {minimum: x - width / 2, maximum: x + width / 2} });
        } else {
          fixedMap.push({id: node.id, fixed: {x: true, y: false}, shape: "square"});
        }
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
  displayedTimeProps = timeLineFolder.__controllers.map((con) =>
    con.__checkbox.checked ? con.property : null).filter((prop) => prop && prop != 'enabled');
  timeLineEnabled = displayedTimeProps.length > 0;
  updateForTime();
}

// timeLinePropertyController.onChange(onTimeLinePropertyController);

          