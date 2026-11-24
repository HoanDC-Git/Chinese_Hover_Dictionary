window.VZ = window.VZ || {};
window.VZ.ui = window.VZ.ui || {};

window.VZ.ui.decompPopup = (function () {
  const getCfg = () => window.VZ.config.get();

  // Removed internal IIFE
  let panelEl = null;
  let isClickListenerBound = false;
  let svgResizeObserver = null;
  let lastLayoutWidth = 0;
  let resizeTimer = null;

  function createPanel() {
    if (panelEl) return panelEl;
    panelEl = document.createElement("div");
    panelEl.className = "zh-decomposition-panel";
    document.body.appendChild(panelEl);

    if (!isClickListenerBound) {
      // Close on clicking outside
      document.addEventListener(
        "click",
        (e) => {
          if (!panelEl) return;
          const isInsidePanel = e.composedPath().includes(panelEl);
          const isChar = e.target.closest(".zh-char");
          if (!isInsidePanel && !isChar) {
            hidePanel();
          }
        },
        true,
      );
      isClickListenerBound = true;
    }

    return panelEl;
  }

  function hidePanel() {
    if (!panelEl) return;
    panelEl.classList.remove("show");
    if (svgResizeObserver) {
      svgResizeObserver.disconnect();
    }
    if (
      window.decompHanziWriter &&
      typeof window.decompHanziWriter.cancelAnimation === "function"
    ) {
      window.decompHanziWriter.cancelAnimation();
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
        return node.operatorNode.children
          .flatMap((c) => flattenNode(c))
          .filter(Boolean);
      }
      return [];
    }
    return [node];
  }

  function getRenderableChildren(node) {
    if (!node.operatorNode || !node.operatorNode.children) return [];
    return node.operatorNode.children
      .flatMap((c) => flattenNode(c))
      .filter(Boolean);
  }

  let treeNodesHtml = "";
  let maxDepth = 0;
  let nodeIdCounter = 0;

  // Components that look broken in the calligraphic face, plus every
  // supplementary-plane character (Ext-B and above). They use a clean sans
  // stack that ends with the bundled rare-glyph fonts.
  const BROKEN_CHARS = new Set(["仓", "𠂉", "𢦏", "乀", "𡗗", "龹", "刅"]);

  function isBrokenChar(char) {
    if (!char) return false;
    return BROKEN_CHARS.has(char) || char.codePointAt(0) > 0xffff;
  }

  function readPxToken(styles, name, fallback) {
    const value = parseFloat(styles.getPropertyValue(name));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  // Read the layout values from CSS so responsive breakpoints and the
  // small/medium/large setting stay in sync with the rendered node boxes.
  function getDecompMetrics() {
    const styles = getComputedStyle(panelEl);
    return {
      nodeWidth: readPxToken(styles, "--zh-decomp-node-w", 90),
      nodeHeight: readPxToken(styles, "--zh-decomp-node-h", 115),
      xGap: readPxToken(styles, "--zh-decomp-x-gap", 24),
      levelHeight: readPxToken(styles, "--zh-decomp-level-h", 150),
    };
  }

  function computeLayoutSymmetric(
    node,
    depth,
    NODE_WIDTH,
    X_GAP,
    currentPath = [],
  ) {
    const children = getRenderableChildren(node);
    if (depth > maxDepth) maxDepth = depth;

    const path = [...currentPath, node.char];
    node.layout = {
      id: nodeIdCounter++,
      depth: depth,
      children: children,
      path: path,
    };

    if (children.length === 0) {
      node.layout.left = -NODE_WIDTH / 2;
      node.layout.right = NODE_WIDTH / 2;
      node.layout.relX = 0;
      return;
    }

    children.forEach((c) =>
      computeLayoutSymmetric(c, depth + 1, NODE_WIDTH, X_GAP, path),
    );

    if (children.length === 1) {
      node.layout.left = children[0].layout.left;
      node.layout.right = children[0].layout.right;
      node.layout.relX = 0;
      children[0].layout.relX = 0;
      return;
    }

    let D = 0;
    for (let i = 0; i < children.length - 1; i++) {
      const neededD =
        children[i].layout.right - children[i + 1].layout.left + X_GAP;
      if (neededD > D) D = neededD;
    }

    children.forEach((c, i) => {
      c.layout.relX = i * D;
    });

    const parentRelX =
      (children[0].layout.relX + children[children.length - 1].layout.relX) / 2;

    let minLeft = parentRelX - NODE_WIDTH / 2;
    let maxRight = parentRelX + NODE_WIDTH / 2;

    children.forEach((c) => {
      const cLeft = c.layout.relX + c.layout.left;
      const cRight = c.layout.relX + c.layout.right;
      if (cLeft < minLeft) minLeft = cLeft;
      if (cRight > maxRight) maxRight = cRight;
    });

    node.layout.left = minLeft - parentRelX;
    node.layout.right = maxRight - parentRelX;

    children.forEach((c) => {
      c.layout.relX -= parentRelX;
    });
    node.layout.relX = 0;
  }

  function assignAbsoluteX(node, absoluteX) {
    node.layout.x = absoluteX;
    node.layout.children.forEach((c) => {
      assignAbsoluteX(c, absoluteX + c.layout.relX);
    });
  }

  function buildTreeHtml(node, LEVEL_HEIGHT) {
    const x = node.layout.x;
    const y = 20 + node.layout.depth * LEVEL_HEIGHT;

    const isRoot = node.layout.depth === 0;
    const isInteractive = !isRoot;
    const interactiveClass = isInteractive ? "zh-interactive-node" : "";
    const radicalClass = node.type === "radical" ? "zh-radical-node" : "";
    let labelHtml = node.label
      ? `<div class="node-label">${node.label}</div>`
      : "";
    let meaningHtml = node.meaning
      ? `<div class="node-meaning">${node.meaning}</div>`
      : "";

    const nodeId = "zh-decomp-node-" + node.layout.id;
    const parentAttr = node.layout.parentId
      ? `data-parent-id="${node.layout.parentId}"`
      : "";
    const brokenClass = isBrokenChar(node.char) ? " zh-broken-char" : "";

    treeNodesHtml += `
      <div id="${nodeId}" class="tree-node ${interactiveClass} ${radicalClass}" data-char="${node.char}" data-path="${node.layout.path.join(",")}" ${parentAttr} style="position: absolute; left: ${x}px; top: ${y}px; transform: translateX(-50%);">
        <div class="node-char${brokenClass}">${node.char}</div>
        <div class="node-pinyin">${node.pinyin || ""}</div>
        ${meaningHtml}
        ${labelHtml}
      </div>
    `;

    node.layout.children.forEach((child) => {
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
    nodes.forEach((childNode) => {
      const parentId = childNode.dataset.parentId;
      if (!parentId) return;
      const parentNode = container.querySelector(`[id="${parentId}"]`);
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

    const themeClass = Array.from(referenceElement.classList).find((c) =>
      c.startsWith("zh-theme-"),
    );
    const fontClass = Array.from(referenceElement.classList).find((c) =>
      c.startsWith("zh-font-"),
    );
    const sizeClass = Array.from(referenceElement.classList).find((c) =>
      c.startsWith("zh-size-"),
    );
    const decompSizeClass = sizeClass
      ? sizeClass.replace("zh-size-", "zh-decomp-size-")
      : "zh-decomp-size-medium";
    panelEl.className = `zh-decomposition-panel ${themeClass || ""} ${fontClass || ""} ${decompSizeClass}`;

    panelEl.style.display = "flex";

    setTimeout(() => {
      panelEl.classList.add("show");
    }, 10);

    historyStack = [char];
    await renderPanelContent();
  }

  async function renderPanelContent() {
    const currentChar = historyStack[historyStack.length - 1];

    let breadcrumbHtml = historyStack
      .map((c, index) => {
        const brokenClass = isBrokenChar(c) ? " zh-broken-char" : "";
        if (index === historyStack.length - 1) {
          return `<span class="zh-breadcrumb-item active${brokenClass}">${c}</span>`;
        }
        return `<span class="zh-breadcrumb-item${brokenClass}" data-index="${index}">${c}</span><span class="zh-breadcrumb-separator">›</span>`;
      })
      .join("");

    const treeData = await window.VZ.services.dictionary.buildTree(currentChar);

    let meaningTextHtml = treeData.meaning
      ? `<span class="zh-header-meaning"> - ${treeData.meaning}</span>`
      : "";

    panelEl.innerHTML = `
      <div class="zh-decomp-header">
        <div class="zh-title">Chiết tự: <div class="zh-decomp-breadcrumb">${breadcrumbHtml}</div>${meaningTextHtml}</div>
        <div class="zh-decomp-header-actions">
          <div class="zh-decomp-stroke-switch-wrapper" id="zhDecompStrokeToggle" title="Bật/tắt nét bút">
            <span class="zh-toggle-text">Nét bút</span>
            <div class="zh-switch ${getCfg().showDecompStroke ? "active" : ""}">
              <div class="zh-switch-thumb"></div>
            </div>
          </div>
          <button class="zh-decomp-report-btn" title="Báo lỗi từ này">
            <img class="zh-icon" src="${chrome.runtime.getURL("icons/report.svg")}" width="18" height="18" alt="Báo lỗi">
          </button>
          <button class="zh-decomp-close">✕</button>
        </div>
      </div>
      <div class="zh-decomp-stroke-container ${getCfg().showDecompStroke ? "visible" : ""}" id="zhDecompStrokeContainer">
        <div id="zh-decomp-stroke-target"></div>
      </div>
      <div class="zh-decomp-body zh-custom-scrollbar zh-loading-state">
        <div class="zh-spinner">Đang phân tích...</div>
      </div>
    `;

    panelEl
      .querySelector(".zh-decomp-close")
      .addEventListener("click", hidePanel);
    panelEl
      .querySelector(".zh-decomp-report-btn")
      .addEventListener("click", () => {
        if (window.VZ?.ui?.report) {
          hidePanel();
          window.VZ.ui.report.show(currentChar);
        }
      });
    panelEl
      .querySelector("#zhDecompStrokeToggle")
      .addEventListener("click", () => {
        const current = getCfg().showDecompStroke;
        chrome.storage.local.set({ showDecompStroke: !current });
      });
    panelEl
      .querySelectorAll(".zh-breadcrumb-item[data-index]")
      .forEach((item) => {
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
    nodeIdCounter = 0;

    const { nodeWidth, nodeHeight, xGap, levelHeight } =
      getDecompMetrics();

    computeLayoutSymmetric(treeData, 0, nodeWidth, xGap, []);

    const treeW = treeData.layout.right - treeData.layout.left;
    const totalH = 20 + maxDepth * levelHeight + nodeHeight + 20;

    const measuredWidth = panelEl.getBoundingClientRect().width;
    const panelWidth =
      measuredWidth > 0 ? Math.max(measuredWidth - 32, 240) : 400;
    const containerW = Math.max(treeW + 40, panelWidth); // 20px padding per side

    const rootX =
      containerW / 2 - (treeData.layout.right + treeData.layout.left) / 2;
    assignAbsoluteX(treeData, rootX);

    buildTreeHtml(treeData, levelHeight);

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

    const treeContentEl = bodyEl.querySelector(".tree-content");
    // Wide trees are horizontally scrollable. Start with the root visible
    // instead of showing the far-left (or far-right) edge of the tree.
    const treeScrollerEl = bodyEl.querySelector(".zh-tree-container");
    if (treeScrollerEl && treeContentEl) {
      const rootEl = Array.from(
        treeContentEl.querySelectorAll(".tree-node"),
      ).find((node) => !node.dataset.parentId);
      if (rootEl) {
        const contentRect = treeContentEl.getBoundingClientRect();
        const rootRect = rootEl.getBoundingClientRect();
        const rootCenter =
          rootRect.left - contentRect.left + rootRect.width / 2;
        const maxScroll =
          treeScrollerEl.scrollWidth - treeScrollerEl.clientWidth;
        const targetScroll = rootCenter - treeScrollerEl.clientWidth / 2;
        treeScrollerEl.scrollLeft = Math.max(
          0,
          Math.min(maxScroll, targetScroll),
        );
      }
    }
    if (svgResizeObserver) {
      svgResizeObserver.disconnect();
    }
    if (treeContentEl && typeof ResizeObserver !== "undefined") {
      // Fonts can finish loading after the first paint; redraw the connector
      // lines once the node boxes settle at their final size.
      svgResizeObserver = new ResizeObserver(() => drawTreeLines());
      svgResizeObserver.observe(treeContentEl);
    }
    lastLayoutWidth = panelEl.getBoundingClientRect().width;

    bodyEl
      .querySelectorAll(".tree-node.zh-interactive-node")
      .forEach((nodeEl) => {
        nodeEl.addEventListener("click", () => {
          const charToDecomp = nodeEl.dataset.char;
          const charPath = nodeEl.dataset.path;
          if (charToDecomp && charToDecomp !== currentChar) {
            if (charPath) {
              const pathArr = charPath.split(",");
              historyStack = historyStack
                .slice(0, historyStack.length - 1)
                .concat(pathArr);
            } else {
              historyStack.push(charToDecomp);
            }
            renderPanelContent();
          }
        });
      });

    if (typeof HanziWriter !== "undefined") {
      try {
        if (
          window.decompHanziWriter &&
          typeof window.decompHanziWriter.cancelAnimation === "function"
        ) {
          window.decompHanziWriter.cancelAnimation();
        }
        document.getElementById("zh-decomp-stroke-target").innerHTML = "";
        const strokeColor = getCfg().theme === "dark" ? "#38bdf8" : "#000000";
        const outlineColor = "#DDDDDD";
        window.decompHanziWriter = HanziWriter.create(
          "zh-decomp-stroke-target",
          currentChar,
          {
            width: 120,
            height: 120,
            padding: 5,
            strokeColor: strokeColor,
            radicalColor: strokeColor,
            outlineColor: outlineColor,
            strokeAnimationSpeed: parseFloat(getCfg().strokeSpeed) || 1,
            delayBetweenStrokes: 150,
            delayBetweenLoops: 500,
            showOutline: true,
          },
        );
        window.decompHanziWriter.loopCharacterAnimation();
      } catch (e) {
        console.log("Could not load HanziWriter for character:", currentChar);
        document.getElementById("zh-decomp-stroke-target").innerHTML =
          "<div class='zh-no-stroke'>Không có dữ liệu nét bút</div>";
      }
    }

    requestAnimationFrame(() => {
      drawTreeLines();
      setTimeout(drawTreeLines, 100);
    });
  }

  window.VZ.config.subscribe((newCfg, changedKeys) => {
    if (changedKeys.includes("appearance")) {
      if (panelEl) {
        const toggleBtn = panelEl.querySelector("#zhDecompStrokeToggle");
        const container = panelEl.querySelector("#zhDecompStrokeContainer");
        if (toggleBtn && container) {
          const switchEl = toggleBtn.querySelector(".zh-switch");
          if (newCfg.showDecompStroke) {
            if (switchEl) switchEl.classList.add("active");
            container.classList.add("visible");
          } else {
            if (switchEl) switchEl.classList.remove("active");
            container.classList.remove("visible");
          }
        }
      }
    }
  });

  // Handle window resize: re-run the layout when a responsive breakpoint
  // changes the panel width, otherwise just redraw the connector lines.
  window.addEventListener("resize", () => {
    if (!panelEl || panelEl.style.display === "none") return;
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      if (!panelEl || panelEl.style.display === "none") return;
      const width = panelEl.getBoundingClientRect().width;
      if (Math.abs(width - lastLayoutWidth) > 24) {
        renderPanelContent();
      } else {
        drawTreeLines();
      }
    }, 150);
  });

  return {
    showPanel,
    hidePanel,
    getPanel: () => panelEl,
  };
})();
