/*
Copyright (c) 2021 by Mert Cukuren (https://codepen.io/knyttneve/pen/YzxEBew)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

class ContextMenu {
  constructor({ target = null, menuItems = [], mode = "dark" }) {
    this.targetNode = target;
    this.menuItems = menuItems;
    this.mode = mode;
    this.isOpened = false;
    this.menuContainer = document.createElement("UL");
    this.menuContainer.classList.add("contextMenu");
    this.menuContainer.setAttribute("data-theme", this.mode);
    this.setMenuItems(menuItems);
  }

  setMenuItems(menuItems) {
    function removeAllChildNodes(parent) {
      while (parent.firstChild) {
        parent.removeChild(parent.firstChild);
      }
    }
    removeAllChildNodes(this.menuContainer);
    this.menuItemsNode = [];

    if (!menuItems) {
      console.error("getMenuItemsNode :: Please enter menu items");
    }

    menuItems.forEach((data, index) => {
      const item = this.createItemMarkup(data);
      item.firstChild.setAttribute(
        "style",
        `animation-delay: ${index * 0.08}s`
      );
      this.menuItemsNode.push(item);
    });
    this.menuItemsNode.forEach((item) => this.menuContainer.appendChild(item));
  }

  createItemMarkup(data) {
    const button = document.createElement("BUTTON");
    const item = document.createElement("LI");

    button.innerHTML = data.label;
    button.classList.add("contextMenu-button");
    item.classList.add("contextMenu-item");

    if (data.divider) item.setAttribute("data-divider", data.divider);
    item.appendChild(button);

    if (data.events && data.events.length !== 0) {
      Object.entries(data.events).forEach((event) => {
        const [key, value] = event;
        button.addEventListener(key, value);
      });
    }

    return item;
  }


  closeMenu(menu) {
    if (this.isOpened) {
      this.isOpened = false;
      menu.remove();
    }
  }

  init() {
    document.addEventListener("click", () => this.closeMenu(this.menuContainer));
    window.addEventListener("blur", () => this.closeMenu(this.menuContainer));
    document.addEventListener("contextmenu", (e) => {
      if (!e.target.contains(this.targetNode)) {
        this.closeMenu(this.menuContainer);
      }
    });

    this.targetNode.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });
  }

  openMenu(e) {
    let contextMenu = this.menuContainer;
    this.isOpened = true;

    const { clientX, clientY } = e;
    document.body.appendChild(contextMenu);

    const positionY =
      clientY + contextMenu.scrollHeight >= window.innerHeight
        ? window.innerHeight - contextMenu.scrollHeight - 20
        : clientY;
    const positionX =
      clientX + contextMenu.scrollWidth >= window.innerWidth
        ? window.innerWidth - contextMenu.scrollWidth - 20
        : clientX;

    contextMenu.setAttribute(
      "style",
      `--width: ${contextMenu.scrollWidth}px;
          --height: ${contextMenu.scrollHeight}px;
          --top: ${positionY}px;
          --left: ${positionX}px;`
    );
  }
}

module.exports = ContextMenu;