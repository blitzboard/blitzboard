$(() => {
  // Add buttons to #options-dropdown
  let optionsDropdown = $("#options-dropdown");
  let crossImpactFactor = $("<a>", {
    class: "dropdown-item",
    href: "#",
    id: "options-cross-impact",
  });
  let crossImpactFactorLabel = $("<label>", {
    class: "w-100",
    "data-i18n": "crossImpactFactor",
  });
  crossImpactFactor.append(crossImpactFactorLabel);
  $("#options-show-config").after(crossImpactFactor);

  let insertEdges = $("<a>", {
    class: "dropdown-item",
    href: "#",
    id: "options-insert-edges",
  });
  let insertEdgesLabel = $("<label>", {
    class: "w-100",
    "data-i18n": "insertEdges",
  });
  insertEdges.append(insertEdgesLabel);
  crossImpactFactor.after(insertEdges);

  $("#options-cross-impact").click(computeCrossImpactFactor);
  $("#options-insert-edges").click(insertEdges);
});

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
  editor.setValue(json2pg.translate(JSON.stringify(newPG), true));
  byProgram = false;
}

function getLongest(from, vertices, edgeCosts) {
  let dist = {};
  let pred = {};
  for (let vertex of vertices) {
    dist[vertex.id] = Number.POSITIVE_INFINITY;
    pred[vertex.id] = null;
  }
  dist[from.id] = 0;
  let n = vertices.length;
  let failOnUpdate = false;
  let leaveEarly = true;
  for (let i = 1; i <= n; i++) {
    failOnUpdate = i === n;
    leaveEarly = true;
    for (let vertex of vertices) {
      if (!edgeCosts[vertex.id]) continue;
      for (let [toId, cost] of Object.entries(edgeCosts[vertex.id])) {
        let newLen = dist[vertex.id] + cost;
        if (newLen < dist[toId]) {
          if (failOnUpdate) {
            throw new Error("Graph has negative cycle");
          }
          dist[toId] = newLen;
          pred[toId] = vertex.id;
          leaveEarly = false;
        }
      }
    }
    if (leaveEarly) {
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
  };
  let edgeMap = {};
  pg.edges.forEach((e) => {
    edgeMap[e.from] = edgeMap[e.from] || {};
    edgeMap[e.from][e.to] = true;
  });

  // Create edges from targetNode

  if (remoteMode) {
    let nodeCandidates = pg.nodes
      .map((n) => "'" + n.id.replace("'", "'") + "'")
      .join(",");
    let query = `SELECT n1.id AS n1_id, n2.id AS n2_id, 
       MAX(JSON_VALUE(e.props, '$.\"確率\"[0]'))
           AS prob FROM MATCH (n1)-[e]->(n2)
            WHERE n1.id IN (${nodeCandidates}) AND n2.id IN (${nodeCandidates}) GROUP BY n1_id, n2_id`;

    axios.get(`${backendUrl}/query_table/?query=${query}`).then((response) => {
      console.log({ response });
      let edgePropMap = {};
      for (let record of response.data.table.records) {
        edgePropMap[record.N1_ID] ||= {};
        edgePropMap[record.N1_ID][record.N2_ID] = record.PROB;
      }

      let defaultProps = config?.editor?.defaultEdgeProperties;

      pg.nodes.forEach((sourceNode) => {
        pg.nodes.forEach((destNode) => {
          if (
            sourceNode.id !== destNode.id &&
            !edgeMap[sourceNode.id]?.[destNode.id]
          ) {
            let props = defaultProps ? { ...defaultProps } : {};
            if (edgePropMap?.[sourceNode.id]?.[destNode.id]) {
              props["確率"] = [edgePropMap?.[sourceNode.id]?.[destNode.id]];
            }
            console.log({ props });
            newPG.edges.push({
              from: sourceNode.id,
              to: destNode.id,
              undirected: false,
              labels: [],
              properties: props,
            });
          }
        });
      });
      byProgram = true;
      insertContentsToEditor(json2pg.translate(JSON.stringify(newPG), true));
      byProgram = false;
    });
  } else {
    pg.nodes.forEach((sourceNode) => {
      pg.nodes.forEach((destNode) => {
        if (
          sourceNode.id !== destNode.id &&
          !edgeMap[sourceNode.id]?.[destNode.id]
        )
          newPG.edges.push({
            from: sourceNode.id,
            to: destNode.id,
            undirected: false,
            labels: [],
            properties: config?.editor?.defaultEdgeProperties || [],
          });
      });
    });
    byProgram = true;
    insertContentsToEditor(json2pg.translate(JSON.stringify(newPG), true));
    byProgram = false;
  }
}
