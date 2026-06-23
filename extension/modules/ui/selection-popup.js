let selectionIcon = null;
let sentencePopup = null;
let sentenceModalOverlay = null;
let currentSelection = "";
let currentRange = null;
let sentenceTargetLang = 'vi';
let cachedTranslations = { vi: null, en: null, pinyin: null };

chrome.storage.local.get(['sentenceTargetLang'], (result) => {
  if (result.sentenceTargetLang) {
    sentenceTargetLang = result.sentenceTargetLang;
  }
});

function createSelectionIcon() {
  if (!selectionIcon) {
    selectionIcon = document.createElement("div");
    selectionIcon.className = "zh-selection-icon zh-theme-" + (typeof theme !== 'undefined' ? theme : 'light');
    selectionIcon.title = "Dịch đoạn văn này";
    selectionIcon.innerHTML = `<img src="${chrome.runtime.getURL('icons/icon48.png')}" width="24" height="24" style="pointer-events: none;">`;
    document.body.appendChild(selectionIcon);
  }

  selectionIcon.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  
  selectionIcon.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openSentencePopup();
  });
}

function createSentencePopup() {
  if (sentencePopup) return;
  sentencePopup = document.createElement("div");
  sentencePopup.className = "zh-sentence-popup";
  document.body.appendChild(sentencePopup);
}

function createSentenceModal() {
  if (sentenceModalOverlay) return;
  sentenceModalOverlay = document.createElement("div");
  sentenceModalOverlay.className = "zh-report-overlay zh-theme-" + (typeof theme !== 'undefined' ? theme : 'light');
  sentenceModalOverlay.innerHTML = `
    <div class="zh-report-modal" style="max-width: 900px; width: 95%; max-height: 85vh; display: flex; flex-direction: column;">
      <div class="zh-report-header">
        Dịch đoạn văn
        <button class="zh-report-close-btn" id="zh-sentence-modal-close">&times;</button>
      </div>
      <div class="zh-report-body" style="overflow-y: hidden; flex: 1; padding: 20px; display: flex; flex-direction: column;">
        <div id="zh-sentence-modal-content" style="flex: 1; display: flex; flex-direction: column; min-height: 0;">Đang dịch...</div>
      </div>
    </div>
  `;
  document.body.appendChild(sentenceModalOverlay);

  const closeBtn = sentenceModalOverlay.querySelector("#zh-sentence-modal-close");
  closeBtn.addEventListener("click", hideSentenceModal);

  sentenceModalOverlay.addEventListener("click", (e) => {
    if (e.target === sentenceModalOverlay) hideSentenceModal();
  });
}

function hideSentenceModal() {
  if (sentenceModalOverlay) {
    sentenceModalOverlay.classList.remove("zh-visible");
    chrome.runtime.sendMessage({ action: "stop_audio" });
  }
}

function handleMouseUpSelection(e) {
  if (typeof active === 'undefined' || !active || typeof enableSelectionTranslate === 'undefined' || !enableSelectionTranslate) return;
  
  // If clicked inside popup, ignore
  if (e.target.closest(".zh-sentence-popup") || e.target.closest(".zh-selection-icon") || e.target.closest(".zh-report-overlay")) return;

  // Always hide stroke popup when clicking outside
  if (typeof hideStrokePopup === "function") hideStrokePopup();

  const selection = window.getSelection();
  const text = selection.toString().trim();

  // If text is valid Chinese (at least 1 Chinese character) and reasonable length
  if (text.length > 0 && /[\u4e00-\u9fa5]/.test(text) && text.length <= 1000) {
    currentSelection = text;
    currentRange = selection.getRangeAt(0);
    
    createSelectionIcon();
    // Position near the mouse cursor
    selectionIcon.style.left = `${e.clientX + window.scrollX + 8}px`;
    selectionIcon.style.top = `${e.clientY + window.scrollY + 8}px`;
    selectionIcon.classList.add("zh-visible");
    
    if (sentencePopup) sentencePopup.classList.remove("zh-visible");
    hideSentenceModal();
  } else {
    hideSelectionIcon();
  }
}

function hideSelectionIcon() {
  if (selectionIcon) selectionIcon.classList.remove("zh-visible");
}

document.addEventListener("mousedown", (e) => {
  if (sentencePopup && sentencePopup.classList.contains("zh-visible")) {
    // If click is outside the popup and not on the icon, close popup
    if (!e.target.closest(".zh-sentence-popup") && !e.target.closest(".zh-selection-icon")) {
      sentencePopup.classList.remove("zh-visible");
    }
  }
});

