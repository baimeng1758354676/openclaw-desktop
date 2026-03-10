const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 测试连接
  ping: () => ipcRenderer.invoke('ping'),
  
  // 获取状态
  getStatus: () => ipcRenderer.invoke('get-status'),
  
  // 启动服务
  startGateway: () => ipcRenderer.invoke('start-gateway'),
  
  // 停止服务
  stopGateway: () => ipcRenderer.invoke('stop-gateway'),
  
  // 首次配置
  runConfig: () => ipcRenderer.invoke('run-config'),
  
  // 打开浏览器
  openBrowser: () => ipcRenderer.invoke('open-browser'),
  
  // 监听状态变化
  onStatusChanged: (callback) => {
    ipcRenderer.on('status-changed', (event, running) => callback(running));
  },
  
  // 监听控制台日志
  onConsoleLog: (callback) => {
    ipcRenderer.on('console-log', (event, msg) => callback(msg));
  }
});
