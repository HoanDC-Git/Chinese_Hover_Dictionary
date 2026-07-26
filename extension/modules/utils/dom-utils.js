window.VZ = window.VZ || {};
window.VZ.utils = window.VZ.utils || {};

window.VZ.utils.dom = (function() {
  function getChineseTextAndMap(startNode, startOffset) {
    let substring = "";
    const charMap = [];
    
    const textVal = startNode.textContent;
    if (startOffset >= textVal.length || /\s/.test(textVal[startOffset])) {
      return { substring: "", charMap: [] };
    }
    
    let currentNode = startNode;
    let currentOffset = startOffset;
    
    while (currentNode && substring.length < 5) {
      const text = currentNode.textContent;
      let i = currentOffset;
      
      while (i < text.length && substring.length < 5) {
        const char = text[i];
        if (/\s/.test(char)) {
          i++;
        } else {
          substring += char;
          charMap.push({
            node: currentNode,
            offset: i
          });
          i++;
        }
      }
      
      if (substring.length >= 5) {
        break;
      }
      
      currentNode = getNextTextNode(currentNode);
      currentOffset = 0;
    }
    
    return { substring, charMap };
  }

  function getNextTextNode(node) {
    let current = node;
    while (current) {
      if (current.firstChild) {
        current = current.firstChild;
      } else if (current.nextSibling) {
        current = current.nextSibling;
      } else {
        let parent = current.parentNode;
        while (parent && !parent.nextSibling) {
          parent = parent.parentNode;
        }
        current = parent ? parent.nextSibling : null;
      }
      
      if (current && current.nodeType === Node.ELEMENT_NODE) {
        const tag = current.tagName;
        if (['DIV', 'P', 'BR', 'HR', 'TABLE', 'TR', 'TD', 'LI', 'OL', 'UL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'IFRAME', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER'].includes(tag)) {
          return null;
        }
      }
      
      if (current && current.nodeType === Node.TEXT_NODE) {
        if (current.textContent.length > 0) {
          return current;
        }
      }
    }
    return null;
  }

  return { getChineseTextAndMap, getNextTextNode };
})();
