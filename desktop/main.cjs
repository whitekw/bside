const path = require('node:path')
const { app, BrowserWindow, Notification, ipcMain, session, shell } = require('electron')
const {
  DEFAULT_SITE_URL,
  siteOrigin,
  isSitePage,
  isAllowedNavigation,
  chatNotification,
} = require('./appUrl.cjs')
const { createUpdateChecker } = require('./updates.cjs')

const APP_ID = 'com.whitekw.bside'
const siteUrl = siteOrigin(process.env.BSIDE_APP_URL || DEFAULT_SITE_URL)
const smokeTest = process.env.BSIDE_DESKTOP_SMOKE === '1'
const customTitleBar = process.platform === 'win32'
let mainWindow = null

// Keep development and smoke runs from activating an already installed app.
if (smokeTest || process.env.BSIDE_APP_URL) {
  app.setPath('userData', `${app.getPath('userData')}-${smokeTest ? `smoke-${process.pid}` : 'development'}`)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID)
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const pageUrl = details.requestingUrl || webContents.getURL()
      callback(isSitePage(pageUrl, siteUrl) && [
        'clipboard-sanitized-write',
        'fullscreen',
      ].includes(permission))
    })

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 760,
      minHeight: 540,
      backgroundColor: '#0d0a14',
      show: !smokeTest,
      autoHideMenuBar: true,
      ...(customTitleBar ? {
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: '#00000000', symbolColor: '#f6f4ff', height: 48 },
      } : {}),
      icon: path.join(__dirname, 'assets', 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webviewTag: false,
        additionalArguments: customTitleBar ? ['--bside-custom-titlebar'] : [],
      },
    })

    const trustedMainFrame = (event) => Boolean(mainWindow && !mainWindow.isDestroyed()
      && event.sender === mainWindow.webContents
      && event.senderFrame === mainWindow.webContents.mainFrame
      && isSitePage(event.senderFrame.url, siteUrl))
    const updateChecker = createUpdateChecker({
      currentVersion: app.getVersion(),
      ...(smokeTest ? { fetchImpl: async () => ({ ok: true, json: async () => [{
        tag_name: 'v999.0.0', assets: [{ name: 'B-SIDE-999.0.0-Setup-x64.exe', state: 'uploaded',
          browser_download_url: 'https://github.com/whitekw/jukebox/releases/download/v999.0.0/B-SIDE-999.0.0-Setup-x64.exe' }],
      }] }) } : {}),
      onChange: (state) => {
        if (mainWindow && !mainWindow.isDestroyed() && isSitePage(mainWindow.webContents.getURL(), siteUrl)) {
          mainWindow.webContents.send('desktop:update-state', state)
        }
      },
    })
    ipcMain.handle('desktop:update-state', (event) => trustedMainFrame(event) ? updateChecker.getState() : null)
    ipcMain.handle('desktop:open-update', async (event) => {
      if (!trustedMainFrame(event)) return false
      const url = updateChecker.getDownloadUrl()
      if (!url) return false
      try { await shell.openExternal(url); return true } catch { return false }
    })
    // Release checks run in the main process, independently of web page reloads.
    let updateTimer
    if (app.isPackaged || smokeTest) {
      void updateChecker.check()
      if (!smokeTest) {
        updateTimer = setInterval(() => void updateChecker.check(), 6 * 60 * 60_000)
        mainWindow.on('focus', () => void updateChecker.check())
      }
    }

    const openExternal = (target) => {
      try {
        const url = new URL(target)
        if (['http:', 'https:'].includes(url.protocol)) void shell.openExternal(url.href)
      } catch {
        // Ignore malformed external links.
      }
    }
    const guardNavigation = (event) => {
      if (!event.isMainFrame) return
      const target = event.url
      if (isAllowedNavigation(target, siteUrl)) return
      event.preventDefault()
      openExternal(target)
    }
    mainWindow.webContents.on('will-navigate', guardNavigation)
    mainWindow.webContents.on('will-redirect', guardNavigation)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedNavigation(url, siteUrl)) {
        void mainWindow.loadURL(url)
      } else {
        openExternal(url)
      }
      return { action: 'deny' }
    })

    // Only the main frame may resize the native caption controls. Navigation
    // outside the site (Discord sign-in) always uses the fallback title bar.
    ipcMain.on('desktop:titlebar-height', (event, height) => {
      if (!customTitleBar || !mainWindow || mainWindow.isDestroyed()
        || event.sender !== mainWindow.webContents
        || event.senderFrame !== mainWindow.webContents.mainFrame
        || !isAllowedNavigation(event.senderFrame.url, siteUrl)
        || !Number.isInteger(height) || height < 48 || height > 144) return
      // DOM measurements are CSS pixels; native caption controls use DIP.
      // Page zoom changes their ratio independently of Windows display scaling.
      const nativeHeight = Math.floor(height * event.sender.getZoomFactor())
      mainWindow.setTitleBarOverlay({ height: nativeHeight })
    })
    mainWindow.webContents.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => {
      if (customTitleBar && isMainFrame && !inPlace) mainWindow.setTitleBarOverlay({ height: 48 })
    })

    ipcMain.on('desktop:chat', (event, payload) => {
      if (!mainWindow || event.sender !== mainWindow.webContents
        || event.senderFrame !== mainWindow.webContents.mainFrame
        || !isSitePage(event.senderFrame.url, siteUrl)
        || mainWindow.isFocused() || !Notification.isSupported()) return

      const message = chatNotification(payload)
      if (!message) return
      const notification = new Notification({
        title: `${message.nickname} · B-SIDE`,
        body: message.content,
        icon: path.join(__dirname, 'assets', 'icon.png'),
      })
      notification.on('click', () => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
        const page = new URL(mainWindow.webContents.getURL())
        if (page.origin === siteUrl && page.pathname.toUpperCase() === `/ROOM/${message.roomCode}`) {
          mainWindow.webContents.send('desktop:open-chat', message.roomCode)
        }
      })
      notification.show()
    })

    mainWindow.on('closed', () => { clearInterval(updateTimer); mainWindow = null })
    if (smokeTest) {
      mainWindow.webContents.once('did-finish-load', async () => {
        try {
          const { runTitleBarSmoke } = require('./test/titleBarSmoke.cjs')
          const state = await runTitleBarSmoke(mainWindow, customTitleBar)
          process.stdout.write(`BSIDE_SMOKE:${JSON.stringify(state)}\n`)
          app.quit()
        } catch (error) {
          process.stderr.write(`BSIDE_SMOKE_ERROR:${error.stack}\n`)
          app.exit(1)
        }
      })
      mainWindow.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
        process.stderr.write(`BSIDE_SMOKE_ERROR:${errorCode}:${errorDescription}\n`)
        app.exit(1)
      })
    }
    void mainWindow.loadURL(siteUrl)
  })

  app.on('window-all-closed', () => app.quit())
}
