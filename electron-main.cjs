
const { app, BrowserWindow, ipcMain, Menu, globalShortcut, dialog, powerSaveBlocker, session } = require('electron');
const { autoUpdater } = require('electron-updater');

// Disable hardware acceleration to prevent GPU crashes on Linux VMs/Wayland
app.disableHardwareAcceleration();

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
const { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } = require('node-thermal-printer');

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

// Catch uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error);
    try {
        dialog.showErrorBox('Critical Startup Error', `An uncaught exception occurred:\n\n${error.message}\n\nStack:\n${error.stack}`);
    } catch (e) {
        // Fallback if dialog is not ready
        console.error('FATAL:', error);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Rejection at:', promise, 'reason:', reason);
    try {
        dialog.showErrorBox('Critical Promise Rejection', `An unhandled promise rejection occurred:\n\nReason: ${reason}`);
    } catch (e) {
        console.error('FATAL REJECTION:', reason);
    }
});

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
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
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
        log.info('Loaded .env config from:', envPath);
    } else {
        log.info('Checked for .env at (not found):', envPath);
    }
}

// Fallback defaults for packaged build — ensure app can always reach the VPS if .env is missing
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
    const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

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
            
            console.log('--- STARTING SVELTEKIT SERVER BOOT ---');
            process.env.PORT = port;
            process.env.NODE_ENV = 'production';
            process.env.ORIGIN = `http://127.0.0.1:${port}`;
            process.env.HOST = '127.0.0.1'; 
            process.env.BUILD_TARGET = 'electron';
            process.env.APP_SECRET_HEADER = APP_SECRET_HEADER;
            
            console.log(`[Boot] Port: ${port}`);
            console.log(`[Boot] Origin: ${process.env.ORIGIN}`);
            
            // PowerSync Web SDK uses OPFS in the renderer - no data dir needed

            log.info('[Boot] Importing SvelteKit server from:', buildPath);
            
            const importStart = Date.now();
            await import(buildUrl); 
            console.log(`[Boot] SvelteKit server imported successfully in ${Date.now() - importStart}ms`);
            
            // Function to wait for server to be ready (Polling)
            const waitForServer = async (targetUrl, maxRetries = 20) => {
                const http = require('http');
                console.log(`[Boot] Polling for server readiness at ${targetUrl}...`);
                for (let i = 0; i < maxRetries; i++) {
                    try {
                        await new Promise((resolve, reject) => {
                            const req = http.get(targetUrl, (res) => {
                                console.log(`[Boot] Poll attempt ${i+1}: Received status ${res.statusCode}`);
                                if (res.statusCode < 500) resolve();
                                else reject();
                            });
                            req.on('error', (e) => {
                                // console.log(`[Boot] Poll attempt ${i+1} error: ${e.message}`);
                                reject(e);
                            });
                            req.setTimeout(500);
                            req.end();
                        });
                        return true;
                    } catch (e) {
                        await new Promise(r => setTimeout(r, 500));
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
                
                // Shortcut to open the log file folder (Ctrl+Shift+L)
                if (input.control && input.shift && input.key.toLowerCase() === 'l' && input.type === 'keyDown') {
                    const { shell } = require('electron');
                    const logPath = path.dirname(log.transports.file.getFile().path);
                    shell.openPath(logPath).catch(err => console.error('Failed to open log folder:', err));
                }
            });

            // --- Content Security & Permissions Fixes ---
            session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
                const headers = details.responseHeaders || {};
                // Relax CSP for VPS communication and PowerSync WebSockets
                headers['content-security-policy'] = [
                    "default-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' http://127.0.0.1:* http://localhost:* https://anchorshop.cloud https://*.anchorshop.cloud ws://* wss://*; " +
                    "connect-src 'self' http://127.0.0.1:* http://localhost:* https://anchorshop.cloud https://*.anchorshop.cloud ws://* wss://*; " +
                    "img-src 'self' data: blob: https:; " +
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' http://127.0.0.1:* http://localhost:*; " +
                    "frame-src 'self'; " +
                    "worker-src 'self' blob:;"
                ];
                callback({ responseHeaders: headers });
            });

            // Set global permission handler
            session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
                callback(true); // Approve all for internal tool
            });

        } catch (err) {
            console.error('Failed to start server:', err);
            
            // Build a detailed diagnostic message
            const diagnosticInfo = [
                `Error: ${err.message}`,
                `Stack: ${err.stack}`,
                '',
                'Environment:',
                `NODE_ENV: ${process.env.NODE_ENV}`,
                `DATABASE_URL: ${process.env.DATABASE_URL ? 'PRESENT' : 'MISSING'}`,
                `POWERSYNC_URL: ${process.env.POWERSYNC_URL}`,
                `userData: ${app.getPath('userData')}`,
                `resourcesPath: ${process.resourcesPath}`,
                `cwd: ${process.cwd()}`,
                '',
                'Common Issues:',
                '1. Check if PostgreSQL is running if DATABASE_URL is set.',
                '2. Ensure .env is present in the install directory (next to the .exe).',
                '3. Press Ctrl+Shift+L to open the log folder for full details.'
            ].join('\n');

            dialog.showErrorBox('Server Start Failed', diagnosticInfo);
            
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

// Helper: resolve character set from config key
function resolveCharacterSet(key) {
    const map = {
        'PC437_USA': CharacterSet.PC437_USA,
        'PC850_MULTILINGUAL': CharacterSet.PC850_MULTILINGUAL,
        'PC852_LATIN2': CharacterSet.PC852_LATIN2,
        'PC858_EURO': CharacterSet.PC858_EURO,
        'WPC1252': CharacterSet.WPC1252,
    };
    return map[key] || CharacterSet.PC437_USA;
}

// Helper: create a ThermalPrinter instance from config
function createThermalPrinter(config) {
    const width = config.paperWidth === '58' ? 32 : 48; // 58mm = 32 chars, 80mm = 48 chars
    return new ThermalPrinter({
        type: config.type === 'star' ? PrinterTypes.STAR : PrinterTypes.EPSON,
        interface: config.interface,
        characterSet: resolveCharacterSet(config.characterSet),
        removeSpecialCharacters: false,
        breakLine: BreakLine.WORD,
        width: width,
        options: {
            timeout: 5000
        }
    });
}

// IPC handler: test thermal printer connection
ipcMain.handle('test-thermal-print', async (event, config) => {
    try {
        const printer = createThermalPrinter(config);

        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) {
            return { success: false, error: 'Printer is not connected or reachable at ' + config.interface };
        }

        printer.alignCenter();
        printer.bold(true);
        printer.println('=== THERMAL TEST ===');
        printer.bold(false);
        printer.setTextNormal();
        printer.println('Connection: OK');
        printer.println('Interface: ' + config.interface);
        printer.println('Paper: ' + (config.paperWidth === '58' ? '58mm' : '80mm'));
        printer.println('Type: ' + (config.type === 'star' ? 'Star' : 'ESC/POS'));
        printer.drawLine();
        printer.println('ABCDabcd1234!@#$');
        printer.println('Thermal test passed.');
        printer.drawLine();
        printer.cut();

        await printer.execute();
        return { success: true };
    } catch (e) {
        log.error('Thermal test print failed:', e);
        return { success: false, error: e.message };
    }
});

