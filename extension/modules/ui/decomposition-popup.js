window.zhDecompositionPopup = (function () {
  let panelEl = null;
  let isClickListenerBound = false;
  let svgResizeObserver = null;

  function createPanel() {
    if (panelEl) return panelEl;
    panelEl = document.createElement("div");
    panelEl.className = "zh-decomposition-panel";
    document.body.appendChild(panelEl);

    if (!isClickListenerBound) {
      // Close on clicking outside
      document.addEventListener("click", (e) => {
        if (!panelEl) return;
        const isInsidePanel = e.composedPath().includes(panelEl);
        const isChar = e.target.closest('.zh-char');
        if (!isInsidePanel && !isChar) {
          hidePanel();
        }
      }, true);
      isClickListenerBound = true;
    }

    return panelEl;
  }

  function hidePanel() {
    if (!panelEl) return;
    panelEl.classList.remove('show');
    if (svgResizeObserver) {
      svgResizeObserver.disconnect();
    }
    // Wait for transition to finish
    setTimeout(() => {
      if (panelEl && panelEl.parentNode) {
        panelEl.parentNode.removeChild(panelEl);
      }
      panelEl = null;
    }, 300);
  }

  function flattenNode(node) {
    if (!node) return null;
    if (node.isSpecial) {
      if (node.operatorNode && node.operatorNode.children) {
        return node.operatorNode.children.flatMap(c => flattenNode(c)).filter(Boolean);
      }
      return [];
    }
    return [node];
  }

  function getRenderableChildren(node) {
    if (!node.operatorNode || !node.operatorNode.children) return [];
    return node.operatorNode.children.flatMap(c => flattenNode(c)).filter(Boolean);
  }

  let treeNodesHtml = "";
  let maxDepth = 0;

  function computeLayoutSymmetric(node, depth, NODE_WIDTH, X_GAP, currentPath = []) {
    const children = getRenderableChildren(node);
    if (depth > maxDepth) maxDepth = depth;
    
    const path = [...currentPath, node.char];
    node.layout = { depth: depth, children: children, path: path };
    
    if (children.length === 0) {
      node.layout.left = -NODE_WIDTH / 2;
      node.layout.right = NODE_WIDTH / 2;
      node.layout.relX = 0;
      return;
    }
    
    children.forEach(c => computeLayoutSymmetric(c, depth + 1, NODE_WIDTH, X_GAP, path));
    
    if (children.length === 1) {
      node.layout.left = children[0].layout.left;
      node.layout.right = children[0].layout.right;
      node.layout.relX = 0;
      children[0].layout.relX = 0;
      return;
    }
    
    let D = 0;
    for (let i = 0; i < children.length - 1; i++) {
      const neededD = children[i].layout.right - children[i+1].layout.left + X_GAP;
      if (neededD > D) D = neededD;
    }
    
    children.forEach((c, i) => {
      c.layout.relX = i * D;
    });
    
    const parentRelX = (children[0].layout.relX + children[children.length - 1].layout.relX) / 2;
    
    let minLeft = parentRelX - NODE_WIDTH / 2;
    let maxRight = parentRelX + NODE_WIDTH / 2;
    
    children.forEach(c => {
      const cLeft = c.layout.relX + c.layout.left;
      const cRight = c.layout.relX + c.layout.right;
      if (cLeft < minLeft) minLeft = cLeft;
      if (cRight > maxRight) maxRight = cRight;
    });
    
    node.layout.left = minLeft - parentRelX;
    node.layout.right = maxRight - parentRelX;
    
    children.forEach(c => {
      c.layout.relX -= parentRelX;
    });
    node.layout.relX = 0;
  }

  function assignAbsoluteX(node, absoluteX) {
    node.layout.x = absoluteX;
    node.layout.children.forEach(c => {
      assignAbsoluteX(c, absoluteX + c.layout.relX);
    });
  }

  function buildTreeHtml(node, LEVEL_HEIGHT) {
    const x = node.layout.x;
    const y = 20 + node.layout.depth * LEVEL_HEIGHT;
    
    const isRoot = node.layout.depth === 0;
    const isInteractive = !isRoot;
    const interactiveClass = isInteractive ? 'zh-interactive-node' : '';
    const radicalClass = node.type === 'radical' ? 'zh-radical-node' : '';
    let labelHtml = node.label ? `<div class="node-label">${node.label}</div>` : '';
    let meaningHtml = node.meaning ? `<div class="node-meaning">${node.meaning}</div>` : '';
    
    const nodeId = 'node-' + node.layout.path.join('-');
    const parentAttr = node.layout.parentId ? `data-parent-id="${node.layout.parentId}"` : '';

    treeNodesHtml += `
      <div id="${nodeId}" class="tree-node ${interactiveClass} ${radicalClass}" data-char="${node.char}" data-path="${node.layout.path.join(',')}" ${parentAttr} style="position: absolute; left: ${x}px; top: ${y}px; transform: translateX(-50%);">
        <div class="node-char">${node.char}</div>
        <div class="node-pinyin">${node.pinyin}</div>
        ${meaningHtml}
        ${labelHtml}
      </div>
    `;
    
    node.layout.children.forEach(child => {
      child.layout.parentId = nodeId;
      buildTreeHtml(child, LEVEL_HEIGHT);
    });
  }

  function drawTreeLines() {
    if (!panelEl || panelEl.style.display === "none") return;
    const svg = panelEl.querySelector("#tree-svg");
    const container = panelEl.querySelector(".tree-content");
    if (!svg || !container) return;

    svg.innerHTML = "";
    const containerRect = container.getBoundingClientRect();
    let pathsHtml = "";

    const nodes = container.querySelectorAll(".tree-node");
    nodes.forEach(childNode => {
      const parentId = childNode.dataset.parentId;
      if (!parentId) return;
      const parentNode = document.getElementById(parentId);
      if (!parentNode) return;

      const pRect = parentNode.getBoundingClientRect();
      const cRect = childNode.getBoundingClientRect();

      const pX = pRect.left - containerRect.left + pRect.width / 2;
      const pY = pRect.bottom - containerRect.top;
      const cX = cRect.left - containerRect.left + cRect.width / 2;
      const cY = cRect.top - containerRect.top;

      const curveOffset = Math.max(20, Math.abs(cY - pY) / 2);
      pathsHtml += `<path d="M ${pX} ${pY} C ${pX} ${pY + curveOffset}, ${cX} ${cY - curveOffset}, ${cX} ${cY}" />`;
    });

    svg.innerHTML = pathsHtml;
  }

  let historyStack = [];

  async function showPanel(char, referenceElement) {
    createPanel();
    
    const themeClass = Array.from(referenceElement.classList).find(c => c.startsWith("zh-theme-"));
    const sizeClass = Array.from(referenceElement.classList).find(c => c.startsWith("zh-size-"));
    const decompSizeClass = sizeClass ? sizeClass.replace('zh-size-', 'zh-decomp-size-') : 'zh-decomp-size-medium';
    panelEl.className = `zh-decomposition-panel ${themeClass || ''} ${decompSizeClass}`;

    panelEl.style.display = "flex";
    
    setTimeout(() => {
      panelEl.classList.add('show');
    }, 10);

    historyStack = [char];
    await renderPanelContent();
  }

  async function renderPanelContent() {
    const currentChar = historyStack[historyStack.length - 1];

    let breadcrumbHtml = historyStack.map((c, index) => {
      if (index === historyStack.length - 1) {
        return `<span class="zh-breadcrumb-item active">${c}</span>`;
      }
      return `<span class="zh-breadcrumb-item" data-index="${index}">${c}</span><span class="zh-breadcrumb-separator">›</span>`;
    }).join('');

    const treeData = await window.zhDecomposition.buildTree(currentChar);
    
    let meaningTextHtml = treeData.meaning ? `<span class="zh-header-meaning"> - ${treeData.meaning}</span>` : "";

    panelEl.innerHTML = `
      <div class="zh-decomp-header">
        <span class="zh-title">Chiết tự: <div style="display:flex; align-items:center; gap:4px; margin-left:4px;">${breadcrumbHtml}</div>${meaningTextHtml}</span>
        <button class="zh-decomp-close">✕</button>
      </div>
      <div class="zh-decomp-body zh-custom-scrollbar zh-loading-state">
        <div class="zh-spinner">Đang phân tích...</div>
      </div>
    `;

    panelEl.querySelector(".zh-decomp-close").addEventListener("click", hidePanel);
    panelEl.querySelectorAll(".zh-breadcrumb-item[data-index]").forEach(item => {
      item.addEventListener("click", (e) => {
        const idx = parseInt(e.target.dataset.index);
        historyStack = historyStack.slice(0, idx + 1);
        renderPanelContent();
      });
    });

    let etymologyHtml = "";
    if (treeData.etymology) {
      etymologyHtml += `
        <div class="zh-etymology">
          <div class="etymology-title">
            <svg class="zh-tips-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M418-211q-53 0-89.5-36.5T292-337v-12q-60-45-93-110t-33-140q0-131 91.35-223 91.36-92 222.5-92Q611-914 702.5-822.6 794-731.21 794-600q0 74.81-33 140.41Q728-394 668-349v12q0 53-36.5 89.5T542-211H418Zm-1-125h126v-45q0-16 7-29.5t20-22.5l18-12q38-26 59.5-67.12 21.5-41.11 21.5-87.43 0-78.45-55.5-133.95Q558-789 480-789t-133.5 55.28Q291-678.43 291-600q0 47 22 87.5t60 67.5l17 12q13 9 20 22.82t7 29.18v45ZM396-46q-26.35 0-44.17-18.5Q334-83 334-109.25q0-26.24 17.83-44Q369.65-171 396-171h168q26.35 0 44.17 18.5Q626-134 626-107.75q0 26.24-17.83 44Q590.35-46 564-46H396Zm84-554Z"/></svg> Mẹo ghi nhớ
          </div>
          <div class="etymology-content">${treeData.etymology}</div>
        </div>
      `;
    }

    treeNodesHtml = "";
    maxDepth = 0;
    
    const isLarge = panelEl.classList.contains("zh-decomp-size-large");
    const isSmall = panelEl.classList.contains("zh-decomp-size-small");
    const NODE_WIDTH = isLarge ? 100 : (isSmall ? 80 : 90);
    const X_GAP = isLarge ? 30 : 20;
    const LEVEL_HEIGHT = isLarge ? 170 : (isSmall ? 130 : 150);
    
    computeLayoutSymmetric(treeData, 0, NODE_WIDTH, X_GAP, []);
    
    const treeW = treeData.layout.right - treeData.layout.left;
    const totalH = (maxDepth + 1) * LEVEL_HEIGHT;
    
    const panelWidth = panelEl.clientWidth > 0 ? panelEl.clientWidth - 32 : 400;
    const containerW = Math.max(treeW + 40, panelWidth); // 20px padding
    
    const rootX = (containerW / 2) - ((treeData.layout.right + treeData.layout.left) / 2);
    assignAbsoluteX(treeData, rootX);
    
    buildTreeHtml(treeData, LEVEL_HEIGHT);

    const treeHtml = `
      <div class="zh-tree-container">
        <div class="tree-content" style="position: relative; width: ${containerW}px; height: ${totalH}px; margin: 0 auto;">
          <svg id="tree-svg" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none; overflow: visible;"></svg>
          ${treeNodesHtml}
        </div>
      </div>
    `;

    const bodyEl = panelEl.querySelector(".zh-decomp-body");
    bodyEl.classList.remove("zh-loading-state");
    bodyEl.innerHTML = treeHtml + etymologyHtml;

    bodyEl.querySelectorAll(".tree-node.zh-interactive-node").forEach(nodeEl => {
      nodeEl.addEventListener("click", () => {
        const charToDecomp = nodeEl.dataset.char;
        const charPath = nodeEl.dataset.path;
        if (charToDecomp && charToDecomp !== currentChar) {
          if (charPath) {
             const pathArr = charPath.split(',');
             historyStack = historyStack.slice(0, historyStack.length - 1).concat(pathArr);
          } else {
             historyStack.push(charToDecomp);
          }
          renderPanelContent();
        }
      });
    });

    requestAnimationFrame(() => {
      drawTreeLines();
      setTimeout(drawTreeLines, 100);
    });
  }

  // Handle window resize to redraw lines
  window.addEventListener('resize', () => {
    if (panelEl && panelEl.style.display !== "none") {
      drawTreeLines();
    }
  });

  return {
    showPanel,
    hidePanel,
    getPanel: () => panelEl
  };
})();
