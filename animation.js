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