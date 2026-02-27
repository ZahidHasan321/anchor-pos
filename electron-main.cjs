
const { app, BrowserWindow, ipcMain, Menu, globalShortcut, dialog, powerSaveBlocker, session } = require('electron');
const { autoUpdater } = require('electron-updater');

// Custom User Agent to hide Electron and look like a standard browser
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
// Secret header to bypass Cloudflare WAF (Make sure to add this to your Cloudflare Custom Rules)
const APP_SECRET_HEADER = process.env.APP_SECRET_HEADER || 'auto-pos-secret-handshake-2026';

const path = require('path');
const fs = require('fs');
const portfinder = require('portfinder');
const dotenv = require('dotenv');
const { pathToFileURL } = require('url');
const log = require('electron-log');

// --- Power Management ---
let powerBlockerId = null;

function preventSleep() {
    if (powerBlockerId === null) {
        powerBlockerId = powerSaveBlocker.start('prevent-app-suspension');
        log.info('Power sleep prevention started');
    }
}

function allowSleep() {
    if (powerBlockerId !== null) {
        powerSaveBlocker.stop(powerBlockerId);
        powerBlockerId = null;
        log.info('Power sleep prevention stopped');
    }
}

// Configure logging
log.transports.file.level = 'info';
log.initialize({ preload: true });
console.log = log.log;
console.warn = log.warn;
console.error = log.error;

log.info('App starting...');

// --- Database Migrations ---
async function runMigrations() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        log.info('DATABASE_URL not set, skipping Postgres migrations (Native Client Mode)');
        return;
    }

    if (app.isPackaged && !process.env.RUN_MIGRATIONS) {
        log.info('App is packaged, skipping automatic migrations (use RUN_MIGRATIONS=true to force)');
        return;
    }

    try {
        const { migrate } = require('drizzle-orm/postgres-js/migrator');
        const { drizzle } = require('drizzle-orm/postgres-js');
        const postgres = require('postgres');

        log.info('Running database migrations...');
        const migrationClient = postgres(dbUrl, { max: 1 });
        const db = drizzle(migrationClient);

        // Path to migrations (packaged vs dev)
        const migrationsPath = app.isPackaged 
            ? path.join(process.resourcesPath, 'app.asar', 'drizzle')
            : path.join(__dirname, 'drizzle');

        if (fs.existsSync(migrationsPath)) {
            await migrate(db, { migrationsFolder: migrationsPath });
            log.info('Database migrations completed successfully');
        } else {
            log.warn('Migrations folder not found at:', migrationsPath);
        }
        await migrationClient.end();
    } catch (e) {
        log.error('Database migration failed:', e);
        // We don't necessarily want to crash the app if migration fails, 
        // as the server might still start if schema is compatible.
    }
}

// --- Robust .env Loading ---
const isDev = !app.isPackaged;
const exeDir = path.dirname(app.getPath('exe'));
const rootDir = __dirname;
const cwd = process.cwd();


// Try loading from different locations in order
const envPaths = [
    path.join(exeDir, '.env'),       // Next to exe (Windows standard)
    path.join(cwd, '.env'),          // Current working directory (Linux standard for portable)
    path.join(rootDir, '.env'),      // Source root (Development)
    path.join(app.getPath('userData'), '.env') // Data directory (User-specific config)
];

for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath, override: true });
        console.log('Loaded config from:', envPath);
    }
}

// Fallback defaults for packaged build — ensure app can always reach the VPS if .env is missing
if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://neondb_owner:npg_8NCI0VGbBXdi@ep-sparkling-cherry-a1v8fbmk-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
}
if (!process.env.POWERSYNC_URL) {
    process.env.POWERSYNC_URL = 'https://powersync.anchorshop.cloud';
}
if (!process.env.POWERSYNC_API_URL) {
    process.env.POWERSYNC_API_URL = 'https://anchorshop.cloud';
}
process.env.BUILD_TARGET = 'electron';

let mainWindow;
let splashWindow;

// --- Window State Persistence ---
const windowStatePath = path.join(app.getPath('userData'), 'window-state.json');

function saveWindowState() {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    try {
        fs.writeFileSync(windowStatePath, JSON.stringify(bounds));
    } catch (e) {
        console.error('Failed to save window state:', e);
    }
}

