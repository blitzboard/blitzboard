/// A function to find all strongly connected components in given graph using Tarjan's algorithm
/// Input: list of edges
/// Output: list of strongly connected components whose size is larger than 1 (each component is a set of nodes)
function stronglyConnectedComponents(edges) {
  let sccList = [];
  let visited = {};
  let component = {};
  let adjacencyList = {};
  let root = {};
  for(let edge of edges) {
    adjacencyList[edge.from] = adjacencyList[edge.from] || [];
    adjacencyList[edge.to] = adjacencyList[edge.to] || [];
    adjacencyList[edge.from].push(edge.to);
  }
  let nodeStack = [];
  for(let node of Object.keys(adjacencyList)) {
    if(!visited[node]) {
      stronglyConnectedComponentsRecursive(node, adjacencyList, nodeStack, visited, sccList, root, component, 0);
    }
  }
  return sccList;
}

function stronglyConnectedComponentsRecursive(node, adjacencyList, nodeStack, visited, sccList, root, component, depth) {
  root[node] = depth;
  visited[node] = depth;
  depth += 1;
  nodeStack.push(node);
  for(let dst of adjacencyList[node]) {
    if(!(dst in visited)) {
      stronglyConnectedComponentsRecursive(dst, adjacencyList, nodeStack, visited, sccList, root, component, depth);
    }
    if(!(dst in component)) {
      root[node] = Math.min(root[node], root[dst]);
    }
  }

  if(root[node] === visited[node]) {
    component[node] = root[node];
    let newComponent =  new Set([node]);
    while(nodeStack[nodeStack.length - 1] !== node) {
      let tmpNode = nodeStack.pop();
      component[tmpNode] = root[node];
      newComponent.add(tmpNode);
    }
    nodeStack.pop();
    if(newComponent.size > 1)
      sccList.push(newComponent);
  }
}