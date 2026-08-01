const fs = require('fs');
const path = require('path');

try {
  // 1. Update dictionary.json
  const dictPath = path.join(__dirname, '../extension/data/dictionary.json');
  const dictData = fs.readFileSync(dictPath, 'utf8');
  let dict = JSON.parse(dictData);

  if (!dict['莖']) {
    dict['莖'] = [
      [
        "jīng",
        "noun",
        "thân cây",
        "stalk, stem",
        "7-9"
      ]
    ];
    fs.writeFileSync(dictPath, JSON.stringify(dict, null, 2) + '\n');
    console.log('Added 莖 to dictionary.json');
  } else {
    console.log('莖 already in dictionary.json');
  }

  // 2. Update details.json
  const detailsPath = path.join(__dirname, '../extension/data/decompostion/details.json');
  const detailsData = fs.readFileSync(detailsPath, 'utf8');
  let details = JSON.parse(detailsData);

  const exists = details.find(d => d.character === '莖');
  if (!exists) {
    const maxId = details.reduce((max, d) => Math.max(max, d.id || 0), 0);
    details.push({
      id: maxId + 1,
      character: "莖",
      pinyin: "jīng",
      definition_vi: "thân cây",
      radical: "艹",
      decomposition: "⿱艹巠",
      stroke_count: 11,
      hint_vi: "Phần của thực vật (艹) vươn lên để nâng đỡ lá và hoa chính là thân cây (莖)."
    });
    fs.writeFileSync(detailsPath, JSON.stringify(details, null, 2) + '\n');
    console.log('Added 莖 to details.json');
  } else {
    console.log('莖 already in details.json');
  }

} catch (error) {
  console.error("Error updating files:", error);
}
