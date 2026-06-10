// Global state variables for Chinese Hover Dictionary Content Script
let active = false;
let popupElement = null;
let fontFamily = "kaiti";
let theme = "light";
let fontSize = "medium";
let toggleActiveModifier = "alt";
let enableNudge = true;
let enableQuickActions = true;
let activeHighlights = [];
let hideTimer = null;
let currentLongestMatch = ""; // Track the currently active longest match for shortcuts
let hoveredCharRects = [];
let hoveredCharCenterX = 0;
let hoveredCharCenterY = 0;

let guideElement = null;
let guideHideTimer = null;
let watchMouseForGuide = false; // Flag to track when mouse enters webpage to hide guide
let toastElement = null;

let strokePopupElement = null;
let strokeHoverTimer = null;
let strokeHideTimer = null;
let hanziWriterInstance = null;
let strokeSpeed = "0.5";

// Customizable shortcut keys (starts with standard defaults)
let keys = {
  up: "w",
  down: "s",
  left: "a",
  right: "d",
  copy: "c",
  speak1: "1",
  speak2: "2",
  speak3: "3",
  speak4: "4",
  toggleActive: "x"
};

let mouseX = 0;
let mouseY = 0;
let targetX = 0;
let targetY = 0;
let lastEvent = null; // Store last mouse event globally to extract Shadow DOM path
let throttleTimer = null;
