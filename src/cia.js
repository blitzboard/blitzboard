function computeCrossImpactFactor() {
  let newPG = blitzboard.tryPgParse(editor.getValue());
  let nodePropMap = {};
  newPG.nodes.forEach((n) => {
    nodePropMap[n.id] = Number(n.properties["初期確率"][0]);
  });

  newPG.edges.forEach((e) => {
    let pi = nodePropMap[e.from];
    let pj = nodePropMap[e.to];
    let p = e.properties["確率"][0];
    let pp = (1 / (1 - pj)) * (Math.log(p / (1 - p)) - Math.log(pi / (1 - pi)));
    if (isFinite(pp)) {
      e.properties["クロスインパクト"] = [Math.round(pp * 100) / 100];
    } else {
      e.properties["クロスインパクト"] = ["inf"];
    }
  });

  byProgram = true;
  editor.setValue(json2pg.translate(JSON.stringify(newPG)));
  byProgram = false;
}


function getLongest(from, vertices, edgeCosts) {
  let dist = {};
  let pred = {};
  for(let vertex of vertices) {
    dist[vertex.id] = Number.POSITIVE_INFINITY;
    pred[vertex.id] = null;
  }
  dist[from.id] = 0;
  let n = vertices.length;
  let failOnUpdate = false;
  let leaveEarly = true;
  for(let i = 1; i <= n; i++) {
    failOnUpdate = (i === n);
    leaveEarly = true;
    for(let vertex of vertices) {
      if(!edgeCosts[vertex.id])
        continue;
      for(let [toId, cost] of Object.entries(edgeCosts[vertex.id])) {
        let newLen = dist[vertex.id] + cost;
        if(newLen < dist[toId]) {
          if(failOnUpdate) {
            throw new Error('Graph has negative cycle');
          }
          dist[toId] = newLen;
          pred[toId] = vertex.id;
          leaveEarly = false;
        }
      }
    }
    if(leaveEarly) {
      break;
    }
  }
  return pred;
}


function insertEdges() {
  let targetNode = blitzboard.nodeLineMap[editor.getCursor().line + 1];
  let pg = blitzboard.tryPgParse(editor.getValue());
  let newPG = {
    nodes: [],
    edges: [],
  }
  let edgeMap = {};
  pg.edges.forEach((e) => {
    edgeMap[e.from] = edgeMap[e.from] || {};
    edgeMap[e.from] = e.to
  });

  pg.nodes.forEach((n) => {
    if(n.id !== targetNode.id) {
      if(!edgeMap[n.id]?.[targetNode.id])
        newPG.edges.push({
          from: n.id,
          to: targetNode.id,
          undirected: false,
          labels: [],
          properties: {
            確率: ['']
          }
        });
      if(!edgeMap[targetNode.id]?.[n.id])
        newPG.edges.push({
          from: targetNode.id,
          to: n.id,
          undirected: false,
          labels: [],
          properties: {
            確率: ['']
          }
        });
    }
  });

  byProgram = true;
  insertContentsToEditor(json2pg.translate(JSON.stringify(newPG), true));
  byProgram = false;
}
