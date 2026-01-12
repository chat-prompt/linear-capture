console.log("Testing electron require...");
const electron = require("electron");
console.log("electron keys:", Object.keys(electron).slice(0, 10));
console.log("electron.app:", electron.app);
console.log("electron.BrowserWindow:", electron.BrowserWindow);
