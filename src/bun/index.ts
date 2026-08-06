import { BrowserWindow, BrowserView, Utils, Updater } from "electrobun/bun";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, parse } from "path";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

const isWindows = process.platform === "win32";

// --- IPC Bridge / RPC Definition ---
// In Electrobun, the frontend Webview and the backend Bun process are completely isolated.
// BrowserView.defineRPC establishes a strictly typed Inter-Process Communication (IPC) bridge,
// allowing the frontend Svelte app to securely trigger native OS operations (like file system access).
const backendRPC = BrowserView.defineRPC({
  handlers: {
    requests: {
      
      // Native OS File Dialog
      requestFilePicker: async (options) => {
        const opts = options || {};

        // Electrobun's Foreign Function Interface (FFI) binds directly to macOS/Windows native dialogs.
        // The underlying native APIs strictly expect file extensions formatted as a comma-separated string.
        let fileTypesString = "*";

        if (Array.isArray(opts.allowedFileTypes) && opts.allowedFileTypes.length > 0) {
          fileTypesString = opts.allowedFileTypes.join(",");
        } else if (typeof opts.allowedFileTypes === "string") {
          fileTypesString = opts.allowedFileTypes;
        }

        const chosenPaths = await Utils.openFileDialog({
          canChooseFiles: opts.canChooseFiles ?? true,
          canChooseDirectory: opts.canChooseDirectory ?? false,
          allowsMultipleSelection: opts.allowsMultipleSelection ?? false,
          allowedFileTypes: fileTypesString 
        });

        return chosenPaths;
      },

      // Security Bypass: File Reading
      // Modern Webviews (like WKWebView on macOS) strictly enforce CORS and sandbox policies, 
      // often blocking direct access to local 'file://' paths from inside the frontend.
      // We bypass this by reading the file natively in Bun, encoding it as Base64 text, 
      // and sending the text payload across the IPC bridge to Svelte.
      readAudioFile: (filepath) => {
        try {
          const fileBuffer = readFileSync(filepath);
          return fileBuffer.toString("base64");
        } catch (err) {
          console.error("Failed to read audio file:", err);
          return null;
        }
      },

      // Security Bypass: File Writing
      // Reverses the Base64 process: Svelte encodes the rendered WAV file as text, 
      // sends it to Bun via RPC, and Bun decodes it back to raw binary bytes before saving to disk.
      writeExportedFiles: ({ folderPath, files }) => {
        try {
          for (const file of files) {
            let fileName = file.name;
            let filePath = join(folderPath, fileName);
            let counter = 1;

            // If the file exists, increment a counter until we find a free name
            while (existsSync(filePath)) {
              const parsed = parse(file.name);
              // Reconstructs name: sopita_slice_01_1.wav
              fileName = `${parsed.name}_${counter}${parsed.ext}`;
              filePath = join(folderPath, fileName);
              counter++;
            }

            const buffer = Buffer.from(file.base64, 'base64');
            writeFileSync(filePath, buffer);
          }
          return { success: true };
        } catch (err) {
          console.error("Failed to write files:", err);
          return { success: false, error: err.message };
        }
      }
    },

    messages: {}
  }
});

// --- Environment Bootstrapper ---
// Determines whether the app is running in development or production.
async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  
  // If running in dev mode, we ping the Vite server. 
  // If Vite is active, we load localhost to enable Hot Module Replacement (HMR).
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log(
        "Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
      );
    }
  }
  
  // In production, Electrobun intercepts the custom 'views://' protocol 
  // to serve the statically compiled Svelte assets bundled inside the application binary.
  return "views://mainview/index.html";
}

// Top-level await is fully supported in Bun
const url = await getMainViewUrl();

// --- Window Instantiation ---
const mainWindow = new BrowserWindow({
  title: "Sopita",
  url,
  frame: {
    width: isWindows ? 916 : 900,
    height: isWindows ? 659 : 620,
    x: 200, // Initial X coordinate on the screen
    y: 200, // Initial Y coordinate on the screen
  },
  // Style masks directly map to native OS window properties (e.g., NSWindowStyleMask on macOS).
  styleMask: {
    Borderless: true,
    Titled: true,
    Closable: true,
    Miniaturizable: true,
    Resizable: false,
    UnifiedTitleAndToolbar: false,
    FullScreen: false,
    FullSizeContentView: false,
    UtilityWindow: false,
    DocModalWindow: false,
    NonactivatingPanel: false,
    HUDWindow: false,
  },
  rpc: backendRPC // Mounts our defined IPC bridge to this specific window
});

// --- THE WINDOWS WEBVIEW2 NATIVE NUDGE ---
// Forces the Windows Desktop Window Manager (DWM) to emit a native WM_SIZE event,
// waking up the WebView2 engine and fixing the initial DPI/Chrome crop bug.
if (process.platform === "win32") {
  setTimeout(() => {
    try {
      // Nudge the window down by 1 pixel natively
      mainWindow.setSize(980, 621);
      
      // Instantly snap it back to the original size
      setTimeout(() => {
        mainWindow.setSize(980, 620);
      }, 50);
    } catch (err) {
      // Fallback in case Electrobun changes its native API method names in future versions
      console.log("Native nudge failed:", err);
    }
  }, 250); // Wait 250ms to ensure the window has fully painted first
}

console.log("Sopita app started!");