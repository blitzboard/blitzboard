
function updatePopupForEdges(edge=null) {
  const table = q('#popup-table');
  table.innerHTML = '';
  edgeProps.forEach((prop) => {
    if(prop != 'id') {
      table.insertAdjacentHTML('beforeend', `
                <tr>
                <td>${prop}</td>
                <td><input type="text" id='${prop}-input' class='popup-input' name='${prop}' value='${edge ? (prop == 'label' ? edge.labels.join(':') : edge.properties[prop]) : ''}'></td>
                </tr>
                `)
    }
  });
}

function showPopup() {
  document.getElementById("network-popUp").style.display = "block";
  const popup = document.getElementById("network-popUp");
  popup.style.left = `${clickedPosition.x}px`;
  popup.style.top = `${clickedPosition.y}px`;
  popup.style.display = "block";
  q('.popup-input').focus();
}

function inputLabel() {
  return q('#label-input').value.trim();
}

function inputProperties() {
  return Array.from(qa('.popup-input')).filter((input) => input.name != 'label' && input.value.trim().length > 0);
}


function saveNode(data, callback) {
  clearPopUp();
  callback(null); // manually add nodes
  const propText = inputProperties().map((input) => `${input.name}: '${input.value.trim()}'` ).join(',');
  let query = `CREATE (a:${inputLabel()} {${propText}}) RETURN a`;
  axios.get(domain + `query?q=${query}`).then((response) => {
    const node = response.data.pg.nodes[0];
    nodeDataSet.add(toVisNode(node, "", displayedNodeProps(), data));
    graph.nodes.push(node);
    nodeMap[node.id] = node;
    q('#graph-input').value = json2pg.translate(JSON.stringify(graph));
  });
}

function saveEdge(data) {
  const pgProperties = {};
  inputProperties().forEach((prop) => pgProperties[prop.name] = [prop.value]);
  let newEdge = {
    from: data.from,
    to: data.to,
    undirected: false,
    labels: inputLabel().split(':'),
    properties: pgProperties
  };
  clearPopUp();
  const propText = inputProperties().map((input) => `${input.name}: '${input.value.trim()}'` ).join(',');
  graph.edges.push(newEdge);
  console.log(data);
  q('#graph-input').value = json2pg.translate(JSON.stringify(graph));
  let query = `MATCH (a),(b) WHERE id(a) = ${data.from} and id(b) = ${data.to} CREATE (a)-[r2:${inputLabel()} {${propText}}]->(b) RETURN r2`;
  axios.get(domain + `query?q=${query}`).then((response) => {
    // TODO: add new edge to edgeMap
    edgeDataSet.add(toVisEdge(response.data.pg.edges[0]))
  });
}


function editNode(data, callback) {
  const label = document.getElementById("label-input").value.trim();
  let updateText = `a:${label}`;
  const propInputs = Array.from(qa('.popup-input')).filter((input) => input.name != 'label' && input.value.trim().length > 0);
  if(propInputs.length > 0)
    updateText += ', ' + propInputs.map((input) => `a.${input.name} = '${input.value.trim()}'` ).join(',');
  clearPopUp();
  callback(null); // edit node without vis.js default behavior
  let query = `MATCH (a) WHERE id(a) = ${data.id} SET ${updateText} RETURN a`;
  axios.get(domain + `query?q=${query}`).then((response) => {
    // TODO: edit label in PG
    // TODO: support removal of existing pg
    nodeDataSet.update(toVisNode(response.data.pg.nodes[0], "", displayedNodeProps(), data));
    // graph.nodes.push(node);
    // q('#graph-input').value = json2pg.translate(JSON.stringify(graph));
  });
}

function deleteNode(data) {
  let query = `MATCH (n) WHERE id(n) IN [${data.nodes.    join(',')}] DETACH DELETE n`;
  axios.get(domain + `query?q=${query}`).then((response) => {
    console.log(response);
  });
}


function deleteEdge(data) {
  const edgeId = edgeDataSet.get(data.edges[0]).remoteId;
  let query = `MATCH (n)-[e]-(n2) WHERE id(e) = ${edgeId} DELETE e`;
  console.log(query);
  axios.get(domain + `query?q=${query}`).then((response) => {
    console.log(response);
  });
}
