import { Electroview } from "electrobun/view";

export let isDesktop = false;
let electroview = null;

try {
  // Electrobun utilizes a two-way Inter-Process Communication (IPC) bridge.
  // We define the frontend RPC (Remote Procedure Call) object here, which allows
  // the frontend Chromium engine to send requests to, and receive messages from, the backend Bun process.
  const frontendRPC = Electroview.defineRPC({
    maxRequestTime: 60000,
    handlers: {
      requests: {},
      messages: {}
    }
  });

  electroview = new Electroview({ rpc: frontendRPC });
  isDesktop = true;
} catch (error) {
  // If Electroview fails to initialize, it means the app is running in a standard web browser 
  // (like during early Vite development) rather than the compiled Electrobun desktop wrapper.
  console.log("Running in standard web browser environment.");
}

// Orchestrates reading an audio file from the user's hard drive into the application's memory.
export async function loadSample() {
  if (isDesktop && electroview) {
    // We cannot access the native OS file system directly from the frontend.
    // Instead, we ask the backend Bun process to open a native OS file picker dialog.
    const result = await electroview.rpc.request.requestFilePicker({
      canChooseFiles: true,
      canChooseDirectory: false,
      allowsMultipleSelection: false,
      allowedFileTypes: "*"
    });

    let selectedPath = null;
    if (typeof result === "string" && result !== "No file selected") {
      selectedPath = result;
    } else if (Array.isArray(result) && result.length > 0) {
      selectedPath = result[0];
    }

    if (!selectedPath) return null;

    // Once we have the file path, we ask the backend to read the file using Node's 'fs' module.
    // Because IPC bridges serialize data as JSON, we cannot easily pass raw binary data back.
    // The backend converts the binary file into a Base64 string before sending it to us.
    const base64Data = await electroview.rpc.request.readAudioFile(selectedPath);

    if (!base64Data) return null;

    // The Web Audio API and Wavesurfer.js cannot process Base64 strings directly; 
    // they strictly require an ArrayBuffer.
    // We decode the Base64 string back into binary, loop through every character, 
    // and write its raw byte value into a strongly-typed Uint8Array.
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // We extract the underlying ArrayBuffer from the typed array and return it to the DSP engine.
    return bytes.buffer;

  } else {
    // Standard web browser fallback utilizing the DOM File API.
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".wav,.mp3,.ogg,.aiff";

      input.onchange = async (e) => {
        const file = e.target?.files ? e.target.files[0] : null;
        if (file) {
          // Modern browsers can parse DOM File objects directly into ArrayBuffers.
          const arrayBuffer = await file.arrayBuffer();
          resolve(arrayBuffer);
        } else {
          resolve(null);
        }
      };

      input.click();
    });
  }
}

// Converts a Web Blob (Binary Large Object) into a Base64 string.
// We use a FileReader to read the Blob as a Data URL, and then split the resulting string
// to remove the MIME type header (e.g., "data:audio/wav;base64,"), leaving only the raw Base64 payload.
function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = reader.result.split(',')[1];
      resolve(b64);
    };
    reader.readAsDataURL(blob);
  });
}

// Orchestrates writing processed audio files back to the user's hard drive.
export async function saveSamples(files) {
  if (isDesktop && electroview) {
    // Request a native OS directory picker from the backend so the user can choose an export destination.
    const chosenPaths = await electroview.rpc.request.requestFilePicker({
      canChooseFiles: false,
      canChooseDirectory: true,
      allowsMultipleSelection: false
    });

    let targetDir = null;
    if (typeof chosenPaths === "string" && chosenPaths !== "No file selected") {
      targetDir = chosenPaths;
    } else if (Array.isArray(chosenPaths) && chosenPaths.length > 0) {
      targetDir = chosenPaths[0];
    }

    if (!targetDir) {
      return { success: false, message: "Export cancelled: No directory selected" };
    }

    try {
      // Just as we did when loading files, we must convert our frontend Blobs into Base64 strings
      // so they can be safely serialized into JSON and sent across the IPC bridge.
      const payloadFiles = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          base64: await blobToBase64(file.blob)
        }))
      );

      // We batch all the files into a single IPC call to reduce overhead, 
      // instructing the backend to write them sequentially using the native 'fs' module.
      const result = await electroview.rpc.request.writeExportedFiles({
        folderPath: targetDir,
        files: payloadFiles
      });

      if (result.success) {
        return { success: true, message: `Successfully exported to ${targetDir}` };
      } else {
        return { success: false, message: `Export failed: ${result.error}` };
      }
    } catch (error) {
      return { success: false, message: `IPC Error: ${error.message}` };
    }

  } else {
    // Browser fallback: Create temporary object URLs mapped to the Blobs in memory,
    // generate an invisible anchor <a> tag, and programmatically click it to trigger a download.
    try {
      files.forEach(file => {
        const url = URL.createObjectURL(file.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Revoke the URL immediately after to prevent memory leaks in the browser.
        URL.revokeObjectURL(url);
      });
      return { success: true, message: "Exported via browser download" };
    } catch (error) {
      return { success: false, message: `Browser export failed: ${error.message}` };
    }
  }
}