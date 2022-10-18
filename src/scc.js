/// A function to find all strongly connected components in given graph
/// Input: list of edges
/// Output: list of strongly connected components (each component is a set of nodes)
function detectAllSCC(edges) {
  let sccList = [];
  let visited = {};
  let adjacencyList = {};
  for(let edge of edges) {
    visited[edge.from] = false;
    visited[edge.to] = false;
    adjacencyList[edge.from] = adjacencyList[edge.from] || [];
    adjacencyList[edge.to] = adjacencyList[edge.to] || [];
    adjacencyList[edge.from].push(edge.to);
  }
  console.log({adjacencyList});
  let nodeStack = [];
  for(let node of Object.keys(visited)) {
    if(!visited[node]) {
      nodeStack = [node];
      detectSCCRecursive(adjacencyList, nodeStack, visited, sccList);
    }
  }

  return sccList;
}


function mergeSCCList(nodes, sccList) {
  let existingSCC = sccList.filter(scc => {
    for(let node of nodes) {
      if(scc.has(node))
        return true;
    }
    return false;
  });
  if(existingSCC.length > 1) {
    let newSCC = new Set();
    for(let scc of existingSCC) {
      sccList.splice(sccList.indexOf(scc), 1);
      for(let node of scc) {
        newSCC.add(node);
      }
    }
    newSCC = new Set([...newSCC, ...nodes]);
    sccList.push(newSCC);
  } else if(existingSCC.length === 1) {
    for(let node of nodes) {
      existingSCC[0].add(node);
    }
  } else {
    sccList.push(new Set(nodes));
  }
}

function detectSCCRecursive(adjacencyList, nodeStack, visited, sccList) {
  let srcNode = nodeStack[nodeStack.length - 1];
  for(let dstNode of adjacencyList[srcNode]) {
    if(nodeStack.length > 1 && nodeStack.includes(dstNode)) {
      // SCC has been detected
      let newLoop = nodeStack.slice(nodeStack.indexOf(dstNode));
      mergeSCCList(newLoop, sccList);
    } else  {
      let existingSCC = sccList.filter(scc => scc.has(dstNode));
      if(existingSCC.length > 0) {
        existingSCC = existingSCC[0];
        let index = nodeStack.length - 1;
        while(index >= 0 && !existingSCC.has(nodeStack[index])) {
          --index;
        }
        if(index >= 0) {
          mergeSCCList(nodeStack.slice(index), sccList);
        }
      }
      else if(!visited[dstNode]) {
        visited[dstNode] = true;
        nodeStack.push(dstNode);
        detectSCCRecursive(adjacencyList, nodeStack, visited, sccList);
        nodeStack.pop();
      }
    }
  }
}