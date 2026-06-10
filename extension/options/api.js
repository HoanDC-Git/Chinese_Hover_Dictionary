// Default settings
const isMac = navigator.userAgent.toLowerCase().includes("mac");
const DEFAULT_SETTINGS = {
  active: true,
  enableNudge: true,
  enableQuickActions: true,
  keyUp: "w",
  keyDown: "s",
  keyLeft: "a",
  keyRight: "d",
  keyCopy: "c",
  keySpeak1: "1",
  keySpeak2: "2",
  keySpeak3: "3",
  keySpeak4: "4",
  keyToggleActive: "x",
  fontFamily: "kaiti",
  fontSize: "medium",
  theme: "light",
  toggleActiveModifier: "alt",
  strokeSpeed: "0.5",
  memoryMode: "db",
};

const keys = [
  "keyUp",
  "keyDown",
  "keyLeft",
  "keyRight",
  "keyCopy",
  "keySpeak1",
  "keySpeak2",
  "keySpeak3",
  "keySpeak4",
  "keyToggleActive",
];

const dropdowns = ["fontFamily", "fontSize", "strokeSpeed", "memoryMode"];
