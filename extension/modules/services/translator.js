window.VZ = window.VZ || {};
window.VZ.services = window.VZ.services || {};

window.VZ.services.translator = (function() {
  /**
   * Fetch translation from Google Translate API
   * @param {string} text - Chinese text to translate
   * @param {string} targetLang - Target language code (vi, en)
   * @returns {Promise<{translation: string, pinyin: string}>}
   */
  async function translateSentence(text, targetLang = 'vi') {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=${targetLang}&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
      const response = await fetch(url);
      const json = await response.json();
      
      let translation = "";
      let pinyin = "";
      
      if (json && json[0]) {
        translation = json[0]
          .map(item => item[0])
          .filter(item => typeof item === "string")
          .join("");
          
        const pinyinItem = json[0].find(item => item[0] === null && typeof item[3] === "string");
        if (pinyinItem) {
          pinyin = pinyinItem[3];
        }
      }
      
      return { translation, pinyin };
    } catch (err) {
      console.error("Google Translate API error:", err);
      throw err;
    }
  }

  return { translateSentence };
})();
