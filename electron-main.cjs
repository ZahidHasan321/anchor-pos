
const { app, BrowserWindow, ipcMain, Menu, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const portfinder = require('portfinder');
const dotenv = require('dotenv');
const { pathToFileURL } = require('url');

// --- Robust .env Loading ---
const isDev = !app.isPackaged;
const exeDir = path.dirname(app.getPath('exe'));
const rootDir = __dirname;


// Try loading from executable directory first (Production)
const envExePath = path.join(exeDir, '.env');
// Try loading from source root (Development / Unpacked test)
const envRootPath = path.join(rootDir, '.env');

if (fs.existsSync(envExePath)) {
    dotenv.config({ path: envExePath });
} else if (fs.existsSync(envRootPath)) {
    dotenv.config({ path: envRootPath });
} else {
    dotenv.config(); // Fallback to current working directory
}

let mainWindow;
let splashWindow;

async function createSplashWindow() {
    splashWindow = new BrowserWindow({
        width: 400,
        height: 300,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        center: true,
        webPreferences: {
            nodeIntegration: false
        }
    });
    
    // Use path.join with __dirname for reliable local file loading
    const splashPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'app.asar', 'static', 'splash.html')
        : path.join(__dirname, 'static', 'splash.html');

    splashWindow.loadFile(splashPath);
}

async function createWindow() {
    // Hide the default menu bar globally
    Menu.setApplicationMenu(null);

    const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar', 'static', 'favicon.png')
        : path.join(__dirname, 'static', 'favicon.png');

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "Anchor POS",
        show: false, // Don't show until ready
        backgroundColor: '#ffffff',
        icon: iconPath,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Ensure menu is hidden on Windows/Linux
    mainWindow.setMenuBarVisibility(false);
    mainWindow.removeMenu();

    // Find a free port
    const port = await portfinder.getPortPromise();

    // Check if we are in development mode
    const isDev = !app.isPackaged;

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
        mainWindow.once('ready-to-show', () => {
            // Short delay to ensure SvelteKit has rendered the first frame
            setTimeout(() => {
                mainWindow.show();
                if (splashWindow) splashWindow.close();
            }, 500);
        });
    } else {
        try {
            // Re-load dotenv to ensure process.env is fully populated before import
            const dotenv = require('dotenv');
            dotenv.config();
            
            // Try loading from executable directory first (Production)
            // On Windows, the .env file is often placed next to the executable
            const envExePath = path.join(path.dirname(app.getPath('exe')), '.env');
            if (fs.existsSync(envExePath)) {
                dotenv.config({ path: envExePath, override: true });
            }

            let buildPath = path.join(__dirname, 'build', 'index.js');
            // If packed, check for unpacked build files to avoid ASAR issues with native modules/ESM
            if (app.isPackaged) {
                const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'build', 'index.js');
                if (fs.existsSync(unpackedPath)) {
                    console.log('Using unpacked build at:', unpackedPath);
                    buildPath = unpackedPath;
                }
            }

            const buildUrl = pathToFileURL(buildPath).href;
            
            // Explicitly set important environment variables for the server
            process.env.PORT = port;
            process.env.NODE_ENV = 'production';
            process.env.ORIGIN = `http://localhost:${port}`;
            // Fix for SvelteKit adapter-node address binding
            process.env.HOST = '127.0.0.1'; 
            
            // Register a shortcut to open DevTools even in production for debugging
            globalShortcut.register('CommandOrControl+Shift+I', () => {
                if (mainWindow) mainWindow.webContents.toggleDevTools();
            });

            await import(buildUrl); 
            
            mainWindow.loadURL(`http://localhost:${port}`).catch(e => {
                console.error('Failed to load URL:', e);
                dialog.showErrorBox('Navigation Error', `Failed to load app at http://localhost:${port}\nError: ${e.message}`);
            });
            
            // Failsafe: Show window after 5 seconds if ready-to-show doesn't fire
            const showTimeout = setTimeout(() => {
                if (mainWindow && !mainWindow.isVisible()) {
                    console.warn('Force showing window after timeout');
                    mainWindow.show();
                    if (splashWindow) splashWindow.close();
                }
            }, 5000);

            mainWindow.once('ready-to-show', () => {
                clearTimeout(showTimeout);
                // Give the server a moment to finish its first SSR render
                setTimeout(() => {
                    mainWindow.show();
                    if (splashWindow) splashWindow.close();
                }, 500);
            });
            
            // Allow opening DevTools in production with F12
            mainWindow.webContents.on('before-input-event', (event, input) => {
                if (input.key === 'F12' && input.type === 'keyDown') {
                    mainWindow.webContents.toggleDevTools();
                }
            });

        } catch (err) {
            console.error('Failed to start server:', err);
            dialog.showErrorBox('Server Start Failed', `The application server failed to start.\n\nError: ${err.message}\n\nPlease check your .env file and database connection.`);
            // Show the main window anyway so the user can see if something loaded
            mainWindow.show();
            if (splashWindow) splashWindow.close();
        }
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC listener for native printing
ipcMain.on('print-native', (event, html) => {
    let printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            offscreen: true
        }
    });

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    printWindow.webContents.on('did-finish-load', () => {
        // Use silent: true for true POS behavior (no dialog)
        printWindow.webContents.print({
            silent: false, // Set to true for auto-printing without dialog
            printBackground: true,
            margins: {
                marginType: 'none'
            },
            pageSize: {
                width: 72000, // 72mm in microns
                height: 200000 
            }
        }, (success, failureReason) => {
            if (!success) console.error('Print failed:', failureReason);
            printWindow.close();
        });
    });
});

app.on('ready', () => {
    createSplashWindow();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
