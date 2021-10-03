function moveNodeFunction(nodeId, finX, finY, duration, timer) {
  let startPos = network.getPositions([nodeId])[nodeId];
  let startX = startPos.x;
  let startY = startPos.y;
  let startTime = performance.now();
  let _duration = duration || 1000;

  let move = () => {
    let time = performance.now();
    let deltaTime = (time - startTime) / _duration;
    let currentX = startX + ((finX - startX) * deltaTime);
    let currentY = startY + ((finY - startY) * deltaTime);

    if (deltaTime >= 1) {
      network.moveNode(nodeId, finX, finY);
      return false;
    } else
    {
      network.moveNode(nodeId, currentX, currentY);
      window.requestAnimationFrame(move);
      return true;
    }
  };
  return move;
}

function moveNodeWithAnimation(nodeId, x, y) {
  let timer;
  let callback = moveNodeFunction(nodeId, x, y);
  timer = setInterval(() => {
    if(!callback()) clearInterval(timer), 100
  });
}

let scrollAnimationTimerId = null;

function scrollIntoView(position) {
  clearTimeout(scrollAnimationTimerId);
  scrollAnimationTimerId = setTimeout(() => {
    const animationOption = {
      scale: 1.0,
      animation:
      {
        duration: 500,
        easingFuntcion: "easeInOutQuad"
      }
    };
    blitzboard.network.moveTo({ ...{position: position}, ...animationOption });
  }, 200); // Set delay to avoid calling moveTo() too much (seem to cause some bug on animation)
}

function scrollMapIntoView(element) {
  let xKey =  blitzboard.config.layoutSettings.x;
  let yKey =  blitzboard.config.layoutSettings.y;
  if(element.from && element.to) {
    // edge
    scrollMapIntoView(blitzboard.nodeMap[element.from]);
    // let from = blitzboard.nodeMap[element.from];
    // let to = blitzboard.nodeMap[element.to];
    // let longitude = (parseFloat(from.properties[xKey][0]) + parseFloat(to.properties[xKey][0])) / 2;
    // let latitude = (parseFloat(from.properties[yKey][0]) + parseFloat(to.properties[yKey][0])) / 2;
    // blitzboard.map.panTo([latitude, longitude]);
  } else if(element.id){
    // node
    blitzboard.map.panTo([element.properties[yKey][0] ,element.properties[xKey][0]]);
  }
  
  blitzboard.graph.nodes.forEach(node => {
    let point = blitzboard.map.latLngToContainerPoint();
    point = blitzboard.network.DOMtoCanvas(point);
    nodePositions.push({id: node.id,
      x: point.x, y: point.y, fixed: true });
  });
}