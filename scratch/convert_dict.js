const fs = require('fs');

const rawData = JSON.parse(fs.readFileSync('/home/naoh/Documents/HoanTapCode/Project2/extension/data/new_version_dictionary.json', 'utf8'));

const dictionary = {};
rawData.forEach(item => {
  if (!dictionary[item.word]) {
    dictionary[item.word] = [];
  }
  dictionary[item.word].push([
    item.pinyin || "",
    item.pos || "",
    item.meaning_vi || "",
    item.meaning_en || "",
    item.hsk_level || ""
  ]);
});

fs.writeFileSync('/home/naoh/Documents/HoanTapCode/Project2/extension/data/dictionary.dat', JSON.stringify(dictionary));
console.log('Successfully converted new_version_dictionary.json to dictionary.dat');
