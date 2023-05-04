const $ = require("jquery");
const ContextMenu = require("./ContextMenu");

function initializeUI() {

  let blitzboard = this;

  this.screen = document.createElement('div');
  this.screenText = document.createElement('div');
  this.screenText.classList.add('blitzboard-loader');
  this.screen.appendChild(this.screenText);
  this.screenText.innerText = "Now loading...";
  this.screen.style = `
      background-color: rgba(0, 0, 0, 0.3);
      z-index: 3;
      position: absolute;
      height: 100%;
      width: 100%;
      display: none;
      justify-content: center;
      align-items: center;
      font-size: 2rem;
    `;

  this.configChoiceDiv = document.createElement('div');
  this.configChoiceDiv.id = "blitzboard-config-choice-div";
  this.configChoiceDiv.style =
    `
      max-width: 400px;
      top: 20px;
      right: 80px;
      position: absolute;
      z-index: 2000;
      display: none;
    `;

  this.configChoiceLabel = document.createElement('label');
  this.configChoiceLabel.id = "blitzboard-config-choice-label";
  this.configChoiceLabel.style =
    `
      max-width: 200px;
      display: inline;
    `;

  this.configChoiceDropdown = document.createElement('select');
  this.configChoiceDropdown.id = "blitzboard-config-choice-dropdown";
  this.configChoiceDropdown.style =
    `
      max-width: 200px;
      display: inline;
    `;


  this.searchBarDiv = document.createElement('div');
  this.searchBarDiv.id = "blitzboard-search-bar-div";
  this.searchBarDiv.style =
    `
      width: 280px;
      top: 60px;
      right: 80px;
      height: 30px;
      position: absolute;
      z-index: 2000;
    `;

  this.searchInput = document.createElement('input');
  this.searchInput.type = "text";
  this.searchInput.id = "blitzboard-search-input";
  this.searchInput.type = 'search';
  this.searchButton = document.createElement('label');
  this.searchButton.id = "blitzboard-search-button";
  this.searchButton.setAttribute('for', 'blitzboard-search-input');

  this.container.appendChild(this.screen);
  this.container.appendChild(this.searchBarDiv);
  this.container.appendChild(this.configChoiceDiv);
  this.configChoiceDiv.appendChild(this.configChoiceLabel);
  this.configChoiceDiv.appendChild(this.configChoiceDropdown);
  this.searchBarDiv.appendChild(this.searchButton);
  this.searchBarDiv.appendChild(this.searchInput);

  this.configChoiceDropdown.addEventListener('change', (e) => {
    this.configChoice = e.target.value;
    this.showLoader();
    setTimeout(() => {
      this.update(false);
      this.hideLoader();
    }, 100); // Add short delay to show loader
  });

  this.searchButton.addEventListener('click', (e) => {
    if(blitzboard.searchInput.clientWidth > 0) {
      blitzboard.config.onSearchInput(blitzboard.searchInput.value);
    } else {
      blitzboard.searchInput.style.width = '250px';
      blitzboard.searchInput.style["padding-right"] = '30px';
      blitzboard.searchButton.style.right = '250px';
    }
  })


  this.searchInput.addEventListener('transitionend', (e) => {
    if(this.searchInput.clientWidth > 0 && $(this.searchInput).autocomplete("instance")) {
      $(this.searchInput).autocomplete("search", this.searchInput.value);
    }
  });

  this.searchInput.addEventListener('keydown', (e) => {
    // Enter
    if(e.code === "Enter" && blitzboard.config.onSearchInput)
      blitzboard.config.onSearchInput(blitzboard.searchInput.value);
  });

  this.searchInput.addEventListener('blur', (e) => {
    if(e.target.value === '') {
      blitzboard.searchInput.style.width = '0px';
      blitzboard.searchInput.style["padding-right"] = '0px';
      blitzboard.searchButton.style.right = '0px';
    }
  });

  this.container.addEventListener('mouseout', (e) => {
    blitzboard.dragging = false;
  }, true);

  this.container.addEventListener('mouseup', (e) => {
    blitzboard.dragging = false;
  }, true);


  this.container.addEventListener('mousedown', (e) => {
    blitzboard.dragging = true;
  }, true);


  this.contextMenu = new ContextMenu({
    target: this.network.canvas,
    mode: 'dark'
  });

  this.container.addEventListener('keydown', (e) => {
    if(e.code === "Digit0") {
      blitzboard.fit();
      e.preventDefault();
    }
    else if((e.ctrlKey && !this.clientIsMacLike || e.metaKey && this.clientIsMacLike) && e.code === "KeyF") {
      e.preventDefault();
      this.searchButton.click();
      this.searchInput.focus()
      this.searchInput.setSelectionRange(0, this.searchInput.value.length)
    }
  });

  this.contextMenu.init();
}