async function openSentencePopup() {
  if (selectionIcon) selectionIcon.classList.remove("zh-visible");
  
  // Send preload request to background (Edge TTS) only when popup is actually opened
  chrome.runtime.sendMessage({ action: "preloadTTS", text: currentSelection });
  
  const isLongText = currentSelection.length > 30;

  if (isLongText) {
    createSentenceModal();
    if (sentencePopup) sentencePopup.classList.remove("zh-visible");
    sentenceModalOverlay.className = "zh-report-overlay zh-theme-" + (typeof theme !== 'undefined' ? theme : 'light');
    const contentDiv = sentenceModalOverlay.querySelector("#zh-sentence-modal-content");
    contentDiv.innerHTML = `<div class="zh-spinner" style="margin: 20px auto; border-color: #2563eb; border-top-color: transparent;"></div><div style="text-align: center; color: #64748b;">Đang dịch...</div>`;
    sentenceModalOverlay.classList.add("zh-visible");
  } else {
    createSentencePopup();
    sentencePopup.className = "zh-sentence-popup zh-theme-" + (typeof theme !== 'undefined' ? theme : 'light');
    sentencePopup.innerHTML = `<div class="zh-sentence-loading">Đang dịch...</div>`;
    const rect = currentRange.getBoundingClientRect();
    let leftPos = rect.left + window.scrollX;
    if (leftPos + 350 > window.innerWidth) leftPos = window.innerWidth - 360;
    sentencePopup.style.left = `${Math.max(10, leftPos)}px`;
    sentencePopup.style.top = `${rect.bottom + window.scrollY + 10}px`;
    sentencePopup.classList.add("zh-visible");
  }
  
  try {
    const primaryLang = sentenceTargetLang;
    const backupLang = primaryLang === 'vi' ? 'en' : 'vi';
    
    // Reset cache
    cachedTranslations = { vi: null, en: null, pinyin: null };
    
    const primaryResult = await translateSentence(currentSelection, primaryLang);
    cachedTranslations[primaryLang] = primaryResult.translation;
    cachedTranslations.pinyin = primaryResult.pinyin;
    const { pinyin } = primaryResult;
    
    setTimeout(async () => {
      try {
        const backupResult = await translateSentence(currentSelection, backupLang);
        cachedTranslations[backupLang] = backupResult.translation;
        
        if (sentenceTargetLang === backupLang) {
          const container = isLongText ? sentenceModalOverlay : sentencePopup;
          const transText = container.querySelector('#zh-trans-text');
          const transCopy = container.querySelector('#zh-trans-copy');
          if (transText && transCopy) {
             transText.innerText = backupResult.translation;
             transCopy.setAttribute('data-copy', backupResult.translation);
          }
        }
      } catch (err) {
        console.error("Backup translation failed:", err);
      }
    }, 800);
    
    const charSpans = currentSelection.split('').map(char => {
      if (/[\u4e00-\u9fa5]/.test(char)) {
        return `<span class="${isLongText ? '' : 'zh-sentence-char'}" style="${isLongText ? '' : 'cursor: pointer;'}">${char}</span>`;
      }
      return `<span>${char}</span>`;
    }).join('');
    
    const copyIconUrl = chrome.runtime.getURL('icons/copy.svg');
    const isDark = typeof theme !== 'undefined' && theme === 'dark';
    const boxBg = isDark ? '#242728' : '#f8fafc';
    const boxBorder = isDark ? '#333333' : '#e2e8f0';
    const titleColor = isDark ? '#a1a1aa' : '#64748b';
    const textColor = isDark ? '#f4f4f5' : '#0f172a';
    const textMuted = isDark ? '#d4d4d8' : '#334155';
    
    const copyBtnStyle = `background: none; border: none; cursor: pointer; padding: 4px; opacity: 1; transition: transform 0.2s; border-radius: 4px; display: flex; align-items: center; justify-content: center; margin-left: 4px;`;
    const headerStyle = `display: flex; justify-content: flex-start; align-items: center; margin-bottom: 6px; font-size: 13px; color: ${titleColor}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; flex-shrink: 0; padding: 0 4px; gap: 12px; min-height: 28px;`;
    const boxWrapperStyle = `margin-bottom: 10px; display: flex; flex-direction: column;`;
    const boxContentStyle = `border: 1px solid ${boxBorder}; border-radius: 8px; padding: 8px; background: ${boxBg}; box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);`;
    const boxScrollStyle = isLongText ? `flex: 1; min-height: 0; overflow-y: auto;` : `max-height: 180px; overflow-y: auto;`;
    
    const actualFont = typeof fontFamily !== 'undefined' ? fontFamily : 'kaiti';
    const fontStyles = {
      "system": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      "fandolkailocal": "'FandolKai', 'FandolKai-Regular', 'Kaiti', serif",
      "kaiti": "'Kaiti TC', 'KaiTi', 'STKaiti', serif",
      "serif": "'Noto Serif SC', 'Noto Serif TC', 'Songti SC', 'SimSun', serif",
      "sans": "'Noto Sans SC', 'Noto Sans TC', 'Microsoft YaHei', 'PingFang SC', sans-serif"
    };
    const fontFamilyStyle = `font-family: ${fontStyles[actualFont] || fontStyles['kaiti']};`;

    const buildBoxes = (fontSizeHanzi, fontSizePinyin, fontSizeTrans) => `
      <div style="${boxWrapperStyle} ${isLongText ? 'flex: 1; min-height: 0;' : ''}">
        <div style="${headerStyle}">
          <span>Hán tự</span>
          <button class="zh-copy-btn" data-copy="${currentSelection.replace(/"/g, '&quot;')}" style="${copyBtnStyle}">
            <span class="zh-copy-text" style="font-size: 13px; margin-right: 4px; color: ${titleColor}; font-weight: 500; text-transform: none; letter-spacing: 0;">Sao chép</span>
            <span class="zh-copy-feedback" style="display: none; font-size: 13px; margin-right: 4px; color: ${isDark ? '#4ade80' : '#16a34a'}; font-weight: 500; text-transform: none; letter-spacing: 0;">Đã sao chép!</span>
            <img src="${copyIconUrl}" width="16" height="16" style="${isDark ? 'filter: invert(1) brightness(2);' : ''}">
          </button>
          <button class="zh-sentence-tts" id="zhSentenceTTS" title="Phát âm" style="display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 6px; border: none; background: transparent; cursor: pointer; color: ${titleColor}; font-weight: 500; font-size: 12px; transition: all 0.2s ease; margin-left: auto;">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zm-3 0L5 8H1v8h4l6 4.77V3.23zM16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg> Phát âm
          </button>
          ${isLongText ? `
          <div class="zh-audio-loader-container" id="zhAudioLoader" style="display: none; align-items: center; justify-content: center; margin-left: auto; width: 60px; height: 24px;">
             <div class="zh-audio-loader" style="color: ${titleColor};"></div>
          </div>
          <div class="zh-audio-controls" id="zhAudioControls" style="display: none; align-items: center; gap: 12px; margin-left: auto; background: ${isDark ? '#1b1b1d' : '#f1f5f9'}; padding: 2px 10px; border-radius: 20px; min-height: 28px; box-sizing: border-box;">
            <button id="zhAudioRewind" title="Lùi 5 giây" style="background:none; border:none; cursor:pointer; padding:2px; display:flex; align-items:center; opacity: 0.8; transition: opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">
               <img src="${chrome.runtime.getURL('icons/replay_5.svg')}" width="20" height="20" style="${isDark ? 'filter: invert(1);' : ''}">
            </button>
            <button id="zhAudioPlayPause" title="Tạm dừng" style="background:none; border:none; cursor:pointer; padding:2px; display:flex; opacity: 0.9; transition: opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.9'">
               <img class="zh-icon-pause" src="${chrome.runtime.getURL('icons/pause.svg')}" width="22" height="22" style="display:none; ${isDark ? 'filter: invert(1);' : ''}">
               <img class="zh-icon-play" src="${chrome.runtime.getURL('icons/play.svg')}" width="22" height="22" style="display:none; ${isDark ? 'filter: invert(1);' : ''}">
               <img class="zh-icon-replay" src="${chrome.runtime.getURL('icons/replay.svg')}" width="22" height="22" style="display:none; ${isDark ? 'filter: invert(1);' : ''}">
            </button>
            <button id="zhAudioForward" title="Tới 5 giây" style="background:none; border:none; cursor:pointer; padding:2px; display:flex; align-items:center; opacity: 0.8; transition: opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">
               <img src="${chrome.runtime.getURL('icons/forward_5.svg')}" width="20" height="20" style="${isDark ? 'filter: invert(1);' : ''}">
            </button>
          </div>
          ` : ''}
        </div>
        <div class="zh-custom-scrollbar" style="${boxContentStyle} ${boxScrollStyle}">
          <div class="zh-sentence-original" style="font-size: ${fontSizeHanzi}px; line-height: 1.6; color: ${textColor}; word-break: break-word; white-space: pre-wrap; ${fontFamilyStyle}">${charSpans}</div>
        </div>
      </div>
      
      <div style="${boxWrapperStyle} ${isLongText ? 'flex: 1; min-height: 0;' : ''}">
        <div style="${headerStyle}">
          <span>Pinyin</span>
          <button class="zh-copy-btn" data-copy="${pinyin ? pinyin.replace(/"/g, '&quot;') : ''}" style="${copyBtnStyle}">
            <span class="zh-copy-text" style="font-size: 13px; margin-right: 4px; color: ${titleColor}; font-weight: 500; text-transform: none; letter-spacing: 0;">Sao chép</span>
            <span class="zh-copy-feedback" style="display: none; font-size: 13px; margin-right: 4px; color: ${isDark ? '#4ade80' : '#16a34a'}; font-weight: 500; text-transform: none; letter-spacing: 0;">Đã sao chép!</span>
            <img src="${copyIconUrl}" width="16" height="16" style="${isDark ? 'filter: invert(1) brightness(2);' : ''}">
          </button>
        </div>
        <div class="zh-custom-scrollbar" style="${boxContentStyle} ${boxScrollStyle}">
          <div class="zh-sentence-pinyin" style="font-size: ${fontSizePinyin}px; line-height: 1.6; color: ${textMuted}; word-break: break-word; white-space: pre-wrap; ${fontFamilyStyle}">${pinyin || ""}</div>
        </div>
      </div>
      
      <div style="${boxWrapperStyle} ${isLongText ? 'flex: 1; min-height: 0;' : ''} margin-bottom: 0;">
        <div style="${headerStyle}">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>Dịch nghĩa</span>
            <button class="zh-copy-btn" id="zh-trans-copy" data-copy="${(cachedTranslations[sentenceTargetLang] || 'Đang dịch...').replace(/"/g, '&quot;')}" style="${copyBtnStyle}">
              <span class="zh-copy-text" style="font-size: 13px; margin-right: 4px; color: ${titleColor}; font-weight: 500; text-transform: none; letter-spacing: 0;">Sao chép</span>
              <span class="zh-copy-feedback" style="display: none; font-size: 13px; margin-right: 4px; color: ${isDark ? '#4ade80' : '#16a34a'}; font-weight: 500; text-transform: none; letter-spacing: 0;">Đã sao chép!</span>
              <img src="${copyIconUrl}" width="16" height="16" style="${isDark ? 'filter: invert(1) brightness(2);' : ''}">
            </button>
          </div>
          <div class="zh-lang-toggle" style="display: flex; background: ${isDark ? '#111' : '#e2e8f0'}; border-radius: 4px; padding: 2px; cursor: pointer; margin-left: auto;">
            <span class="zh-lang-btn" data-lang="vi" style="padding: 2px 8px; border-radius: 2px; font-size: 11px; transition: all 0.2s; ${sentenceTargetLang === 'vi' ? `background: ${isDark ? '#3b82f6' : '#fff'}; color: ${isDark ? '#fff' : '#0f172a'}; box-shadow: 0 1px 2px rgba(0,0,0,0.1);` : `color: ${titleColor};`}">VI</span>
            <span class="zh-lang-btn" data-lang="en" style="padding: 2px 8px; border-radius: 2px; font-size: 11px; transition: all 0.2s; ${sentenceTargetLang === 'en' ? `background: ${isDark ? '#3b82f6' : '#fff'}; color: ${isDark ? '#fff' : '#0f172a'}; box-shadow: 0 1px 2px rgba(0,0,0,0.1);` : `color: ${titleColor};`}">EN</span>
          </div>
        </div>
        <div class="zh-custom-scrollbar" style="${boxContentStyle} ${boxScrollStyle}">
          <div id="zh-trans-text" class="zh-sentence-translation" style="font-size: ${fontSizeTrans}px; line-height: 1.6; color: ${textColor}; word-break: break-word; white-space: pre-wrap;">${cachedTranslations[sentenceTargetLang] || 'Đang dịch...'}</div>
        </div>
      </div>
    `;
    
    let baseSize = 22;
    if (typeof fontSize !== 'undefined') {
      if (fontSize === 'small') baseSize = 18;
      else if (fontSize === 'large') baseSize = 26;
      else if (fontSize === 'x-large') baseSize = 30;
    }
    
    let sizeHanzi, sizePinyin, sizeTrans;
    const len = currentSelection.length;
    
      const attachBoxEvents = (container) => {
      const ttsBtn = container.querySelector("#zhSentenceTTS");
      const audioControls = container.querySelector("#zhAudioControls");
      const audioLoader = container.querySelector("#zhAudioLoader");
      const playPauseBtn = container.querySelector("#zhAudioPlayPause");
      const rewindBtn = container.querySelector("#zhAudioRewind");
      const forwardBtn = container.querySelector("#zhAudioForward");
      
      let audioState = 'stopped';
      
      const updateAudioUI = () => {
        if (!playPauseBtn || !audioControls || !audioLoader) return;
        const iconPause = playPauseBtn.querySelector(".zh-icon-pause");
        const iconPlay = playPauseBtn.querySelector(".zh-icon-play");
        const iconReplay = playPauseBtn.querySelector(".zh-icon-replay");
        
        if (iconPause) iconPause.style.display = 'none';
        if (iconPlay) iconPlay.style.display = 'none';
        if (iconReplay) iconReplay.style.display = 'none';
        
        if (audioState === 'loading') {
          audioLoader.style.display = 'flex';
          audioControls.style.display = 'none';
        } else {
          audioLoader.style.display = 'none';
          if (audioState !== 'stopped') audioControls.style.display = 'flex';
          
          if (audioState === 'playing') {
            if (iconPause) iconPause.style.display = 'block';
            playPauseBtn.title = 'Tạm dừng';
          } else if (audioState === 'paused') {
            if (iconPlay) iconPlay.style.display = 'block';
            playPauseBtn.title = 'Phát';
          } else if (audioState === 'ended') {
            if (iconReplay) iconReplay.style.display = 'block';
            playPauseBtn.title = 'Phát lại';
          }
        }
      };

      const messageListener = (msg) => {
        if (!document.body.contains(container)) {
          chrome.runtime.onMessage.removeListener(messageListener);
          return;
        }
        if (msg.action === "audio_started" && audioState === 'loading') {
          audioState = 'playing';
          updateAudioUI();
        }
      };
      chrome.runtime.onMessage.addListener(messageListener);

      if (ttsBtn) {
        ttsBtn.addEventListener("click", () => {
          if (isLongText && audioControls) {
            ttsBtn.style.display = 'none';
            audioState = 'loading';
            updateAudioUI();
          }
          chrome.runtime.sendMessage({ action: "speak", text: currentSelection }).then(() => {
            if (isLongText && audioState !== 'stopped') {
              audioState = 'ended';
              updateAudioUI();
            }
          }).catch(err => {
            console.error("Audio playback error:", err);
            if (isLongText) {
              audioState = 'stopped';
              ttsBtn.style.display = 'flex';
              updateAudioUI();
            }
          });
        });
      }
      
      if (playPauseBtn) {
        playPauseBtn.addEventListener("click", () => {
          if (audioState === 'playing') {
            audioState = 'paused';
            chrome.runtime.sendMessage({ action: "pause_audio" });
          } else if (audioState === 'paused') {
            audioState = 'playing';
            chrome.runtime.sendMessage({ action: "resume_audio" });
          } else if (audioState === 'ended') {
            audioState = 'playing';
            chrome.runtime.sendMessage({ action: "speak", text: currentSelection }).then(() => {
              if (audioState !== 'stopped') {
                audioState = 'ended';
                updateAudioUI();
              }
            });
          }
          updateAudioUI();
        });
      }
      
      if (rewindBtn) {
        rewindBtn.addEventListener("click", () => chrome.runtime.sendMessage({ action: "seek_audio", seconds: -5 }));
      }
      
      if (forwardBtn) {
        forwardBtn.addEventListener("click", () => chrome.runtime.sendMessage({ action: "seek_audio", seconds: 5 }));
      }
      
      container.querySelectorAll(".zh-copy-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          navigator.clipboard.writeText(btn.getAttribute("data-copy"));
          
          const textSpan = btn.querySelector('.zh-copy-text');
          const feedback = btn.querySelector('.zh-copy-feedback');
          if (textSpan) textSpan.style.display = 'none';
          if (feedback) feedback.style.display = 'inline';
          btn.style.opacity = "1";
          btn.style.background = isDark ? "#065f46" : "#dcfce3";
          
          setTimeout(() => { 
            if (textSpan) textSpan.style.display = 'inline';
            if (feedback) feedback.style.display = 'none';
            btn.style.background = "none"; 
            btn.style.opacity = "1"; 
          }, 1500);
        });
      });

      const updateTransUI = () => {
        const viBtn = container.querySelector('.zh-lang-btn[data-lang="vi"]');
        const enBtn = container.querySelector('.zh-lang-btn[data-lang="en"]');
        const transText = container.querySelector('#zh-trans-text');
        const transCopy = container.querySelector('#zh-trans-copy');
        
        if (viBtn && enBtn && transText && transCopy) {
          viBtn.style.cssText = `padding: 2px 8px; border-radius: 2px; font-size: 11px; transition: all 0.2s; ${sentenceTargetLang === 'vi' ? `background: ${isDark ? '#3b82f6' : '#fff'}; color: ${isDark ? '#fff' : '#0f172a'}; box-shadow: 0 1px 2px rgba(0,0,0,0.1);` : `color: ${titleColor};`}`;
          enBtn.style.cssText = `padding: 2px 8px; border-radius: 2px; font-size: 11px; transition: all 0.2s; ${sentenceTargetLang === 'en' ? `background: ${isDark ? '#3b82f6' : '#fff'}; color: ${isDark ? '#fff' : '#0f172a'}; box-shadow: 0 1px 2px rgba(0,0,0,0.1);` : `color: ${titleColor};`}`;
          
          const trans = cachedTranslations[sentenceTargetLang] || 'Đang dịch...';
          transText.innerText = trans;
          transCopy.setAttribute('data-copy', trans);
        }
      };

      container.querySelectorAll('.zh-lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const lang = btn.getAttribute('data-lang');
          if (sentenceTargetLang !== lang) {
            sentenceTargetLang = lang;
            chrome.storage.local.set({ sentenceTargetLang });
            updateTransUI();
          }
        });
      });
    };
    
    if (isLongText) {
      // Logic cho Cửa sổ dài (Modal): Mốc 50 ký tự
      let decrease = 0;
      if (len > 50) {
        decrease = Math.min(6, Math.floor((len - 50) / 40));
      }
      sizeHanzi = Math.max(18, baseSize + 2 - decrease);
      sizePinyin = Math.max(14, baseSize - 2 - decrease);
      sizeTrans = Math.max(14, baseSize - 4 - decrease);
      
      const contentDiv = sentenceModalOverlay.querySelector("#zh-sentence-modal-content");
      contentDiv.innerHTML = buildBoxes(sizeHanzi, sizePinyin, sizeTrans);
      attachBoxEvents(contentDiv);
      
    } else {
      // Logic cho Popup ngắn (từ 1 đến 30 ký tự): Mốc 10 ký tự
      let decrease = 0;
      if (len > 10) {
        decrease = Math.floor((len - 10) / 5);
      }
      sizeHanzi = Math.max(16, baseSize - 2 - decrease);
      sizePinyin = Math.max(14, baseSize - 5 - decrease);
      sizeTrans = Math.max(14, baseSize - 6 - decrease);
      
      sentencePopup.innerHTML = buildBoxes(sizeHanzi, sizePinyin, sizeTrans);
      
      requestAnimationFrame(() => {
        const popupRect = sentencePopup.getBoundingClientRect();
        const selectionRect = currentRange.getBoundingClientRect();
        if (selectionRect.bottom + popupRect.height + 10 > window.innerHeight) {
          sentencePopup.style.top = `${selectionRect.top + window.scrollY - popupRect.height - 10}px`;
        }
      });
      
      attachBoxEvents(sentencePopup);
    }
    
  } catch (err) {
    if (isLongText) {
      sentenceModalOverlay.querySelector("#zh-sentence-modal-content").innerHTML = `<div class="zh-sentence-error" style="color: red; text-align: center;">Lỗi dịch thuật: ${err.message}</div>`;
    } else {
      sentencePopup.innerHTML = `<div class="zh-sentence-error">Lỗi dịch thuật: ${err.message}</div>`;
    }
  }
}
