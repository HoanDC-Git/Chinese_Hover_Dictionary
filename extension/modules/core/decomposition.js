window.zhDecomposition = (function () {
  const IDC_ARITY = {
    '⿰': 2, '⿱': 2, '⿴': 2, '⿵': 2, '⿶': 2, '⿷': 2, '⿸': 2, '⿹': 2, '⿺': 2, '⿻': 2,
    '⿲': 3, '⿳': 3
  };

  async function fetchNodeData(char) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ action: "getDecomposition", character: char }, resolve);
    });
  }

  // To prevent infinite recursion in case of cyclic references (should not happen, but safety first)
  const MAX_DEPTH = 10;

  async function buildTree(char, depth = 0) {
    if (depth > MAX_DEPTH) {
      return { char, isLeaf: true };
    }

    const data = await fetchNodeData(char);
    if (!data || (!data.details && !data.radical && !data.special)) {
      return { char, isLeaf: true };
    }
    
    // Check if this character is from specials.json (un-renderable)
    const isSpecial = !!data.special;
    let decompositionStr = null;
    let pinyin = '';
    let label = '';
    let etymology = '';
    let meaning = '';

    if (data.details) {
      decompositionStr = data.details.decomposition;
      pinyin = data.details.pinyin || '';
      etymology = data.details.etymology_hint_vi || '';
      if (data.details.definition_vi) {
        meaning = data.details.definition_vi.split(/[,;]/)[0].trim();
      }
    } else if (data.special) {
      decompositionStr = data.special.decomposition;
    }

    if (data.radical) {
      pinyin = data.radical.pinyin || pinyin;
      if (data.radical.meaning_vi) {
        const parts = data.radical.meaning_vi.split(/[:\-]/);
        if (data.radical.type === 'radical') {
          label = parts[0].trim();
        }
        if (!meaning && parts.length > 1) {
          meaning = parts.slice(1).join(':').trim();
        }
      }
    }

    // If no decomposition string, it's a leaf node
    if (!decompositionStr) {
      return { char, pinyin, label, meaning, type: data.radical?.type, isSpecial, isLeaf: true, children: [], etymology };
    }

    // Parse decomposition string
    const operator = decompositionStr[0];
    const children = [];
    
    // Some entries might not start with an operator if they are just a single char?
    // According to details.json, they always start with an operator.
    if (IDC_ARITY[operator]) {
      const chars = Array.from(decompositionStr);
      for (let i = 1; i < chars.length; i++) {
        const childNode = await buildTree(chars[i], depth + 1);
        if (childNode) children.push(childNode);
      }
      
      return {
        char,
        pinyin,
        label,
        meaning,
        type: data.radical?.type,
        isSpecial,
        isLeaf: false,
        operatorNode: { operator, children },
        etymology
      };
    } else {
      // Fallback if no valid operator
      return { char, pinyin, label, meaning, isSpecial, isLeaf: true, children: [], etymology };
    }
  }

  return {
    buildTree
  };
})();
