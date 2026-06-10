// Helper utilities and text processing algorithms for Chinese Hover Dictionary

// Format Pinyin by wrapping each syllable in alternating color classes
function formatPinyin(pinyin) {
  if (!pinyin) return "";
  const syllables = pinyin.split(/\s+/);
  return syllables.map((syllable, idx) => {
    const colorClass = `zh-pinyin-s${idx % 5}`;
    return `<span class="${colorClass}">${syllable}</span>`;
  }).join(" ");
}

// Extract up to 5 non-whitespace characters to the right, traversing DOM siblings if necessary
function getChineseTextAndMap(startNode, startOffset) {
  let substring = "";
  const charMap = []; // Maps each character in substring to its raw { node, offset }
  
  // Ensure the character directly under the cursor is not whitespace
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
        // Skip whitespace/newlines (e.g. line breaks in code)
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
    
    // Move to next text node in DOM order
    currentNode = getNextTextNode(currentNode);
    currentOffset = 0;
  }
  
  return { substring, charMap };
}

// Find next text node in pre-order traversal, stopping at block elements
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
    
    // Check if we hit a layout block boundary (don't cross blocks like divs, paragraphs, tables)
    if (current && current.nodeType === Node.ELEMENT_NODE) {
      const tag = current.tagName;
      if (['DIV', 'P', 'BR', 'HR', 'TABLE', 'TR', 'TD', 'LI', 'OL', 'UL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'IFRAME', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER'].includes(tag)) {
        return null;
      }
    }
    
    if (current && current.nodeType === Node.TEXT_NODE) {
      // Return if it contains non-whitespace characters
      if (current.textContent.length > 0) {
        return current;
      }
    }
  }
  return null;
}