function loadWindowState() {
    try {
        if (fs.existsSync(windowStatePath)) {
            return JSON.parse(fs.readFileSync(windowStatePath, 'utf8'));
        }
    } catch (e) {
        console.error('Failed to load window state:', e);
    }
    return { width: 1280, height: 800 }; // Default
}

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
        ? path.join(process.resourcesPath, 'app.asar', 'resources', 'icon.png')
        : path.join(__dirname, 'resources', 'icon.png');

    const state = loadWindowState();

    mainWindow = new BrowserWindow({
        x: state.x,
        y: state.y,
        width: state.width,
        height: state.height,
        title: "Auto POS",
        show: false, // Don't show until ready
        backgroundColor: '#ffffff',
        icon: iconPath,
        userAgent: USER_AGENT,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Inject Secret Handshake Header into all outgoing requests to bypass Cloudflare challenges
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders['x-app-secret'] = APP_SECRET_HEADER;
        callback({ cancel: false, requestHeaders: details.requestHeaders });
    });

    // Save window state on change
    mainWindow.on('resize', saveWindowState);
    mainWindow.on('move', saveWindowState);

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
            process.env.ORIGIN = `http://127.0.0.1:${port}`;
            // Fix for SvelteKit adapter-node address binding
            process.env.HOST = '127.0.0.1'; 
            process.env.BUILD_TARGET = 'electron';
            
            console.log('Booting SvelteKit server on port:', port);
            console.log('Origin:', process.env.ORIGIN);
            
            // Register a shortcut to open DevTools even in production for debugging
            globalShortcut.register('CommandOrControl+Shift+I', () => {
                if (mainWindow) mainWindow.webContents.toggleDevTools();
            });

            // PowerSync config — must be set before SvelteKit server boots
            process.env.POWERSYNC_DATA_DIR = app.getPath('userData');
            process.env.POWERSYNC_URL = 'https://powersync.anchorshop.cloud';
            process.env.POWERSYNC_API_URL = 'https://anchorshop.cloud';

            await import(buildUrl); 
            
            // Function to wait for server to be ready (Polling)
            const waitForServer = async (targetUrl, maxRetries = 20) => {
                const http = require('http');
                for (let i = 0; i < maxRetries; i++) {
                    try {
                        await new Promise((resolve, reject) => {
                            const req = http.get(targetUrl, (res) => {
                                if (res.statusCode < 500) resolve();
                                else reject();
                            });
                            req.on('error', reject);
                            req.setTimeout(500);
                            req.end();
                        });
                        return true;
                    } catch (e) {
                        await new Promise(r => setTimeout(r, 250));
                    }
                }
                return false;
            };

            const appUrl = `http://127.0.0.1:${port}`;
            const serverReady = await waitForServer(appUrl);
            
            if (!serverReady) {
                console.warn('Server failed to respond in time, attempting load anyway.');
            }

            mainWindow.loadURL(appUrl).catch(e => {
                console.error('Failed to load URL:', e);
                dialog.showErrorBox('Navigation Error', `Failed to load app at ${appUrl}\nError: ${e.message}\n\nPlease ensure your database is running.`);
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
        allowSleep();
    });
}

// IPC listener for native printing
ipcMain.on('print-native', (event, html, preview = false) => {
    let printWindow = new BrowserWindow({
        show: false, // Always hidden, the print dialog is what matters
        webPreferences: {
            offscreen: true
        }
    });

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    printWindow.webContents.on('did-finish-load', () => {
        // Use silent: false to show the native system print dialog (with preview, Save as PDF, etc.)
        printWindow.webContents.print({
            silent: !preview, 
            printBackground: true,
            margins: {
                marginType: 'none'
            }
        }, (success, failureReason) => {
            if (!success && failureReason !== 'Cancelled') {
                console.error('Print failed:', failureReason);
            }
            printWindow.close();
        });
    });
});

// --- Single Instance Lock ---
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.on('ready', async () => {
        preventSleep();
        await runMigrations();
        
        // --- Auto-Updater Logic ---
        if (app.isPackaged) {
            autoUpdater.checkForUpdatesAndNotify();
            
            autoUpdater.on('update-downloaded', () => {
                dialog.showMessageBox({
                    type: 'info',
                    title: 'Update Ready',
                    message: 'A new version has been downloaded. Restart the app to apply the update.',
                    buttons: ['Restart', 'Later']
                }).then((result) => {
                    if (result.response === 0) autoUpdater.quitAndInstall();
                });
            });
        }

        createSplashWindow();
        createWindow();
    });
}

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
