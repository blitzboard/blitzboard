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

function detectSCCRecursive(adjacencyList, nodeStack, visited, sccList) {
  let srcNode = nodeStack[nodeStack.length - 1];
  console.log({srcNode});
  console.log(nodeStack);
  for(let dstNode of adjacencyList[srcNode]) {
    if(nodeStack.length > 1 && nodeStack.includes(dstNode)) {
      // SCC has been detected
      let newLoop = nodeStack.slice(nodeStack.indexOf(dstNode));
      let existingSCC = sccList.filter(scc => {
        for(let node of newLoop) {
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
        newSCC = new Set([...newSCC, ...newLoop]);
        sccList.push(newSCC);
      } else if(existingSCC.length === 1) {
        for(let node of newLoop) {
          existingSCC[0].add(node);
        }
      } else {
        sccList.push(new Set(newLoop));
      }
    } else if(!visited[dstNode]) {
      visited[dstNode] = true;
      nodeStack.push(dstNode);
      detectSCCRecursive(adjacencyList, nodeStack, visited, sccList);
      nodeStack.pop();
    }
  }
}