// IPC handler: print raw thermal receipt via node-thermal-printer
ipcMain.handle('print-thermal-receipt', async (event, data, config) => {
    try {
        const printer = createThermalPrinter(config);

        const isConnected = await printer.isPrinterConnected();
        if (!isConnected) {
            return { success: false, error: 'Printer is not connected or reachable at ' + config.interface };
        }

        const s = data.storeSettings || {};
        const storeName = s.store_name || 'STORE NAME';

        printer.alignCenter();
        printer.setTextSize(1, 1);
        printer.bold(true);
        printer.println(storeName.toUpperCase());
        printer.setTextNormal();
        printer.bold(false);

        if (s.store_address) printer.println(s.store_address);
        if (s.store_phone) printer.println('Phone: ' + s.store_phone);
        if (s.store_email) printer.println(s.store_email);
        if (s.store_website) printer.println(s.store_website);
        if (s.store_tax_id) printer.println('VAT: ' + s.store_tax_id);
        if (s.store_bin) printer.println('BIN: ' + s.store_bin);

        printer.drawLine();
        printer.alignLeft();
        printer.println('Order: ' + data.orderId + (data.isReprint ? ' (REPRINT)' : ''));
        printer.println('Date: ' + data.date);
        printer.println('Cashier: ' + data.cashier);

        printer.drawLine();

        // Items Table
        printer.tableCustom([
            { text: "Item", align: "LEFT", width: 0.5 },
            { text: "Qty", align: "CENTER", width: 0.15 },
            { text: "Price", align: "RIGHT", width: 0.35 }
        ]);

        for (const item of data.items) {
            printer.tableCustom([
                { text: item.name, align: "LEFT", width: 0.5 },
                { text: item.qty.toString(), align: "CENTER", width: 0.15 },
                { text: item.total.toFixed(2), align: "RIGHT", width: 0.35 }
            ]);
            if (item.variant) {
                printer.println('  Size: ' + item.variant);
            }
        }

        printer.drawLine();

        printer.tableCustom([
            { text: "TOTAL", align: "LEFT", width: 0.5, bold: true },
            { text: data.total.toFixed(2), align: "RIGHT", width: 0.5, bold: true }
        ]);

        if (data.cashReceived) {
            printer.tableCustom([
                { text: "Cash Received", align: "LEFT", width: 0.5 },
                { text: data.cashReceived.toFixed(2), align: "RIGHT", width: 0.5 }
            ]);
            printer.tableCustom([
                { text: "Change", align: "LEFT", width: 0.5 },
                { text: data.changeGiven.toFixed(2), align: "RIGHT", width: 0.5 }
            ]);
        }

        if (s.store_facebook || s.store_instagram) {
            printer.println('');
            printer.alignCenter();
            if (s.store_facebook) printer.println('FB: ' + s.store_facebook);
            if (s.store_instagram) printer.println('IG: ' + s.store_instagram);
        }

        if (s.return_policy || s.exchange_policy || s.terms_conditions) {
            printer.drawLine();
            printer.alignLeft();
            if (s.return_policy) printer.println('Return: ' + s.return_policy);
            if (s.exchange_policy) printer.println('Exchange: ' + s.exchange_policy);
            if (s.terms_conditions) printer.println('T&C: ' + s.terms_conditions);
        }

        printer.println('');
        printer.alignCenter();
        if (s.receipt_footer) {
            printer.println(s.receipt_footer);
        } else {
            printer.println('Thank you!');
        }
        printer.println('*** End of Receipt ***');

        printer.cut();

        // Open Cash Drawer if configured
        if (config.openCashDrawer) {
            printer.openCashDrawer();
        }

        await printer.execute();
        return { success: true };
    } catch (e) {
        log.error('Thermal print failed:', e);
        return { success: false, error: e.message };
    }
});