module.exports = {
  initializeUI,

  updateSearchInput() {
    if($(this.searchInput).autocomplete("instance")){
      $(this.searchInput).autocomplete("destroy");
    }
    if(this.config.searchCandidates) {
      if(!Array.isArray(this.config.searchCandidates) && typeof this.config.searchCandidates === 'object') {
        let candidateSource = new Set();
        if(this.config.searchCandidates.node) {
          [this.config.searchCandidates.node].flat(2).forEach(prop => {
            this.graph.nodes.map(e => e[prop] || e.properties[prop]).flat().filter(p => p).forEach(p => candidateSource.add(p));
          });
        }
        if(this.config.searchCandidates.edge) {
          [this.config.searchCandidates.edge].flat(2).forEach(prop => {
            this.graph.edges.map(e => e[prop] || e.properties[prop]).flat().filter(p => p).forEach(p => candidateSource.add(p));
          });
        }
        candidateSource = Array.from(candidateSource);
        const autocompleteMax = 20;
        $(this.searchInput).autocomplete({
          select: (event, ui) => {
            blitzboard.config.onSearchInput(ui.item.value);
          },
          source: (request, response) => {
            let filtered;
            if(request.term)
              filtered = candidateSource.filter(c => c.toLowerCase().startsWith(request.term.toLowerCase()));
            else
              filtered = candidateSource;
            filtered = filtered.slice(0, autocompleteMax);
            response(filtered);
          },
          minLength: 0
        });
      } else {
        $(this.searchInput).autocomplete({
          select: (event, ui) => {
            blitzboard.config.onSearchInput(ui.item.value);
          },
          source: this.config.searchCandidates,
          minLength: 0
        });
      }
    }
  },

  onNodeHover(hoverInfo) {
    this.hoveredNodes = new Set();
    if(hoverInfo.object) {
      this.hoveredNodes.add(hoverInfo.object.id);
    }

    this.updateHighlightState();
    if (this.config.node.onHover) {
      this.config.node.onHover(this.getNode(hoverInfo.object.id));
    }
  },

  onEdgeHover(hoverInfo) {
    this.hoveredEdges = new Set();
    if(hoverInfo.object) {
      this.hoveredEdges.add(hoverInfo.object.id);
    }
    if(this.config.edge.canFocus) {
      this.updateHighlightState();
    }
    if (this.config.edge.onHover) {
      this.config.edge.onHover(this.getEdge(hoverInfo.object.id));
    }
  },

  onLayerClick(info, event) {
    if(event.rightButton) {
      let menuItems = [];
      if(this.config.contextMenuItems)
        menuItems = menuItems.concat(this.config.contextMenuItems.map(c => ({
          label: (typeof c.label) === 'function' ? c.label(object) : c.label,
          events: {click: () => c.onClick(this)}
        })));
      if(info.picked) {
        let object = info.object;
        if(object?.objectType === 'node' && this.config.node.contextMenuItems) {
          menuItems = menuItems.concat(this.config.node.contextMenuItems.map(c => ({
            label: (typeof c.label) === 'function' ? c.label(object) : c.label,
            events: {click: () => c.onClick(object, this)},
          })));
        } else if(object?.objectType === 'edge' && this.config.edge.contextMenuItems) {
          menuItems = menuItems.concat(this.config.edge.contextMenuItems.map(c => ({
            label: (typeof c.label) === 'function' ? c.label(object) : c.label,
            events: {click: () => c.onClick(object, this)}
          })));
        }
      }
      if(menuItems.length > 0) {
        this.contextMenu.setMenuItems(menuItems);
        this.contextMenu.openMenu(event.srcEvent);
      }
    } else {
      if(!this.doubleClickTimer) {
        if(this.config.doubleClickWait <= 0) {
          clickHandler(this, info, event);
        } else {
          this.doubleClickTimer = setTimeout(() => clickHandler(this, info, event), this.config.doubleClickWait);
        }
      } else {
        clearTimeout(this.doubleClickTimer);
        this.doubleClickTimer = null;
        if(info.picked) {
          let object = info.object;
          if(object.objectType === 'node' && this.config.node.onDoubleClick) {
            this.config.node.onDoubleClick(this.getNode(object.id));
          } else if(object.objectType === 'edge' && this.config.edge.onDoubleClick) {
            this.config.edge.onDoubleClick(this.getEdge(object.id));
          }
        } else {
          if(event.target === this.network.canvas)
            this.fit();
        }
      }
    }

    // if(e.nodes.length > 0 && !this.network.isCluster(e.nodes[0])){
    //   let node = e.nodes[0]
    //   this.upstreamNodes = this.getUpstreamNodes(node);
    //   this.downstreamNodes = this.getDownstreamNodes(node);
    //   this.network.setSelection({nodes: [], edges: []}); // reset
    //   this.highlightedNodes = Array.from(this.upstreamNodes).concat(Array.from(this.downstreamNodes));
    //   this.network.selectNodes( this.highlightedNodes, true);
    // }
  },
}

function clickHandler(blitzboard, info, event) {
  clearTimeout(blitzboard.doubleClickTimer);
  blitzboard.doubleClickTimer = null;
  let needUpdate = blitzboard.selectedNodes.size > 0 || blitzboard.selectedEdges.size > 0;

  blitzboard.selectedNodes.clear();
  blitzboard.selectedEdges.clear();

  if(event.rightButton) {
    blitzboard.contextMenu.openMenu(event.srcEvent);
  }
  if(info.picked) {
    let object = info.object;
    if(object?.objectType === 'node') {
      if(blitzboard.config.node.onClick)
        blitzboard.config.node.onClick(blitzboard.getNode(object.id));
      blitzboard.selectedNodes.add(object.id);
      needUpdate = true;
    } else if(object?.objectType === 'edge' && blitzboard.config.edge.onClick) {
      blitzboard.config.edge.onClick(blitzboard.getEdge(object.id));
      blitzboard.selectedEdges.add(object.id);
      needUpdate = true;
    }
  }

  if(needUpdate) {
    blitzboard.updateHighlightState();
  }
}
