window.VZ = window.VZ || {};
window.VZ.services = window.VZ.services || {};

window.VZ.services.dictionary = (function () {
  const IDC_ARITY = {
    '⿰': 2, '⿱': 2, '⿴': 2, '⿵': 2, '⿶': 2, '⿷': 2, '⿸': 2, '⿹': 2, '⿺': 2, '⿻': 2,
    '⿼': 2, '⿽': 2,
    '⿲': 3, '⿳': 3,
    '⿾': 1, '⿿': 1
  };

  const REQUEST_TIMEOUT_MS = 3000;
  const MAX_ATTEMPTS = 2;

  function requestNodeData(char) {
    return new Promise((resolve) => {
      let settled = false;
      let timer = null;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(value);
      };

      timer = setTimeout(() => {
        console.warn(`Decomposition request timed out for "${char}".`);
        finish({ __error: true });
      }, REQUEST_TIMEOUT_MS);

      try {
        chrome.runtime.sendMessage(
          { action: "getDecomposition", character: char },
          (response) => {
            // Read lastError even after a timeout so Chrome does not log an
            // unchecked runtime error when the worker is restarting.
            const runtimeError = chrome.runtime.lastError;
            if (runtimeError) {
              console.warn(
                `Decomposition request failed for "${char}":`,
                runtimeError.message,
              );
              finish({ __error: true });
              return;
            }
            finish(response || { __error: true });
          },
        );
      } catch (err) {
        console.warn(`Could not send decomposition request for "${char}":`, err);
        finish({ __error: true });
      }
    });
  }

  async function fetchNodeData(char) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const data = await requestNodeData(char);
      if (data && data.ok !== false && !data.__error) {
        return data;
      }
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    return { __error: true };
  }

  const MAX_DEPTH = 10;

  async function buildTree(char, depth = 0) {
    if (depth > MAX_DEPTH) {
      return { char, isLeaf: true };
    }

    const data = await fetchNodeData(char);
    if (!data || data.__error) {
      return { char, isLeaf: true, missing: true, loadFailed: true };
    }
    if (!data.details && !data.radical && !data.special) {
      return { char, isLeaf: true, missing: true };
    }
    
    const isSpecial = !!data.special;
    let decompositionStr = null;
    let pinyin = '';
    let label = '';
    let etymology = '';
    let meaning = '';

    if (data.details) {
      decompositionStr = data.details.decomposition;
      pinyin = data.details.pinyin || '';
      etymology = data.details.hint_vi || '';
      if (data.details.definition_vi) {
        meaning = data.details.definition_vi.trim();
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

    if (!decompositionStr) {
      return { char, pinyin, label, meaning, type: data.radical?.type, isSpecial, isLeaf: true, children: [], etymology };
    }

    const operator = decompositionStr[0];
    const children = [];
    
    if (IDC_ARITY[operator]) {
      const chars = Array.from(decompositionStr);
      for (let i = 1; i < chars.length; i++) {
        const childNode = await buildTree(chars[i], depth + 1);
        if (childNode) {
          // Fix 阝 (bộ ấp / bộ phụ) based on position
          if (childNode.char === '阝') {
            const isLeft = (i === 1);
            const isRight = (operator === '⿰' && i === 2) || (operator === '⿲' && i === 3);
            if (isLeft) {
              childNode.label = "Bộ phụ";
              childNode.meaning = "Gò đất";
              childNode.pinyin = "fù";
            } else if (isRight) {
              childNode.label = "Bộ ấp";
              childNode.meaning = "Vùng đất, làng";
              childNode.pinyin = "yì";
            }
          }
          children.push(childNode);
        }
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
      return { char, pinyin, label, meaning, isSpecial, isLeaf: true, children: [], etymology };
    }
  }

  return {
    buildTree
  };
})();
