let blitzboard;
let metaBlitzboard = null;
let graphOnModal = null;
let configOnModal = null;
let targetNodeIdOnModal = null;
let markers = [];
let editor, configEditor;
let nodeLayout = null;
let savedGraphNames = [];
let unsavedChangeExists = false;

let backendUrl = localStorage.getItem('backendUrl');
let remoteMode = !!backendUrl;

let edgeFilterConditions = null;
let nodeFilterConditions = null;

let clientIsMac = navigator.platform.startsWith('Mac');

function insertContentsToEditor(contents) {
  let oldCursor = editor.getCursor();
  /// Insert line after the current line
  let line = editor.getLine(oldCursor.line);
  let pos = {
    line: oldCursor.line,
    ch: line.length // set the character position to the end of the line
  }
  editor.replaceRange('\n' + contents, pos);
}

function getCurrentCharacter() {
  let cursor = editor.getCursor();
  return editor.getLine(cursor.line).charAt(cursor.ch - 1);
}

$(() => {
  let defaultConfig = pageTemplates[0].config;
  const q = document.querySelector.bind(document);
  const qa = document.querySelectorAll.bind(document);

  let container = document.getElementById('graph');
  let pgTimerId = null, configTimerId = null;
  let localMode = true;
  blitzboard = new Blitzboard(container);
  let byProgram = false;
  let currentGraphName;
  let noGraphLoaded = false;
  let prevInputWidth = null;
  let config = defaultConfig;
  let autocompletion = true;
  let showConfig = false;
  let srcNode, lineEnd;
  let focusTimerId = null;
  let lastUpdate = null;
  let prevNetwork = null;
  let viewMode = loadConfig('viewMode');
  let pgToBeSorted;
  let sortModal = new bootstrap.Modal(document.getElementById('sort-modal'));
  let metaGraphModal = new bootstrap.Modal(document.getElementById('metagraph-modal'));
  let bufferedContent = ''; // A buffer to avoid calling editor.setValue() too often
  let candidatePropNames = new Set(), candidateLabels = new Set(), candidateIds = new Set();
  let additionalAutocompleteTargets = [];
  let dateTimeFormat = new Intl.DateTimeFormat('default', {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  });


  String.prototype.quoteIfNeeded = function () {
    if (this.includes('"') || this.includes('#') || this.includes('\t') || this.includes(':') || this.includes(' ')) {
      return `"${this.replace(/\"/g, '""')}"`;
    }
    return this;
  }


  if (!localStorage.getItem('currentGraphName')) {
    noGraphLoaded = true;
    localStorage.setItem('currentGraphName', newGraphName());
  }
  currentGraphName = localStorage.getItem('currentGraphName');

  if(remoteMode) {
    axios.get(`${backendUrl}/get/?graph=${currentGraphName}`).then((response) => {
      lastUpdate = response.data.properties?.lastUpdate[0];
    });
  }
  let templatesContent = '';
  let i = 0;
  for(let template of pageTemplates) {
    templatesContent += `<a class="template-dropdown dropdown-item" href="#" data-index="${i}">${template.name}</a>`;
    ++i;
  }
  q('#templates-dropdown').innerHTML = templatesContent;

  function reloadConfig() {
    config = parseConfig(configEditor.getValue());
    if(!remoteMode)
      saveCurrentGraph();
    if (config) {
      triggerGraphUpdate(editor.getValue(), config);
    }
    clearTimeout(configTimerId);
    configTimerId = null;
  }

  function updateConfigByUI() {
    config = parseConfig(configEditor.getValue());
    let filterFromUI = getFilterFromUI();
    if(filterFromUI.node) {
      config.node.filter = filterFromUI.node;
    }
    if(filterFromUI.edge) {
      config.edge.filter = filterFromUI.edge;
    }
  }

  function getFilterFromUI() {
    let filter = {};
    let nodeFilterRows = qa(".node-filter-row");
    let nodeFilterList = retrieveFilterConditions(nodeFilterRows, 'node').filter(cond => cond.prop && (cond.min !== undefined || cond.max !== undefined));
    if(nodeFilterList.length > 0) {
      filter.node = n => {
        for(let filter of nodeFilterList) {
          if(filter.min !== undefined && n[filter.prop] < filter.min) {
            return false;
          }
          if(filter.max !== undefined && filter.max < n[filter.prop]) {
            return false;
          }
        }
        return true;
      }
    }

    let edgeFilterRows = qa(".edge-filter-row");
    let edgeFilterList = retrieveFilterConditions(edgeFilterRows, 'edge').filter(cond => cond.prop && (cond.min !== undefined || cond.max !== undefined));
    if(edgeFilterList.length > 0) {
      filter.edge = e => {
        for(let filter of edgeFilterList) {
          if(filter.min !== undefined && e[filter.prop] < filter.min) {
            return false;
          }
          if(filter.max !== undefined && filter.max < e[filter.prop]) {
            return false;
          }
        }
        return true;
      }
    }
    return filter;
  }

  function sortedNodeProperties() {
    if(!blitzboard?.graph)
      return [];
    return Object.entries(blitzboard.graph.nodeProperties).sort((a, b) => b[1] - a[1]).map(p => p[0]);
  }

  function sortedEdgeProperties() {
    if(!blitzboard?.graph)
      return [];
    return Object.entries(blitzboard.graph.edgeProperties).sort((a, b) => b[1] - a[1]).map(p => p[0]);
  }

  function showSortModal() {
    if (/^\s*#/m.test(editor.getValue())) {
      q('#comment-warning-line').classList.remove('d-none');
    } else {
      q('#comment-warning-line').classList.add('d-none');
    }
    pgToBeSorted = blitzboard.tryPgParse(editor.getValue());
    if (!pgToBeSorted) {
      Swal.fire({
        text: `Please write a valid graph before sort.`,
        icon: "error",
      });
      return;
    }
    let oldNodeKey = localStorage.getItem('nodeSortKey');
    let oldEdgeKey = localStorage.getItem('edgeSortKey');

    // Each option is a pair of value and text
    let nodeOptions = [['', 'None'], [':id', 'id'], [':label', 'label']];
    let edgeOptions = [['', 'None'], [':from-to', 'from&to'], [':label', 'label']];

    nodeOptions = nodeOptions.concat(sortedNodeProperties().map(p => [p, p]));
    q('#sort-node-lines-select').innerHTML = nodeOptions.map((o) =>
      `<option value="${o[0]}" ${o[0] === oldNodeKey ? 'selected' : ''}>${o[1]}</option>`
    );

    edgeOptions = edgeOptions.concat(sortedEdgeProperties().map(p => [p, p]));
    q('#sort-edge-lines-select').innerHTML = edgeOptions.map((o) =>
      `<option value="${o[0]}" ${o[0] === oldEdgeKey ? 'selected' : ''}>${o[1]}</option>`
    );
    sortModal.show();
  }

  function parseConfig(json) {
    try {
      let config = looseJsonParse(json);
      if(remoteMode) {
        let oldTitleHandler = config.node.title;
        config.node.title = (n) => {
          let title = oldTitleHandler ? oldTitleHandler(n) : blitzboard.createTitle(n);
          title += `<a href='#' class='expand-event-tree-link' data-node-id='${n.id}'>Show list of graphs</a>`;
          title += `<br><a href='#' class='show-all-path-link' data-node-id='${n.id}'>Show all paths</a>`;
          return title;
        };
      }
      return config;
    } catch (e) {
      console.log(e);
      toastr.error(e.toString(), 'JSON SyntaxError', {preventDuplicates: true});
      return null;
    }
  }


  function scrollToLine(loc) {
    if (!loc)
      return;
    byProgram = true;
    editor.scrollIntoView({line: loc.start.line - 1, ch: loc.start.column - 1}, 200);
    editor.setSelection({line: loc.start.line - 1, ch: loc.start.column - 1}, {
      line: loc.end.line - 1,
      ch: loc.end.column - 1
    });
    editor.focus();
    byProgram = false;
  }

  blitzboard.onNodeAdded.push((nodes) => {
    byProgram = true;
    let content = bufferedContent || editor.getValue();
    for (let node of nodes) {
      content += `\n${node.id.quoteIfNeeded()}`;
      for (let label of node.labels)
        content += ` :${label.quoteIfNeeded()}`;
      for (let key in node.properties)
        for (let value of node.properties[key])
          content += ` ${key.quoteIfNeeded()}:${value.quoteIfNeeded()}`;
    }
    bufferedContent = content;
    byProgram = false;
  });

  blitzboard.onClear.push(() => {
    byProgram = true;
    editor.setValue('');
    byProgram = false;
  });

  blitzboard.onUpdated.push(() => {
    if (bufferedContent) {
      byProgram = true;
      editor.setValue(bufferedContent);
      bufferedContent = null;
      byProgram = false;
    }
    if (blitzboard.network !== prevNetwork) {
      blitzboard.network.on("click", (e) => {
        if (srcNode) {
          if (e.nodes.length > 0) {
            let node = blitzboard.nodeMap[e.nodes[0]];
            if (srcNode !== node.id) {
              let oldPg = editor.getValue();
              let lineNum = numberOfLines(oldPg) + 1;
              editor.setValue(oldPg + `\n${srcNode.quoteIfNeeded()} -> ${node.id.quoteIfNeeded()}`);
              updateGraph(editor.getValue());
              scrollToLine({start: {line: lineNum, column: 1}, end: {line: lineNum + 1, column: 1}});
            }
          }
          srcNode = null;
          lineEnd = null;
        } else if (e.nodes.length > 0) {
          if(!blitzboard.network.isCluster(e.nodes[0])) {
            let node = blitzboard.nodeMap[e.nodes[0]];
            scrollToLine(node.location);
          } else {
            let nodes = blitzboard.network.clustering.getNodesInCluster(e.nodes[0]);
            let node = blitzboard.nodeMap[nodes[0]];
            if(node)
              scrollToLine(node.location);
          }
        } else if (e.edges.length > 0) {
          let edge = blitzboard.edgeMap[e.edges[0]];
          scrollToLine(edge.location);
        }
      });
      let canvas = q(".vis-network canvas");
      canvas.addEventListener('mousemove', event => {
        if (srcNode) {
          lineEnd = blitzboard.network.DOMtoCanvas(getMousePos(canvas, event));
          blitzboard.network.redraw();
        }
      });

      blitzboard.network.on("afterDrawing", (ctx) => {
        if (srcNode && lineEnd) {
          ctx.beginPath();
          let lineStart = blitzboard.network.getPosition(srcNode);
          ctx.moveTo(lineStart.x, lineStart.y);
          ctx.lineTo(lineEnd.x, lineEnd.y);
          ctx.stroke();
        }
      });
      prevNetwork = blitzboard.network;
    }
    updateAutoCompletion();
  });

  blitzboard.beforeParse.push(() => {
    for (let marker of markers)
      marker.clear();
    markers = [];
  });

  blitzboard.onParseError.push((e) => {
    if (!e.hasOwnProperty('location'))
      throw(e);
    let loc = e.location;
    // Mark leading characters in the error line
    markers.push(editor.markText({line: loc.start.line - 1, ch: 0}, {
      line: loc.start.line - 1,
      ch: loc.start.column - 1
    }, {className: 'syntax-error-line', message: e.message}));
    markers.push(editor.markText({line: loc.start.line - 1, ch: loc.start.column - 1}, {
      line: loc.end.line - 1,
      ch: loc.end.column - 1
    }, {className: 'syntax-error', message: e.message}));
    // Mark following characters in the error line
    markers.push(editor.markText({line: loc.end.line - 1, ch: loc.end.column - 1}, {line: loc.end.line - 1, ch: 10000},
      {className: 'syntax-error-line', message: e.message}));
    toastr.error(e.message, 'PG SyntaxError', {preventDuplicates: true})
  });

  blitzboard.onEdgeAdded.push((edges) => {
    byProgram = true;
    let content = bufferedContent || editor.getValue();
    for (let edge of edges) {
      content += `\n${edge.from.quoteIfNeeded()} ${edge.direction} ${edge.to.quoteIfNeeded()}`;
      for (let label of edge.labels)
        content += ` :${label.quoteIfNeeded()}`;
      for (let key in edge.properties)
        for (let value of edge.properties[key])
          content += ` ${key.quoteIfNeeded()}:${value.quoteIfNeeded()}`;
    }
    bufferedContent = content;
    byProgram = false;
  });

  q('#options-backend-url-input').value = backendUrl;

  q('#options-backend-url-input').addEventListener('change', (e) => {
    localStorage.setItem('backendUrl', e.target.value);
    backendUrl = e.target.value;
    remoteMode = e.target.value.length > 0;
    updateGraphList(() => {
      if(savedGraphNames.length > 0) {
        loadGraphByName(savedGraphNames[0]);
      } else {
        createNewGraph(0);
      }
      if(remoteMode) {
        toastr.success(`Backend has been changed to ${backendUrl}`);
        q('#save-btn').classList.remove('d-none');
      }
      else {
        toastr.success(`Local mode has been enabled`);
        q('#save-btn').classList.add('d-none');
      }
    });
  });

  toastr.subscribe(() => {
    updateToastrPosition();
  });

  function updateToastrPosition() {
    const toastrOffset = 20;
    const totalWidth = $("#main-area").width();
    let width = $("#input-area").width();
    if(q('#edit-panel-btn').checked) {
      $('.toast-top-right').css('right', totalWidth - width + toastrOffset);
    } else {
      $('.toast-top-right').css('right', toastrOffset);
    }
  }

  function onResize(event, ui) {
    const totalWidth = $("#main-area").width();
    let width = $("#input-area").width();
    if (width > totalWidth) {
      width = totalWidth;
      $('#input-area').css('width', width);
    }
    localStorage.setItem('inputAreaWidth', width);
    $('#graph-pane').css('width', (totalWidth - width));
    updateToastrPosition();
    onConfigResize(null, null);
  }

  function configCollapsed() {
    return $('#config-area').css('height') == '0px';
  }

  function onConfigResize(event, ui) {
    const totalHeight = $("#input-area").height();
    let height = $("#pg-area").height();
    if (height > totalHeight) {
      height = totalHeight;
    }
    $('#pg-area').css('height', height);
    $('#config-area').css('height', (totalHeight - height));
    if (configCollapsed()) {
      $('#reset-config-btn').hide();
    } else {
      $('#reset-config-btn').show();
    }
  };


  function getMousePos(canvas, evt) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top
    };
  }


  function updateAutoCompletion() {
    candidateIds = new Set();
    candidatePropNames = new Set();
    candidateLabels = new Set();
    for (let node of blitzboard.graph.nodes) {
      candidateIds.add(node.id);
      for (let key in node.properties) {
        candidatePropNames.add(key);
      }
      for (let label of node.labels) {
        candidateLabels.add(':' + label);
      }
    }
    for (let edge of blitzboard.graph.edges) {
      for (let label of edge.labels) {
        candidateLabels.add(':' + label);
      }
      for (let key in edge.properties) {
        candidatePropNames.add(key);
      }
    }
  }

  function htmlToElement(html) {
    let template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
  }

  function addFilterRow(parentDiv, target) {
    parentDiv.appendChild(htmlToElement(`
                        <div class="${target}-filter-row filter-row" style="display: block;">                        
                            <label class='btn text-white bg-black remove-filter-btn filter-btn' data-bs-toggle='tooltip' data-placement='bottom' href='#'
                                   title='Remove filter'>
                                <span class="material-symbols-outlined">
                                    Remove
                                </span>
                            </label>
                            <select class="filter-prop ${target}-filter-prop ${target}-filter-ui" type='text'>
                            </select>
                            <input class="filter-min ${target}-filter-min ${target}-filter-ui" type='number' placeholder="min">
                            〜
                            <input class="filter-max ${target}-filter-max ${target}-filter-ui" type='number' placeholder="max">
                        </div>
    `));
  }

  function updateFilterUI() {
    if(config.editor?.showFilterUI) {
      q('#filter-div').style.display = 'block';
      let edgeProps = sortedEdgeProperties() || [];
      qa('.edge-filter-prop').forEach((propUI, i) => {
        propUI.innerHTML = edgeProps.map((o) =>
          `<option ${edgeFilterConditions?.[i]?.prop === o ? "selected" : ""} value="${o}">${o}</option>`
        )});
      let nodeProps = sortedNodeProperties() || [];
      qa('.node-filter-prop').forEach((propUI, i) => {
        propUI.innerHTML = nodeProps.map((o) =>
        `<option ${nodeFilterConditions?.[i]?.prop === o ? "selected" : ""} value="${o}">${o}</option>`
        )});
    } else {
      q('#filter-div').style.display = 'none';
    }
  }

  function updateGraph(input, newConfig = null) {
    if(newConfig) {
      propHints = newConfig.editor?.autocomplete;
    }
    try {
      toastr.clear();

      const staticLayoutThreshold = 1000;
      
      if (!blitzboard.staticLayoutMode && editor.lineCount() >= staticLayoutThreshold) {
        blitzboard.staticLayoutMode = true;
      } else if(blitzboard.staticLayoutMode && editor.lineCount() < staticLayoutThreshold) {
        blitzboard.staticLayoutMode = false;
      }

      if (newConfig) {
        blitzboard.setGraph(input, false, nodeLayout);
        blitzboard.setConfig(newConfig);
      } else {
        blitzboard.setGraph(input, true, nodeLayout);
      }
      if(config.layout === 'hierarchical-scc') {
        $('#switch-scc-dropdown').show();
      } else {
        $('#switch-scc-dropdown').hide();
      }

      nodeLayout = blitzboard.nodeLayout;
      let layoutMap = {};
      if (nodeLayout?.graph) {
        nodeLayout.graph.forEachNode(node => {
          let position = nodeLayout.getNodePosition(node.id);
          layoutMap[node.id] = {
            x: Math.round(position.x),
            y: Math.round(position.y),
          }
        });
      }
      localStorage.setItem('nodeLayout', JSON.stringify(layoutMap));
      if (blitzboard.warnings.length > 0) {
        for (let marker of markers)
          marker.clear();
        markers = [];
        let warningMessage = '', infoMessage = '';
        let addedNode = new Set();
        let addedLineStart = editor.lineCount();
        let oldCursor = editor.getCursor();
        byProgram = true;
        for (let warning of blitzboard.warnings) {
          if (warning.type === 'UndefinedNode' && blitzboard.addedEdges.has(warning.edge.id)) {
            if (addedNode.has(warning.node))
              continue;
            insertContentsToEditor(warning.node);
            if (infoMessage !== '')
              infoMessage += ', ';
            infoMessage += `Missing node '${warning.node}' is created`;
            addedNode.add(warning.node);
          } else {
            if (warningMessage !== '')
              warningMessage += ', ';
            warningMessage += warning.message;
            markers.push(editor.markText({
                line: warning.location.start.line - 1,
                ch: warning.location.start.column - 1
              }, {line: warning.location.end.line - 1, ch: warning.location.end.column - 1},
              {className: 'syntax-warning-line', message: warning.message}));
          }
        }
        if (addedLineStart !== editor.lineCount()) {
          editor.setCursor(oldCursor);
        }
        byProgram = false;
        if (addedNode.size > 0)
          updateGraph(editor.getValue());
        if (infoMessage.length > 0)
          toastr.info(infoMessage, {preventDuplicates: true})
        if (warningMessage.length > 0)
          toastr.warning(warningMessage, {preventDuplicates: true})
      }
    } catch (e) {
      console.log(e);
      if (e instanceof Blitzboard.DuplicateNodeError) {
        for (let marker of markers)
          marker.clear();
        markers = [];
        for (let node of e.nodes) {
          markers.push(editor.markText({
              line: node.location.start.line - 1,
              ch: node.location.start.column - 1
            }, {line: node.location.end.line - 1, ch: node.location.end.column - 1},
            {className: 'syntax-error-line', message: e.message}));
        }
        toastr.error(e.message, {preventDuplicates: true})
      } else {
        toastr.error(e.toString(), 'Error occured while rendering', {preventDuplicates: true})
      }
      return null;
    }
    if (blitzboard.graph) {
      updateAutoCompletion();
      updateFilterUI();
    }
  }

  window.onresize = onResize;
  $('#input-area').resizable({handles: "e,s", grid: [1, 10000]}).bind("resize", onResize).bind("create", onResize);
  $('#pg-area').resizable({handles: "s", grid: [10000, 1]}).bind("resize", onConfigResize);

  onConfigResize(null, null);

  function showOrHideConfig() {
    if (q('#options-show-config-input').checked) {
      $('#pg-area').css('height', '50%');
      $('#config-area').css('height', '50%');
    } else {
      $('#pg-area').css('height', '100%');
      $('#config-area').css('height', '0%');
    }
    onConfigResize(null, null);
  }

  $('#edit-panel-btn').click(() => {
    if (!$('#input-area').resizable("option", "disabled"))
      prevInputWidth = $('#input-area').css('width');
    if (!q('#edit-panel-btn').checked) {
      $('#input-area').resizable('disable');
      $('#input-area').css('width', '0px');
      $('#graph-pane').css('width', '100%');
      viewMode = 'view-only';
    } else {
      const totalWidth = $("#main-area").width();
      $('#input-area').resizable('enable');
      if (!prevInputWidth)
        prevInputWidth = totalWidth / 2;
      $('#input-area').css('width', prevInputWidth);
      $('#graph-pane').css('width', totalWidth - prevInputWidth);
      viewMode = 'double-column';
      editor.refresh();
      configEditor.refresh();
    }
    localStorage.setItem('viewMode', viewMode);
    onResize(null, null);
  });


  q('#embed-btn').addEventListener('click', () => {
    content = `
                  window.addEventListener("load",function() {
                  let blitzboard; 
                  let container = document.getElementById('blitzboard');
                  blitzboard = new Blitzboard(container);
                  let config = ${configEditor.getValue()}
                  let graph = ${JSON.stringify(blitzboard.graph)};
                  blitzboard.setGraph(graph, false);
                  blitzboard.setConfig(config);
                  });
                  `;
    
    let name = (currentGraphName.startsWith('Untitled') ? 'graph' : currentGraphName) + '_' + currentTimeString();
    saveAs(new Blob([content], {type: 'text/plain'}), name + '.js');
    $('#export-btn').dropdown('toggle');
  });


  $(document).on('click', '.expand-event-tree-link', (e) => {
    let nodeId = $(e.target).data('node-id');
    axios.get(`${backendUrl}/query_table?query=SELECT v.GRAPH FROM MATCH (v) ON x2 WHERE v.ID = '${nodeId}' GROUP BY v.GRAPH`).then(response => {
      e.target.outerHTML = "<i>" + response.data.table.records.map((r) => r.GRAPH).join('<br>') + "</i>";
    }).catch((error) => {
      console.log(error);
      toastr.error(`Failed to query ${backendUrl}...: ${error}`, '', {preventDuplicates: true, timeOut: 3000});
    });
  });

  function addHighlightOptionOnModal(config) {
    let downstreamNodeIds = blitzboard.getDownstreamNodes(targetNodeIdOnModal);
    let upstreamNodeIds = blitzboard.getUpstreamNodes(targetNodeIdOnModal);
    config.edge ||= {};
    config.edge.color = (e) => {
      let inUpstream = upstreamNodeIds.has(e.from) && upstreamNodeIds.has(e.to);
      let inDownstream = downstreamNodeIds.has(e.from) && downstreamNodeIds.has(e.to);
      if(inUpstream && inDownstream) {
        return "#edc821";
      } else if(inUpstream) {
        return "#2e2edb";
      } else if(inDownstream) {
        return "#c92424";
      }
    };
  }


  $(document).on('click', '.add-node-filter-btn', (e) => {
    addFilterRow(q("#node-filter-rows"), 'node');
    updateFilterUI();
  });

  $(document).on('click', '.add-edge-filter-btn', (e) => {
    addFilterRow(q("#edge-filter-rows"), 'edge');
    updateFilterUI();
  });

  $(document).on('click', '.remove-filter-btn', (e) => {
    e.target.closest(".filter-row").remove();
    updateFilterByUI();
  });



  $(document).on('click', '.show-all-path-link', (e) => {
    targetNodeIdOnModal = $(e.target).attr('data-node-id');

    let downstreamNodeIds = blitzboard.getDownstreamNodes(targetNodeIdOnModal);
    let upstreamNodeIds = blitzboard.getUpstreamNodes(targetNodeIdOnModal);
    $('#metagraph-modal-title')[0].innerText = targetNodeIdOnModal;

    graphOnModal = {};
    graphOnModal.nodes = blitzboard.graph.nodes.filter(n => downstreamNodeIds.has(n.id) ||upstreamNodeIds.has(n.id));
    graphOnModal.edges = blitzboard.graph.edges.filter(e => upstreamNodeIds.has(e.from) && upstreamNodeIds.has(e.to) ||
        downstreamNodeIds.has(e.from) && downstreamNodeIds.has(e.to));


    if(!metaBlitzboard)
      metaBlitzboard = new Blitzboard(q('#metagraph-modal-graph'));
    metaGraphModal.show();
    metaBlitzboard.setGraph(JSON.parse(JSON.stringify(graphOnModal)), false);
    configOnModal = parseConfig(configEditor.getValue());
    $('#all-graphs-checkbox').prop('checked', false);
    $('#hierarchical-checkbox').prop('checked', false);
    if(config.layout === 'hierarchical-scc') {
      // If layout is already hierarchical-scc, hide config
      $('#hierarchical-div').hide();
    } else {
      $('#hierarchical-div').show();
    }
    addHighlightOptionOnModal(configOnModal);

    metaBlitzboard.setConfig(configOnModal, true);
  });
  
  q('#export-csv-btn').addEventListener('click', () => {
    let nodeContent = Papa.unparse(blitzboard.graph.nodes.map((n) => {
      let data = {
        id: n.id,
        label: n.labels[0]
      };
      for(let prop of Object.keys(n.properties)) {
        data[prop] = n.properties[prop][0]; 
      }
      return data;
    }));
    let edgeContent = Papa.unparse(blitzboard.graph.edges.map((e) => {
      let data = {
        from: e.from,
        to: e.to,
        label: e.labels[0]
      };
      for(let prop of Object.keys(e.properties)) {
        data[prop] = e.properties[prop][0];
      }
      return data;
    })); 
    let name = (currentGraphName.startsWith('Untitled') ? 'graph' : currentGraphName) + '-csv_' + currentTimeString();
    var zip = new JSZip();
    zip.file("nodes.csv", nodeContent);
    zip.file("edges.csv", edgeContent);
    zip.generateAsync({type: "blob"}).then(function (blob) {
      saveAs(blob, name + ".zip");
    });
    $('#export-btn').dropdown('toggle');
  });

  function newGraphName(baseName = 'Untitled') {
    // Check whether the name is suffixed by number like example-1
    let suffixMatched = baseName.match(/-(\d+$)/);
    let i = 0;
    if (suffixMatched) {
      let suffix = suffixMatched[0];
      baseName = baseName.substring(0, baseName.length - suffix.length);
      i = parseInt(suffixMatched[1]);
    }
    let name = baseName;
    while (savedGraphNames.indexOf(name) >= 0) {
      name = baseName + '-' + (++i);
    }
    return name;
  }


  function newNodeName(baseName = 'New') {
    let name = baseName;
    let i = 0;
    while (blitzboard.nodeDataSet.get(name)) {
      name = baseName + '-' + (++i);
    }
    return name;
  }

  function showGraphName() {
    $('#history-dropdown')[0].innerText = currentGraphName;
    $('title').html(currentGraphName);
  }

  function updateHistoryMenu(graphs) {
    let menu = q('#history-menu');
    // clear menu
    while (menu.firstChild) {
      menu.removeChild(menu.firstChild);
    }
    for (let graph of graphs) {
      let node = document.createElement('a');
      node.className = 'dropdown-item history-item mr-3';
      if (graph.name === currentGraphName)
        node.className += ' active text-white';
      node.style = 'position:relative';
      node.appendChild(document.createTextNode(graph.name));
      node.appendChild(document.createElement("br"));
      if (graph.date)
        node.appendChild(document.createTextNode(dateTimeFormat.format(new Date(graph.date))));
      let deleteButton = document.createElement('div');
      deleteButton.className = 'delete-history-btn btn btn-danger p-0';
      deleteButton.style = 'position:absolute; top: 5px; right: 5px; width: 25px; height: 25px';
      let span = document.createElement('span');
      span.className = 'ion-android-close';
      deleteButton.appendChild(span);
      node.appendChild(deleteButton);
      let editButton = document.createElement('div');
      editButton.className = 'edit-history-btn btn btn-secondary p-0';
      editButton.setAttribute('title', 'Edit name')
      editButton.style = 'position:absolute; top: 5px; right: 35px; width: 25px; height: 25px';
      span = document.createElement('span');
      span.className = 'ion-android-create';
      editButton.appendChild(span);

      node.appendChild(editButton);
      menu.appendChild(node);
    }
  }

  function updateGraphList(callback = null) {
    savedGraphNames = [];
    if (remoteMode) {
      axios.get(`${backendUrl}/list`).then(response => {
        updateHistoryMenu(response.data.map((g) => {
          return {name: g};
        }));
        savedGraphNames = response.data;
        if (callback)
          callback();
      }).catch((error) => {
        console.log(error);
        toastr.error(`Failed to retrieve graph list from ${backendUrl}...: ${error}`, '', {preventDuplicates: true, timeOut: 3000});
      });
      
      axios.get(`${backendUrl}/query_table?query=SELECT v.id, COUNT(*) AS cnt FROM MATCH (v) ON x2 GROUP BY v.id ORDER BY cnt DESC`).then(response => {
        additionalAutocompleteTargets = response.data.table.records.map((r) => r.ID);
      }).catch((error) => {
        console.log(error);
        toastr.error(`Failed to retrieve candidate nodes from ${backendUrl}...: ${error}`, '', {preventDuplicates: true, timeOut: 3000});
      });
    } else {
      graphsFromLocalStorage = [];
      for (let i = 0; i < localStorage.length; i++) {
        if (localStorage.key(i).indexOf('saved-graph-') != -1) {
          try {
            let graph = JSON.parse(localStorage.getItem(localStorage.key(i)));
            if(graph.name && graph.pg && graph.config)
              graphsFromLocalStorage.push(graph);
            else
              localStorage.removeItem(localStorage.key(i));
          } catch (e) {
            localStorage.removeItem(localStorage.key(i));
          }
        }
      }
      savedGraphNames = graphsFromLocalStorage.sort((a, b) => b.date - a.date).map((g) => g.name);
      updateHistoryMenu(savedGraphNames.map((g) => {
        return {name: g};
      }));
      if (callback)
        callback();
    }
  }


  $(document).on('click', '.edit-history-btn', (e) => {
    let item = $(e.target).closest('.history-item')[0];
    let i = $('.history-item').index(item);
    let oldName = savedGraphNames[i];

    Swal.fire({
      text: `What is the new name of the page?`,
      inputValue: oldName,
      input: 'text',
      showCancelButton: true,
      inputPlaceholder: 'New name',
      confirmButtonText: 'Rename',
    }).then((result) => {
      if(result.isConfirmed && result.value) {
        let newName = result.value;
        if (remoteMode) {
          axios.get(`${backendUrl}/get/?graph=${oldName}`).then((response) => {
            let properties = response.data.properties;
            axios.request({
              method: 'post',
              url: `${backendUrl}/drop`,
              data: `graph=${oldName}`,
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
            }).finally((res) => {
              let pgJSON = blitzboard.tryPgParse(properties.pg[0]);
              let [nodes, edges] = nodesAndEdgesForSaving(pgJSON.nodes, pgJSON.edges);
              let graph = {
                name: newName,
                properties,
                pg: {
                  nodes,
                  edges
                }
              };
              axios.post(`${backendUrl}/create`, graph).then((res) => {
                savedGraphNames[i] = newName;
                updateGraphList();
                if (currentGraphName === oldName) {
                  currentGraphName = newName;
                }
                showGraphName();
                toastr.success(`${newName} has been saved!`, '', {preventDuplicates: true, timeOut: 3000});
              }).catch((error) => {
                toastr.error(`Failed to save ${newName}..`, '', {preventDuplicates: true, timeOut: 3000});
              });
            }).catch((error) => {
              toastr.error(`Failed to drop ${oldName}..`, '', {preventDuplicates: true, timeOut: 3000});
            });
          }).catch((error) => {
            toastr.error(`Failed to retrieve ${oldName}..`, '', {preventDuplicates: true, timeOut: 3000});
          });;
        } else {
          let graph =
            JSON.parse(localStorage.getItem('saved-graph-' + oldName));
          localStorage.removeItem('saved-graph-' + oldName);
          if (currentGraphName === oldName) {
            currentGraphName = newName;
            showGraphName();
          }
          graph.name = newName;
          localStorage.setItem('saved-graph-' + newName, JSON.stringify(graph));
          updateGraphList();
        }
      }
    })
    e.stopPropagation();
  });

  $(document).on('click', '.delete-history-btn', (e) => {
    let item = $(e.target).closest('.history-item')[0];
    let i = $('.history-item').index(item);
    let name = savedGraphNames[i];

    Swal.fire({
      text: `Delete ${name}?`,
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: 'Delete',
    }).then((result) => {
      if(result.isConfirmed) {
        if (remoteMode) {
          axios.request({
            method: 'post',
            url: `${backendUrl}/drop`,
            data: `graph=${name}`,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }).then((res) => {
            toastr.success(`${name} has been removed!`, '', {preventDuplicates: true, timeOut: 3000});
            updateGraphList(() => {
              if (currentGraphName === name) {
                currentGraphName = savedGraphNames[0];
                loadCurrentGraph();
                showGraphName();
              }
            });
          }).catch((error) => {
            toastr.error(`Failed to drop ${name}..`, '', {preventDuplicates: true, timeOut: 3000});
          });
        } else {
          localStorage.removeItem('saved-graph-' + name);
          toastr.success(`${name} has been removed!`, '', {preventDuplicates: true, timeOut: 3000});
          updateGraphList(() => {
            if (currentGraphName === name) {
              currentGraphName = savedGraphNames[0];
              loadCurrentGraph();
              showGraphName();
            }
          });
        }
      }
    });
    e.stopPropagation();
  });

  function loadGraph(graph) {
    if(!graph)
      return;
    byProgram = true;
    editor.setValue(graph.pg);
    configEditor.setValue(graph.config);
    editor.getDoc().clearHistory();
    configEditor.getDoc().clearHistory();
    currentGraphName = graph.name;
    nodeLayout = graph.layout;
    $('.dropdown-item.history-item').removeClass('active');
    $('.dropdown-item.history-item').removeClass('text-white');
    let i = savedGraphNames.indexOf(graph.name);
    $(`.dropdown-item.history-item:eq(${i})`).addClass('active');
    $(`.dropdown-item.history-item:eq(${i})`).addClass('text-white');
    reloadConfig();
    showGraphName();
    unsavedChangeExists = false;
    if(remoteMode && graph.lastUpdate)
      lastUpdate = graph.lastUpdate;
    
    byProgram = false;
  }
  
  function loadGraphByName(graphName) {
    if (remoteMode) {
      axios.get(`${backendUrl}/get/?graph=${graphName}`).then((response) => {
        let props = response.data.properties;
        let config = props?.config?.[0] || defaultConfig;
        if(props?.pg === undefined || props?.config === undefined) {
          axios.get(`${backendUrl}/get/?graph=${graphName}&response=pg`).then((response) => {
            byProgram = true;
            loadGraph({
              name: graphName,
              pg: json2pg.translate(JSON.stringify(response.data.pg)),
              config
            });
            byProgram = false;
            editor.getDoc().clearHistory();
          });
        } else {
          byProgram = true;
          loadGraph({
            name: graphName,
            pg: props.pg[0],
            config: props.config[0],
            lastUpdate: props.lastUpdate[0]
          });
          byProgram = false;
          editor.getDoc().clearHistory();
        }
      });
    } else {
      let graph = JSON.parse(localStorage.getItem('saved-graph-' + graphName));
      loadGraph(graph);
    }
  }

  $(document).on('click', '.history-item', (e) => {
    let i = $('.history-item').index(e.target);
    let graph = savedGraphNames[i];
    confirmToSaveGraph(() => {
      loadGraphByName(graph);
    });
  });


  $(document).on('change', '.edge-filter-ui', (e) => {
    updateConfigByUI();
    edgeFilterConditions = retrieveFilterConditions(qa('.edge-filter-row'), 'edge');
    localStorage.setItem('edgeFilterConditions', JSON.stringify(edgeFilterConditions));
    triggerGraphUpdate(editor.getValue(), config);
  });

  function retrieveFilterConditions(filterRows, prefix = 'node') {
    let filterConditions = [];
    for(let filterRow of filterRows) {
      let propName = filterRow.querySelector(`.${prefix}-filter-prop`).value;
      let propMin = parseFloat(filterRow.querySelector(`.${prefix}-filter-min`).value);
      let propMax = parseFloat(filterRow.querySelector(`.${prefix}-filter-max`).value);
      if(!isNaN(propMin))
        if(!isNaN(propMax))
          filterConditions.push({
            prop: propName,
            min: propMin,
            max: propMax
          });
        else
          filterConditions.push({
            prop: propName,
            min: propMin,
          });
      else if(!isNaN(propMax))
        filterConditions.push({
          prop: propName,
          max: propMax,
        });
      else {
        filterConditions.push({
          prop: propName
        });
      }
    }
    return filterConditions;
  }

  function updateFilterByUI() {
    updateConfigByUI();
    nodeFilterConditions = retrieveFilterConditions(qa('.node-filter-row'), 'node');
    localStorage.setItem('nodeFilterConditions', JSON.stringify(nodeFilterConditions));
    edgeFilterConditions = retrieveFilterConditions(qa('.edge-filter-row'), 'edge');
    localStorage.setItem('edgeFilterConditions', JSON.stringify(edgeFilterConditions));
    triggerGraphUpdate(editor.getValue(), config);
  }

  $(document).on('change', '.node-filter-ui', (e) => {
    updateFilterByUI();
  });

  $(document).on('change', '.edge-filter-ui', (e) => {
    updateFilterByUI();
  });

  function saveCurrentGraph(callback = null) {
    let name = currentGraphName;
    if (!name) {
      name = newGraphName();
    }
    let i = -1;
    let layoutMap = {};
    if (nodeLayout?.graph) {
      nodeLayout.graph.forEachNode(node => {
        let position = nodeLayout.getNodePosition(node.id);
        layoutMap[node.id] = {
          x: Math.round(position.x),
          y: Math.round(position.y),
        }
      });
    } else {
      layoutMap = nodeLayout;
    }
    localStorage.setItem('nodeLayout', JSON.stringify(layoutMap));
    if (!remoteMode) {
      let graph = {
        pg: editor.getValue(),
        config: configEditor.getValue(),
        layout: layoutMap,
        name: name,
        date: Date.now()
      };
      while (i < savedGraphNames.length - 1 && savedGraphNames[++i].name !== name) ;
      if (i < savedGraphNames.length) {
        savedGraphNames[i] = graph;
      }
      localStorage.setItem('saved-graph-' + name, JSON.stringify(graph));
      updateGraphList();
      if(callback)
        callback();
    } else {
      saveToBackend(callback);
    }
  }
  
  function saveToBackend(callback = null) {
    let [tmpNodes, tmpEdges] = nodesAndEdgesForSaving();
    let graphName = currentGraphName;
    let configValue = configEditor.getValue();
    let pgValue = editor.getValue();

    axios.get(`${backendUrl}/get/?graph=${currentGraphName}`).then((response) => {
      let props = response.data.properties;
      if (props?.lastUpdate && props.lastUpdate[0] > lastUpdate) {
        Swal.fire({
          text: "This data has been updated outside. Please reload first.",
          icon: "error",
        });
      } else {
        let now = Date.now();
        lastUpdate = now;

        let savedData = {
          name: graphName,
          properties: {
            pg: [pgValue],
            config: [configValue],
            lastUpdate: [now],
            updatedBy: ['blitzboard']
          },
          pg: {
            nodes: tmpNodes,
            edges: tmpEdges
          }
        };

        let action = savedGraphNames.includes(graphName) ? 'update' : 'create';

        axios.post(`${backendUrl}/${action}`, savedData).then((res) => {
          toastr.success(`${graphName} has been saved!`, '', {preventDuplicates: true, timeOut: 3000});
          updateGraphList();
          setUnsavedStatus(false);
          if(callback)
            callback();
        }).catch((error) => {
          toastr.error(`Failed to save ${graphName} ..`, '', {preventDuplicates: true, timeOut: 3000});
        });
      }
    });
  }
  
  function confirmToSaveGraph(callback = null) {
    if(!(remoteMode && unsavedChangeExists)) {
      if(callback)
        callback();
      return Promise.resolve(); // Empty promise (resolved immediately)
    }

    return Swal.fire({
      text: `Save your change for "${currentGraphName}" before leaving?`,
      icon: 'warning',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: 'Save',
      denyButtonText: `Discard`,
    }).then((result) => {
      if (result.isConfirmed && callback) {
        saveCurrentGraph(callback);
      } else if(result.isDenied && callback) {
        callback();
      }
    })
  }
  
  function createNewGraph(templateIndex) {
    let template = pageTemplates[templateIndex];
    let name = newGraphName(template.name);
    byProgram = true;
    currentGraphName = name;
    loadGraph({
      name: name,
      pg: template.pg,
      config: template.config
    });
    byProgram = false;
    saveCurrentGraph();
  }


  $('.template-dropdown').on('click', (e) => {
    confirmToSaveGraph(() => createNewGraph($(e.target).data('index')));
  });


  q('#clone-btn').addEventListener('click', () => {
    Swal.fire({
      text: `What is the name of the cloned page?`,
      inputValue: currentGraphName,
      input: 'text',
      showCancelButton: true,
      inputPlaceholder: 'Name',
      confirmButtonText: 'Clone',
      inputValidator: (value) => {
        if(value.trim().length === 0) {
          return 'Page name must not be empty.';
        }
        if(savedGraphNames.indexOf(value) >= 0)
          return `"${value}" already exists. Please specify a different name.`;
      }
    }).then((result) => {
      if(result.isConfirmed) {
        currentGraphName = result.value.trim();
        saveCurrentGraph();
        showGraphName();
        blitzboard.update(false);
      }
    })
  });

  function nodesAndEdgesForSaving(nodes = null, edges = null) {
    if(!nodes)
      nodes = blitzboard.graph.nodes;
    if(!edges)
      edges = blitzboard.graph.edges;
    let tmpNodes = JSON.parse(JSON.stringify(nodes));
    let tmpEdges = JSON.parse(JSON.stringify(edges));
    for (let node of tmpNodes) {
      delete node.location;
    }
    for (let edge of tmpEdges) {
      delete edge.location;
      delete edge.id;
      edge.undirected = edge.direction === '--';
      delete edge.direction;
    }
    return [tmpNodes, tmpEdges];
  }

  if (!remoteMode) {
    q('#save-btn').classList.add('d-none');
  }
  
  function setUnsavedStatus(unsaved) {
    unsavedChangeExists = unsaved;
    if(unsavedChangeExists)
      q('#save-btn').classList.remove('disabled');
    else
      q('#save-btn').classList.add('disabled');
  }

  q('#save-btn').addEventListener('click', () => {
    if (remoteMode) {
      saveToBackend();
    }
  });

  q('#reset-config-btn').addEventListener('click', () => {
    Swal.fire({
      text: `Reset config?`,
      showCancelButton: true,
      confirmButtonText: 'Reset',
      confirmButtonColor: "#d33",
    }).then(result => {
      if(result.isConfirmed) {
        configEditor.setValue(defaultConfig);
      }
    })
  });

  q('#zoom-fit-btn').addEventListener('click', () => {
    blitzboard.fit();
  });

  q('#export-zip-btn').addEventListener('click', () => {
    var zip = new JSZip();
    let name = (currentGraphName.startsWith('Untitled') ? 'graph' : currentGraphName) + '_' + currentTimeString();
    zip.file("graph.pg", editor.getValue());
    zip.file("config.js", configEditor.getValue());
    zip.generateAsync({type: "blob"}).then(function (blob) {
      saveAs(blob, name + ".zip");
    });
    $('#export-btn').dropdown('toggle');
  });


  q('#import-btn').addEventListener('click', (e) => {
    confirmToSaveGraph(() => {
      q('#import-input').value = '';
      q('#import-input').click();
    });
  });

  q('#import-input').addEventListener('change', (evt) => {
    function handleFile(f) {
      let nameWithoutExtension = f.name.includes('.') ? f.name.split('.').slice(0, -1).join('.') : f.name;
      // Remove datetime part like '****_20200101123045
      nameWithoutExtension = nameWithoutExtension.replace(/_\d{8,15}$/, '');
      JSZip.loadAsync(f).then(function (zip) {
        if (zip.file("nodes.csv") && zip.file("edges.csv")) {
          nameWithoutExtension = nameWithoutExtension.replace(/-csv$/, '');
          zip.file("nodes.csv").async("string").then(function success(content) {
            let nodes = Papa.parse(content, {header: true}).data;
            zip.file("edges.csv").async("string").then(function success(content) {
              let edges = Papa.parse(content, {header: true}).data;
              // The same process as #new-btn is clicked
              let name = newGraphName(nameWithoutExtension);
              currentGraphName = name;

              let nodeContent = nodes.map((n) => {
                let line = n.id.quoteIfNeeded();
                if(n.label)
                  line += " :" + n.label.quoteIfNeeded();
                for(let key of Object.keys(n)) {
                  if(key !== 'id' && key !== 'label' && n[key]?.length > 0) {
                    line += ` ${key.quoteIfNeeded()}:${n[key].quoteIfNeeded()}`;
                  }
                }
                return line;
              }).join("\n");

              let edgeContent = edges.map((e) => {
                let line = `${e.from.quoteIfNeeded()} -> ${e.to.quoteIfNeeded()}`;
                if(e.label)
                  line += " :" + e.label.quoteIfNeeded();
                for(let key of Object.keys(e)) {
                  if(key !== 'from' && key !== 'to' && key !== 'label' && e[key]?.length > 0) {
                    line += ` ${key.quoteIfNeeded()}:${e[key].quoteIfNeeded()}`;
                  }
                }
                return line;
              }).join("\n");
              
              loadValues(nodeContent + "\n" + edgeContent, defaultConfig);
              saveCurrentGraph();
              showGraphName();
            });
          });
        }
        else if (!zip.file("graph.pg") || !zip.file("config.js")) {
          Swal.fire({
            text: "Invalid zip file",
            icon: "error",
          });
        } else {
          zip.file("graph.pg").async("string").then(function success(content) {
            let graph = content;
            zip.file("config.js").async("string").then(function success(content) {
              let config = content;
              // The same process as #new-btn is clicked
              let name = newGraphName(nameWithoutExtension);
              currentGraphName = name;
              loadValues( graph, config);
              saveCurrentGraph();
              showGraphName();
            });
          });
        }
      }, function (e) {
        Swal.fire({
          text: `Error reading ${f.name}: ${e.message}`,
          icon: "error",
        });
      });
    }

    var files = evt.target.files; // A single file is accepted so far
    for (var i = 0; i < files.length; i++) {
      handleFile(files[i]);
    }
  });

  q('#export-cypher-btn').addEventListener('click', () => {

    let pg = pgParser.parse(editor.getValue());
    let output = "";
    pg.nodes.forEach(node => {
      let node_label = (node.labels[0] === undefined) ? "UNDEFINED" : node.labels[0]
      let query = "";
      query = query + "CREATE (v:" + node_label + " {"; // Restriction: single vertex label
      query = query + "id: '" + node.id + "'"; // ID is stored as a string property
      for (let entry of Object.entries(node.properties)) {
        query = query + ", " + entry[0] + ": '" + entry[1] + "'"; // values are always stored as sting
      }
      query = query + "});";
      output = output + query + '\n';
    });
    pg.edges.forEach(edge => {
      let edge_label = (edge.labels[0] === undefined) ? "UNDEFINED" : edge.labels[0]
      let query = "";
      query = query + "MATCH (src {id: '" + edge.from + "'}) MATCH (dst {id: '" + edge.to + "'}) CREATE (src)-[e:";
      query = query + edge_label;
      query = query + " {";
      for (let entry of Object.entries(edge.properties)) {
        query = query + ", " + entry[0] + ": '" + entry[1] + "'"; // values are always stored as sting
      }
      query = query + "}]->(dst);";
      output = output + query + '\n';
    });
    saveAs(new Blob([output], {type: 'text/plain'}), 'graph_' + currentTimeString() + '.cypher');
    $('#export-btn').dropdown('toggle');
  });

  q('#export-pgql-btn').addEventListener('click', () => {
    let pg = pgParser.parse(editor.getValue());
    let graphName = currentGraphName;
    let graphNamePGQL = graphName.replace('\'', '').replace(' ', '_').replace('-', '_').toLowerCase(); // must be simple SQL name
    let output = "";
    output = output + "CREATE PROPERTY GRAPH " + graphNamePGQL + ";\n";
    pg.nodes.forEach(node => {
      let node_label = (node.labels[0] === undefined) ? "UNDEFINED" : node.labels[0]
      let query = "";
      query = query + "INSERT INTO " + graphNamePGQL + " ";
      query = query + "VERTEX v LABELS (\"" + node_label.toUpperCase() + "\") "; // Restriction: single vertex label
      query = query + "PROPERTIES (";
      query = query + "v.id = '" + node.id + "'"; // ID is stored as a string property
      let json = "{\"ID\":[\"" + node.id + "\"]";
      for (let entry of Object.entries(node.properties)) {
        json = json + ", \"" + entry[0].toUpperCase() + "\":[\"" + entry[1] + "\"]"; // values are always stored as sting
      }
      json = json + "}";
      query = query + ", v.json = '" + json + "'";
      query = query + ");";
      output = output + query + '\n';
    });
    pg.edges.forEach(edge => {
      let edge_label = (edge.labels[0] === undefined) ? "UNDEFINED" : edge.labels[0]
      let query = "";
      query = query + "INSERT INTO " + graphNamePGQL + " ";
      query = query + "EDGE e BETWEEN src AND dst LABELS (\"" + edge_label.toUpperCase() + "\") "; // Restriction: single vertex label
      query = query + "PROPERTIES (";
      query = query + "e.direction = '" + edge.direction + "'";
      let json = "{\"FROM\":[\"" + edge.from + "\"], \"TO\":[\"" + edge.to + "\"]";
      for (let entry of Object.entries(edge.properties)) {
        json = json + ", \"" + entry[0].toUpperCase() + "\":[\"" + entry[1] + "\"]"; // values are always stored as sting
      }
      json = json + "}";
      query = query + ", e.json = '" + json + "'";
      query = query + ") ";
      query = query + "FROM MATCH ( (src), (dst) ) ON " + graphNamePGQL + " ";
      query = query + "WHERE src.id = '" + edge.from + "' AND dst.id = '" + edge.to + "';";
      output = output + query + '\n';
    });
    saveAs(new Blob([output], {type: 'text/plain'}), 'graph_' + currentTimeString() + '.pgql');
    $('#export-btn').dropdown('toggle');
  });

  q('#export-sql-btn').addEventListener('click', () => {
    let pg = pgParser.parse(editor.getValue());
    let graphName = currentGraphName;
    let graphNameSQL = graphName.replace('\'', '').replace(' ', '_').replace('-', '_').toLowerCase(); // must be simple SQL name
    let output = "";
    let create_table_node = `
        CREATE TABLE ${graphNameSQL}_node
        (
            id VARCHAR2
        (
            255
        )
            , label VARCHAR2
        (
            255
        )
            , props VARCHAR2
        (
            4000
        )
            , CONSTRAINT node_pk PRIMARY KEY
        (
            id
        )
            , CONSTRAINT node_check CHECK
        (
            props IS JSON
        )
            );
    `;
    let create_table_edge = `
        CREATE TABLE ${graphNameSQL}_edge
        (
            id VARCHAR2
        (
            255
        )
            , src VARCHAR2
        (
            255
        )
            , dst VARCHAR2
        (
            255
        )
            , label VARCHAR2
        (
            255
        )
            , props VARCHAR2
        (
            4000
        )
            , CONSTRAINT edge_pk PRIMARY KEY
        (
            id
        )
            , CONSTRAINT edge_fk_src FOREIGN KEY
        (
            src
        ) REFERENCES node
        (
            id
        )
            , CONSTRAINT edge_fk_dst FOREIGN KEY
        (
            dst
        ) REFERENCES node
        (
            id
        )
            , CONSTRAINT edge_check CHECK
        (
            props IS JSON
        )
            );
    `;
    output = output + create_table_node + create_table_edge + "\n";
    pg.nodes.forEach(node => {
      let node_label = (node.labels[0] === undefined) ? "UNDEFINED" : node.labels[0]
      let json = "{\"ID\":[\"" + node.id + "\"]";
      for (let entry of Object.entries(node.properties)) {
        json = json + ", \"" + entry[0].toUpperCase() + "\":[\"" + entry[1] + "\"]"; // values are always stored as sting
      }
      json = json + "}";
      let query = `INSERT INTO ${graphNameSQL}_node
                   VALUES ('${node.id}', '${node_label.toUpperCase()}', '${json}');`;
      output = output + query + '\n';
    });

    function generateUuid() {
      let chars = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".split("");
      for (let i = 0, len = chars.length; i < len; i++) {
        switch (chars[i]) {
          case "x":
            chars[i] = Math.floor(Math.random() * 16).toString(16);
            break;
          case "y":
            chars[i] = (Math.floor(Math.random() * 4) + 8).toString(16);
            break;
        }
      }
      return chars.join("");
    }

    pg.edges.forEach(edge => {
      let edge_label = (edge.labels[0] === undefined) ? "UNDEFINED" : edge.labels[0]
      let json = "{\"FROM\":[\"" + edge.from + "\"], \"TO\":[\"" + edge.to + "\"]";
      for (let entry of Object.entries(edge.properties)) {
        json = json + ", \"" + entry[0].toUpperCase() + "\":[\"" + entry[1] + "\"]"; // values are always stored as sting
      }
      json = json + "}";
      let query = `INSERT INTO ${graphNameSQL}_edge
                   VALUES ('${generateUuid()}', '${edge.from}', '${edge.to}', '${edge_label.toUpperCase()}', '${json}');`;
      output = output + query + '\n';
    });
    saveAs(new Blob([output], {type: 'text/plain'}), 'graph_' + currentTimeString() + '.sql');
    $('#export-btn').dropdown('toggle');
  });

  q('#export-png-btn').addEventListener('click', () => {
    let url = blitzboard.network.canvas.getContext().canvas.toDataURL("image/png");
    let a = document.createElement('a');
    a.href = url;
    a.download = 'graph_' + currentTimeString() + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    $('#export-btn').dropdown('toggle');
  });

  window.addEventListener("beforeunload",  (e) => {
    localStorage.setItem('currentGraphName', currentGraphName);
    if (!(remoteMode && unsavedChangeExists)) {
      return undefined;
    }
    e.preventDefault();
    return e.returnValue = "Your change is not saved. Are you sure you want to exit?";
  });

  let extraKeys = {
    Tab: 'autocomplete',
    Esc: (cm) => cm.closeDialog()
  };
  let shortcutPrefix = clientIsMac ? "Cmd-" : "Ctrl-";
  extraKeys[shortcutPrefix + "F"] = "findPersistent";
  extraKeys[shortcutPrefix + "/"] = (cm) => cm.toggleComment();

  editor = CodeMirror.fromTextArea(q('#graph-input'), {
    lineNumbers: true,
    viewportMargin: 300,
    theme: "monokai",
    lineWrapping: true,
    mode: "pgMode",
    search: {
      bottom: true
    },
    specialChars: /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b\u200e\u200f\u2028\u2029\u202d\u202e\u2066\u2067\u2069\ufeff\ufff9-\ufffc　：]/,
    specialCharPlaceholder: (char) => {
      const node = document.createElement('span');
      node.className = 'double-byte-highlight';
      if(char === '：' || char === '　')
        node.innerText = char;
      return node;
    },
    extraKeys,
    hintOptions: {
      completeSingle: false
    }
  });
  
  editor.on('keydown', (cm, e) => {
    if (e.keyCode === 83 && (!clientIsMac && e.ctrlKey || clientIsMac && e.metaKey)) {
      // ctrl + S
      showSortModal();
      e.preventDefault();
    }
  });
  editor.setSize('100%', '100%');

  q('#sort-modal').addEventListener('keydown', (e) => {
    if (e.keyCode === 13) {
      q('#sort-btn').click();
      e.preventDefault();
    }
  });

  toastr.options.timeOut = 0; // Set toastr persistent until remove() is called
  toastr.options.positionClass = "toast-top-right";

  let oldHint = CodeMirror.hint.anyword;

  CodeMirror.hint.pgMode = function (editor) {
    let word = /[^\s]+/;
    let cur = editor.getCursor(), curLine = editor.getLine(cur.line);
    let end = cur.ch, start = end;
    while (start && word.test(curLine.charAt(start - 1))) --start;
    let curWord = start !== end && curLine.slice(start, end);

    let list = [];

    if(propHints && typeof curWord === "string" && curWord.includes(":")) {
      let idx = curWord.lastIndexOf(":");
      let currentProp = curWord.substring(0, idx).trim();
      if(currentProp.startsWith('"') && currentProp.endsWith('"') ||
        currentProp.startsWith("'") && currentProp.endsWith("'")
      )
      currentProp = currentProp.substring(1, currentProp.length - 1);
      for(let prop of Object.keys(propHints)) {
        if(currentProp === prop) {
          let hints = propHints[prop];
          let typedValue = curWord.substring(idx + 1).trim();
          for(let hint of hints) {
            if(hint.label.startsWith(typedValue) && hint.label !== typedValue ||
              hint.value.startsWith(typedValue) && hint.value !== typedValue ) {
              list.push({ displayText: hint.label, text: hint.value });
            }
          }
          let from = CodeMirror.Pos(cur.line, start + idx + 1);
          // Move forward until reach to whitespace
          while (end && word.test(curLine.charAt(end - 1))) ++end;
          let to = CodeMirror.Pos(cur.line, end - 1);
          if(list.length === 1) {
            setTimeout(() => {
              byProgram = true;
              editor.replaceRange(list[0].text, from, to);
              byProgram = false;
              editor.closeHint();
            }, 0);
            return {list: [], from, to};
          }
          return {
            list: list,
            from, to
          };
        }
      }
    }
    for (let candidateList of [candidateIds, candidatePropNames, candidateLabels, additionalAutocompleteTargets]) {
      for (let candidate of candidateList) {
        if (candidate.includes(curWord) && !list.includes(candidate) && candidate !== curWord)
          list.push(candidate);
        if(list.length >= 20) break;
      }
      if(list.length >= 20) break;
    }
    return {list: list, from: CodeMirror.Pos(cur.line, start), to: CodeMirror.Pos(cur.line, end)};
  };


  extraKeys = {
    "Shift-Tab": "indentLess",
  }
  extraKeys[shortcutPrefix + "F"] = "findPersistent";
  extraKeys[shortcutPrefix + "/"] = (cm) => cm.toggleComment();

  configEditor = CodeMirror.fromTextArea(q('#config-input'), {
    viewportMargin: Infinity,
    theme: "monokai",
    mode: {name: 'javascript', json: true},
    lineWrapping: true,
    specialChars: /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b\u200e\u200f\u2028\u2029\u202d\u202e\u2066\u2067\u2069\ufeff\ufff9-\ufffc　：]/,
    specialCharPlaceholder: (char) => {
      const node = document.createElement('span');
      node.className = 'double-byte-highlight';
      if(char === '：' || char === '　')
        node.innerText = char;
      return node;
    },
    extraKeys,
    hintOptions: {
      completeSingle: false,
    },
  });

  configEditor.setSize('100%', '100%');

  editor.on("inputRead", (instance) => {
    if (autocompletion)
      editor.execCommand('autocomplete', {completeSingle: false});
  });

  function loadSample(sampleName, callback, callbackOnError = null) {
    let graph, config;
    let graphPromise = new Promise((resolve, reject) => {
      $.get(`https://raw.githubusercontent.com/blitzboard/samples/main/${sampleName}/graph.pg`, (res) => {
        graph = res;
        resolve();
      }).fail(() => reject());
    });
    let configPromise = new Promise((resolve, reject) => {
      $.get(`https://raw.githubusercontent.com/blitzboard/samples/main/${sampleName}/config.js`, (res) => {
        config = res;
        resolve();
      }).fail(() => reject());
    });
    Promise.all([graphPromise, configPromise]).then(() => {
      callback(graph, config);
    }, () => {
      if(callbackOnError !== null)
        callbackOnError();
    });
  }


  function reflectEditorChange() {
    // localStorage.setItem('pg', editor.getValue());
    if(!remoteMode)
      saveCurrentGraph();

    updateGraph(editor.getValue());
    blitzboard.hideLoader();
    clearTimeout(pgTimerId);
    pgTimerId = null;
  }

  function onEditorChanged(delta) {
    if (!byProgram) {
      if (!pgTimerId)
        blitzboard.showLoader();
      clearTimeout(pgTimerId);
      localMode = true;
      setUnsavedStatus(true);
      pgTimerId = setTimeout(() => {
        reflectEditorChange();
      }, 1000);
    }
  }

  editor.on('keydown', (cm, e) => {
    if (e.ctrlKey && e.keyCode === 13) {
      // ctrl + enter
      reflectEditorChange();
    }
    // invoke only if timer is working
    else if (pgTimerId) onEditorChanged();
  });
  editor.on('change', onEditorChanged);
  editor.on('inputRead', onEditorChanged);

  editor.on('cursorActivity', (doc) => {
    if (!byProgram) {
      if (focusTimerId)
        clearTimeout(focusTimerId);
      focusTimerId = setTimeout(() => {
        const node = blitzboard.nodeLineMap[doc.getCursor().line + 1];
        const edge = blitzboard.edgeLineMap[doc.getCursor().line + 1];

        if (node) {
          blitzboard.scrollNodeIntoView(node)
        } else if (edge) {
          blitzboard.scrollEdgeIntoView(edge)
        }
      }, blitzboard.staticLayoutMode ? 1000 : 100);
      if(getCurrentCharacter() === ':')
        editor.showHint();
    }
  });

  function triggerGraphUpdate(pgValue, config) {
    blitzboard.showLoader();
    setTimeout(() => { updateGraph(pgValue, config); blitzboard.hideLoader(); } );
  }

  function loadValues(pgValue, configValue) {
    byProgram = true;
    editor.setValue(pgValue);
    editor.getDoc().clearHistory();
    configEditor.setValue(configValue);
    config = parseConfig(configValue);
    byProgram = false;
    triggerGraphUpdate(pgValue, config);
  }
  
  function loadCurrentGraph() {
    if (remoteMode) {
      axios.get(`${backendUrl}/get/?graph=${currentGraphName}`).then((response) => {
        let props = response.data.properties;
        let config = props?.config?.[0] || defaultConfig;
        if(props?.pg === undefined || props?.config === undefined) {
          axios.get(`${backendUrl}/get/?graph=${currentGraphName}&response=pg`).then((response) => {
            loadValues( json2pg.translate(JSON.stringify(response.data.pg)), config);
            setUnsavedStatus(false);
          });
        } else {
          loadValues(props.pg[0], config);
          setUnsavedStatus(false);
        }
      });
    } else {
      try {
        let graph = JSON.parse(localStorage.getItem('saved-graph-' + currentGraphName));
        if(graph.pg.length > 0 && graph.config.length > 0)
          loadValues(graph.pg, graph.config);
      } catch (e) {
      }
    }
  }

  const urlParams = new URLSearchParams(window.location.search);
  let sampleNameInParam = urlParams.get('sample');

  if (sampleNameInParam) {
    if(remoteMode) {
      localStorage.setItem('sample', sampleNameInParam);
      window.location.href = window.location.href.split('?')[0];
    } else {
      loadSample(sampleNameInParam, (graph, config) => {
        currentGraphName = newGraphName(sampleNameInParam);
        localStorage.setItem('currentGraphName', currentGraphName);
        byProgram = true;
        editor.setValue(graph);
        configEditor.setValue(config);
        saveCurrentGraph();
        window.location.href = window.location.href.split('?')[0];
      });
    }
  } else if(urlParams.get('backendURL')) {
    localStorage.setItem('backendUrl', urlParams.get("backendURL"));
    window.location.href = window.location.href.split('?')[0]; // Jump to URL without query parameter
  } else if(!remoteMode) {
    let pgInParam = urlParams.get('pg'), nodePropInParam = urlParams.get('displayedNodeProps'),
      edgePropInParam = urlParams.get('displayedEdgeProps');
    let configInParam = urlParams.get('config');
    let graphNameInParam = urlParams.get('name');
    let viewModeInParam = urlParams.get('viewMode');
    if (pgInParam || nodePropInParam || edgePropInParam || configInParam || viewModeInParam) {
      byProgram = true;
      if (pgInParam) {
        editor.setValue(pgInParam);
        if (graphNameInParam) {
          currentGraphName = graphNameInParam;
        } else {
          currentGraphName = newGraphName()
        }
        localStorage.setItem('currentGraphName', currentGraphName);
      }
      if (configInParam)
        configEditor.setValue(configInParam);
      if (viewModeInParam)
        localStorage.setItem('viewMode', viewModeInParam);
      saveCurrentGraph();
      window.location.href = window.location.href.split('?')[0]; // Jump to URL without query parameter
    }
  }


  setTimeout(() => {
    try {
      nodeLayout = JSON.parse(localStorage.getItem('nodeLayout'));
    } catch {
      nodeLayout = null;
    }

    blitzboard.showLoader();

    function onConfigChanged(delta) {
      if(!byProgram) {
        if (!configTimerId)
          blitzboard.showLoader();
        clearTimeout(configTimerId);
        setUnsavedStatus(true);
        configTimerId = setTimeout(reloadConfig, 2000);
      }
    }

    configEditor.on('keydown', (cm, e) => {
      if (e.ctrlKey && e.keyCode === 13) {
        // ctrl + enter
        reloadConfig();
      }
      // invoke only if timer is working
      else if (configTimerId) onConfigChanged();
    });

    configEditor.on('change', onConfigChanged);
    configEditor.on('inputRead', onConfigChanged);

    let autocompletionConfig = localStorage.getItem('autocompletion');
    if (autocompletionConfig !== null) {
      autocompletion = autocompletionConfig === 'true';
      $('#options-auto-complete-input').prop('checked', autocompletion);
    }


    $('#options-auto-complete').click((e) => {
      autocompletion = !$('#options-auto-complete-input').prop('checked');
      $('#options-auto-complete-input').prop('checked', autocompletion);
      e.preventDefault();
      localStorage.setItem('autocompletion', autocompletion);
    });

    let optionsShowConfig = localStorage.getItem('optionsShowConfig');
    if (optionsShowConfig !== null) {
      showConfig = optionsShowConfig === 'true';
      $('#options-show-config-input').prop('checked', showConfig);
      showOrHideConfig();
    }

    $('#options-show-config').click((e) => {
      showConfig = !$('#options-show-config-input').prop('checked');
      $('#options-show-config-input').prop('checked', showConfig);
      e.preventDefault();
      localStorage.setItem('optionsShowConfig', showConfig);
      showOrHideConfig();
    });


    $('#all-graphs-checkbox').click((e) => {
      let fromAllGraph = $(e.target).prop('checked');
      const maxDepth = 5;
      if(fromAllGraph) {
        axios.get(`${backendUrl}/query_path?match=ALL (n1)->{1,${maxDepth}}(n2)&where=n2.id='${targetNodeIdOnModal}'`).then(response => {
          let upstreamPg = response.data.pg;
          axios.get(`${backendUrl}/query_path?match=ALL (n2)->{1,${maxDepth}}(n3)&where=n2.id='${targetNodeIdOnModal}'`).then(response => {
            let downstreamPg = response.data.pg;
            let mergedNodes = {};
            let mergedEdges = {};

            for(let node of upstreamPg.nodes.concat(downstreamPg.nodes)) {
              mergedNodes[node.id] = node;
            }

            for(let edge of upstreamPg.edges.concat(downstreamPg.edges)) {
              mergedEdges[edge.from + '-' + edge.to] = edge;
            }
            let mergedPg = {
              nodes: Object.values(mergedNodes),
              edges: Object.values(mergedEdges),
            };
            metaBlitzboard.setGraph(mergedPg);
          });
        }).catch((error) => {
          console.log(error);
          toastr.error(`Failed to query ${backendUrl}...: ${error}`, '', {preventDuplicates: true, timeOut: 3000});
        });
      } else {
        metaBlitzboard.setGraph(JSON.parse(JSON.stringify(graphOnModal)));
      }
    });


    $('#hierarchical-checkbox').click((e) => {
      if($(e.target).prop('checked')) {
        let tmpConfig = parseConfig(configEditor.getValue()); // deepcopy
        tmpConfig.layout = 'hierarchical-scc';
        addHighlightOptionOnModal(tmpConfig);
        metaBlitzboard.setConfig(tmpConfig);
      } else {
        metaBlitzboard.setGraph(JSON.parse(JSON.stringify(graphOnModal)), false);
        metaBlitzboard.setConfig(configOnModal);
      }
    });

    $("#sort-modal").on("hidden.bs.modal", function () {
      editor.focus();
    });

    $('#options-cross-impact').click(computeCrossImpactFactor);
    $('#options-insert-edges').click(insertEdges);
    $('#options-search').click(() => editor.execCommand("findPersistent"));
    $('#options-replace').click(() => editor.execCommand("replace"));
    $('#options-sort').click(showSortModal);


    $('#sort-btn').click((e) => {
      let newPG = '';
      let oldPG = editor.getValue();
      let oldPGlines = oldPG.split("\n");
      let {nodes, edges} = pgToBeSorted;
      let nodeKey = q('#sort-node-lines-select').value;
      let edgeKey = q('#sort-edge-lines-select').value;
      let order = parseInt(document.querySelector('input[name="sort-order"]:checked').value);
      let alignColumn = q(`#sort-aligh-column-checkbox`).checked;

      /// Order should be -1 (descending) or 1 (ascending)
      function generateComparator(mapFunction) {
        return (a, b) => {
          let aVal = mapFunction(a);
          let bVal = mapFunction(b);
          if (aVal === undefined && bVal === undefined || aVal === bVal)
            return 0;
          if (aVal === undefined)
            return 1;
          if (bVal === undefined)
            return -1;
          return order * (bVal > aVal ? -1 : 1);
        }
      }

      if (nodeKey) {
        switch (nodeKey) {
          case ':id':
            nodes.sort(generateComparator((n) => n.id));
            break;
          case ':label':
            nodes.sort(generateComparator((n) => n.labels?.[0]));
            break;
          default:
            nodes.sort(generateComparator((n) => n.properties[nodeKey]?.[0]));
            break;
        }
      }
      if (edgeKey) {
        switch (edgeKey) {
          case ':from-to':
            edges.sort(generateComparator((e) => `${e.from}-${e.to}`));
            break;
          case ':label':
            edges.sort(generateComparator((e) => e.labels?.[0]));
            break;
          default:
            edges.sort(generateComparator((e) => e.properties[edgeKey]?.[0]));
            break;
        }
      }
      // TODO: Preserve comment lines
      // Here, location.{start,end}.offset cannot be used because the value of offset ignores comment lines.
      // We use line and column instead of offset
      for (let node of nodes) {
        let end = node.location.end.line === node.location.start.line ? node.location.end.line : node.location.end.line - 1;
        newPG += oldPGlines.slice(node.location.start.line - 1, end).map((l) => l + "\n");
      }
      for (let edge of edges) {
        let end = edge.location.end.line === edge.location.start.line ? edge.location.end.line : edge.location.end.line - 1;
        newPG += oldPGlines.slice(edge.location.start.line - 1, end).map((l) => l + "\n");
      }
      if(alignColumn) {
        newPG = json2pg.translate(JSON.stringify(pgParser.parse(newPG)), true);
      }
      byProgram = true;
      editor.setValue(newPG);
      byProgram = false;
      toastr.success(`Sorted!`, '', {preventDuplicates: true, timeOut: 3000});

      localStorage.setItem('sortOrder', order.toString());
      localStorage.setItem('alignColumn', alignColumn);
      localStorage.setItem('nodeSortKey', nodeKey);
      localStorage.setItem('edgeSortKey', edgeKey);

      sortModal.hide();
      blitzboard.update(false);
    });

    switch (viewMode) {
      case 'view-only':
        $('#edit-panel-btn').prop('checked', false);
        $('#input-area').resizable('disable');
        $('#input-area').css('width', '0px');
        $('#graph-pane').css('width', '100%');
        onResize(null, null);
        break;
      default:
        $('#edit-panel-btn').prop('checked', true);
        break;
    }
    let tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    let tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
      return new bootstrap.Tooltip(tooltipTriggerEl, {placement: 'bottom', customClass: 'tooltip-sandbox'});
    })

    $('.dropdown-item').on('mouseenter', (e) => {
      tooltipList.forEach((t) => t.hide());
    });

    $('.dropdown').on('click', (e) => {
      tooltipList.forEach((t) => t.hide());
    });

    if (!remoteMode && !localStorage.getItem('saved-graph-' + currentGraphName)) {
      saveCurrentGraph();
    }
    
    let sampleLoaded = false; 
    if(remoteMode && !sampleNameInParam && localStorage.getItem('sample')) {
      sampleLoaded = true;
      let sampleName = localStorage.getItem('sample');
      loadSample(sampleName, (graph, config) => {
        byProgram = true;
        editor.setValue(graph);
        byProgram = false;
        configEditor.setValue(config);
        showGraphName();
      });
      currentGraphName = newGraphName(sampleName);
      localStorage.removeItem('sample');
      setUnsavedStatus(true);
    }

    updateGraphList(() => {
      if(!sampleLoaded) {
        if (remoteMode) {
          byProgram = true;
          configEditor.setValue(defaultConfig);
          byProgram = false;
        }
        if (!savedGraphNames.includes(currentGraphName)) {
          if (savedGraphNames.length > 0)
            loadGraphByName(savedGraphNames[0]);
          else
            createNewGraph(0);
        } else {
          loadCurrentGraph();
          if(configEditor.getValue() === '' && noGraphLoaded) {
            byProgram = true;
            editor.setValue(pageTemplates[0].pg);
            byProgram = false;
            configEditor.setValue(defaultConfig);
          }
        }
        showGraphName();
      }


      function initializeByFilterConditions(filterConditions, type) {
        if(filterConditions.length > 0) {
          for(let condition of filterConditions) {
            let rowsDiv = q(`#${type}-filter-rows`);
            addFilterRow(rowsDiv, type);
            let filterRow = rowsDiv.querySelector(`.${type}-filter-row:last-of-type`);
            filterRow.querySelector(`.${type}-filter-prop`).innerHTML = `<option selected>${condition.prop}</option>`;
            filterRow.querySelector(`.${type}-filter-min`).value = condition.min;
            filterRow.querySelector(`.${type}-filter-max`).value = condition.max;
          }
          updateConfigByUI();
          triggerGraphUpdate(editor.getValue(), config);
        } else {
          // Insert one row by default
          addFilterRow(q(`#${type}-filter-rows`), type);
        }
      }

      nodeFilterConditions = localStorage.getItem('nodeFilterConditions');
      nodeFilterConditions = nodeFilterConditions ? JSON.parse(nodeFilterConditions) : [];
      initializeByFilterConditions(nodeFilterConditions, 'node');

      edgeFilterConditions = localStorage.getItem('edgeFilterConditions');
      edgeFilterConditions = edgeFilterConditions ? JSON.parse(edgeFilterConditions) : [];
      initializeByFilterConditions(edgeFilterConditions, 'edge');
    });




    if(clientIsMac) {
      q('#search-shortcut-text').innerText = 'Cmd-F';
      q('#replace-shortcut-text').innerText = 'Option-Cmd-F';
      q('#sort-shortcut-text').innerText = 'Cmd-S';
    }
    
    let oldOrder = localStorage.getItem('sortOrder');
    if (oldOrder) {
      q(`input[name="sort-order"][value="${oldOrder}"]`).checked = true;
    }

    let oldAlignColumn = localStorage.getItem('alignColumn') === 'true';
    if (oldAlignColumn) {
      q(`#sort-aligh-column-checkbox`).checked = true;
    }

  }, 0);
});
