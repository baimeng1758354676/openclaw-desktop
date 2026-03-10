const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const log = require('electron-log');

// 配置日志
log.transports.file.level = 'info';
log.transports.file.maxSize = 5 * 1024 * 1024;
log.info('OpenClaw 桌面版启动...');

// 全局变量
let mainWindow = null;
let gatewayProcess = null;
let isGatewayRunning = false;

// 获取 OpenClaw 目录
function getOpenClawDir() {
  // 打包后 resources 目录，开发时用项目目录
  if (app.isPackaged) {
    // 尝试几种可能的路径
    const paths = [
      path.join(process.resourcesPath, 'openclaw'),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'openclaw'),
      path.join(path.dirname(process.execPath), 'resources', 'openclaw'),
      path.join(path.dirname(process.execPath), 'resources', 'app.asar.unpacked', 'openclaw')
    ];
    
    for (const p of paths) {
      const fs = require('fs');
      if (fs.existsSync(p)) {
        log.info(`找到 OpenClaw 目录: ${p}`);
        return p;
      }
    }
    
    log.error('未找到 OpenClaw 目录');
    return paths[0];
  }
  return path.join(app.getAppPath(), 'openclaw');
}

// 检测服务是否运行 - 加超时
function checkGatewayStatus() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(false);
    }, 3000);
    
    const req = http.get('http://127.0.0.1:18789', (res) => {
      clearTimeout(timeout);
      resolve(true);
    });
    req.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// 获取 OpenClaw 版本
function getVersion() {
  try {
    const openclawDir = getOpenClawDir();
    const packageJson = require(path.join(openclawDir, 'package.json'));
    return packageJson.version || '未知';
  } catch (e) {
    return '未知';
  }
}

// 运行 BAT 脚本
function runBatScript(scriptName) {
  return new Promise((resolve, reject) => {
    const openclawDir = getOpenClawDir();
    const scriptPath = path.join(openclawDir, scriptName);
    
    log.info(`运行脚本: ${scriptPath}`);
    console.log(`[OpenClaw] 运行脚本: ${scriptPath}`);
    
    // 先检查文件是否存在
    const fs = require('fs');
    if (!fs.existsSync(scriptPath)) {
      const error = `脚本不存在: ${scriptPath}`;
      log.error(error);
      console.log(`[OpenClaw] 错误: ${error}`);
      reject(new Error(error));
      return;
    }
    
    const proc = spawn('cmd', ['/c', 'start', '""', scriptPath], {
      cwd: openclawDir,
      stdio: 'pipe',
      shell: true,
      detached: true
    });

    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
      console.log(`[OpenClaw stdout] ${data}`);
    });
    
    proc.stderr.on('data', (data) => {
      output += data.toString();
      console.log(`[OpenClaw stderr] ${data}`);
    });

    proc.on('close', (code) => {
      log.info(`脚本 ${scriptName} 执行完成，退出码: ${code}`);
      console.log(`[OpenClaw] 脚本执行完成，退出码: ${code}`);
      resolve(code);
    });

    proc.on('error', (err) => {
      const error = `脚本执行失败: ${err.message}`;
      log.error(error);
      console.log(`[OpenClaw] 错误: ${error}`);
      reject(err);
    });
  });
}

// 启动服务
async function startGateway() {
  if (isGatewayRunning) {
    return { success: true, message: '服务已在运行' };
  }

  try {
    log.info('开始启动 Gateway 服务...');
    console.log('[OpenClaw] 开始启动 Gateway 服务...');
    
    const openclawDir = getOpenClawDir();
    console.log(`[OpenClaw] OpenClaw 目录: ${openclawDir}`);
    
    await runBatScript('02_启动服务.bat');
    isGatewayRunning = true;
    
    log.info('Gateway 服务已启动');
    console.log('[OpenClaw] Gateway 服务已启动');
    
    return { success: true, message: '服务已启动' };
  } catch (e) {
    log.error(`启动失败: ${e.message}`);
    console.log(`[OpenClaw] 启动失败: ${e.message}`);
    return { success: false, message: e.message };
  }
}

// 停止服务
async function stopGateway() {
  if (!isGatewayRunning) {
    return { success: true, message: '服务未运行' };
  }

  try {
    // 查找并终止 node 进程
    const { execSync } = require('child_process');
    execSync('taskkill /F /IM node.exe /T', { stdio: 'ignore' });
    isGatewayRunning = false;
    log.info('Gateway 服务已停止');
    return { success: true, message: '服务已停止' };
  } catch (e) {
    isGatewayRunning = false;
    return { success: true, message: '服务已停止' };
  }
}

// 首次配置
async function runConfig() {
  try {
    await runBatScript('01_首次配置.bat');
    return { success: true, message: '配置完成' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// 打开浏览器
function openBrowser() {
  shell.openExternal('http://127.0.0.1:18789');
}

// 创建窗口
function createWindow() {
  console.log('[OpenClaw] 创建窗口...');
  
  mainWindow = new BrowserWindow({
    width: 500,
    height: 450,
    resizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'OpenClaw',
    backgroundColor: '#1a1a2e'
  });

  console.log('[OpenClaw] 加载页面...');
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[OpenClaw] 页面加载失败:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[OpenClaw] 页面加载完成');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC 处理
ipcMain.handle('ping', async () => {
  console.log('[OpenClaw] 收到 ping 请求');
  return { pong: true, time: Date.now() };
});

ipcMain.handle('get-status', async () => {
  console.log('[OpenClaw] ========== 开始获取状态 ==========');
  
  let running = false;
  let version = '未知';
  
  try {
    console.log('[OpenClaw] 检查服务状态...');
    running = await checkGatewayStatus();
    console.log(`[OpenClaw] 服务状态: ${running}`);
  } catch (e) {
    console.log(`[OpenClaw] 检查服务状态失败: ${e.message}`);
  }
  
  try {
    console.log('[OpenClaw] 获取版本...');
    version = getVersion();
    console.log(`[OpenClaw] 版本: ${version}`);
  } catch (e) {
    console.log(`[OpenClaw] 获取版本失败: ${e.message}`);
  }
  
  isGatewayRunning = running;
  
  const result = { 
    running, 
    version,
    port: 18789 
  };
  
  console.log('[OpenClaw] 返回结果:', JSON.stringify(result));
  console.log('[OpenClaw] ========== 获取状态完成 ==========');
  
  return result;
});

ipcMain.handle('start-gateway', async () => {
  return await startGateway();
});

ipcMain.handle('stop-gateway', async () => {
  return await stopGateway();
});

ipcMain.handle('run-config', async () => {
  return await runConfig();
});

ipcMain.handle('open-browser', async () => {
  openBrowser();
});

// 定时检查状态
setInterval(async () => {
  if (mainWindow) {
    const running = await checkGatewayStatus();
    isGatewayRunning = running;
    mainWindow.webContents.send('status-changed', running);
  }
}, 3000);

// 转发 console.log 到界面
const originalConsoleLog = console.log;
console.log = function(...args) {
  originalConsoleLog.apply(console, args);
  if (mainWindow) {
    mainWindow.webContents.send('console-log', args.join(' '));
  }
};

// 全局异常处理
process.on('uncaughtException', (error) => {
  log.error('未捕获异常:', error);
});

process.on('unhandledRejection', (reason) => {
  log.error('未处理 Promise 拒绝:', reason);
});

app.whenReady().then(() => {
  log.info('创建窗口...');
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
