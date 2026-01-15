const { app, BrowserWindow } = require('electron');
console.log('app:', typeof app);
console.log('process.type:', process.type);

app.whenReady().then(() => {
  console.log('App ready!');
  app.quit();
});