// IPC handler: list available printers
ipcMain.handle('get-printers', async () => {
    if (!mainWindow) return [];
    try {
        return await mainWindow.webContents.getPrintersAsync();
    } catch (e) {
        log.error('Failed to get printers:', e);
        return [];
    }
});

// IPC handler: print to a specific device (returns success/error)
ipcMain.handle('print-to-device', async (event, html, deviceName, silent = true) => {
    return new Promise((resolve) => {
        let printWindow = new BrowserWindow({
            show: false,
            webPreferences: { offscreen: true }
        });

        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

        printWindow.webContents.on('did-finish-load', () => {
            const printOptions = {
                silent,
                printBackground: true,
                margins: { marginType: 'none' }
            };
            if (deviceName) {
                printOptions.deviceName = deviceName;
            }

            printWindow.webContents.print(printOptions, (success, failureReason) => {
                printWindow.close();
                if (!success) {
                    const reason = failureReason || 'Unknown error';
                    if (reason !== 'Cancelled') {
                        log.error('Print failed:', reason);
                    }
                    resolve({ success: false, error: reason });
                } else {
                    resolve({ success: true });
                }
            });
        });
    });
});

// IPC listener for native printing (legacy — kept for backward compatibility)
ipcMain.on('print-native', (event, html, preview = false) => {
    let printWindow = new BrowserWindow({
        show: false,
        webPreferences: { offscreen: true }
    });

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    printWindow.webContents.on('did-finish-load', () => {
        printWindow.webContents.print({
            silent: !preview,
            printBackground: true,
            margins: { marginType: 'none' }
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
