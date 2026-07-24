// src/mainview/wavEncoder.js
export function encodeWAV(audioBuffer, bitDepth = 16) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  
  // Format 1 represents raw uncompressed integer PCM audio.
  // Format 3 represents IEEE Floating Point audio.
  // If the bit depth is 32, we MUST flag the header as format 3, otherwise 
  // audio players will misinterpret the floats as integers and output harsh static noise.
  const format = bitDepth === 32 ? 3 : 1; 
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  // The Web Audio API stores stereo audio in separate planar arrays (e.g., all Left, then all Right).
  // WAV files require interleaved data, where the samples alternate sequentially (Left, Right, Left, Right).
  const interleaved = interleave(audioBuffer);
  const dataLength = interleaved.length * bytesPerSample;
  
  // A standard WAV file consists of a 44-byte metadata header followed immediately by the raw audio chunk.
  // We use a DataView because it allows us to precisely write binary bytes (Uint8, Uint16, Float32) 
  // at specific memory offsets, which is required for assembling strict file formats.
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // --- WRITE THE RIFF HEADER ---
  
  // "RIFF" chunk descriptor defines the overall file format container structure
  writeString(view, 0, 'RIFF');
  // Total file size minus 8 bytes (for the 'RIFF' string and this size integer itself)
  view.setUint32(4, 36 + dataLength, true); 
  writeString(view, 8, 'WAVE');
  
  // "fmt " sub-chunk describes the specific audio format (sample rate, channels, bit depth)
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 bytes for standard PCM/Float)
  view.setUint16(20, format, true); // AudioFormat dynamically set to 1 or 3
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  
  // "data" sub-chunk marks the exact point where the header ends and the audio waveform data begins
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // --- WRITE THE AUDIO DATA ---
  
  let offset = 44;
  if (bitDepth === 16) {
    // 16-bit quantization: Web Audio API handles signals as 32-bit floats (-1.0 to 1.0).
    // We must scale this mathematical range into discrete 16-bit signed integers (-32768 to 32767).
    for (let i = 0; i < interleaved.length; i++, offset += 2) {
      // Clamp the signal prior to conversion. 
      // If a float exceeds 1.0, it causes integer overflow, creating brutal digital wrap-around distortion.
      let s = Math.max(-1, Math.min(1, interleaved[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  } else if (bitDepth === 8) {
    // 8-bit WAV files uniquely require unsigned integers (0 to 255) rather than signed integers.
    // We shift the wave up by adding 1, moving the silence center-point from 0 to 128.
    for (let i = 0; i < interleaved.length; i++, offset += 1) {
      let s = Math.max(-1, Math.min(1, interleaved[i]));
      let val = Math.round((s + 1) * 127.5); 
      view.setUint8(offset, val);
    }
  } else {
    // 32-bit Float fallback: writes the raw Web Audio API floats directly to the file without scaling.
    for (let i = 0; i < interleaved.length; i++, offset += 4) {
      view.setFloat32(offset, interleaved[i], true);
    }
  }

  // Wrap the finalized binary array in a Blob so it can be passed across the IPC bridge or downloaded
  return new Blob([view], { type: 'audio/wav' });
}

// Helper: Restructures the Web Audio API's planar channel arrays into a single interleaved array.
function interleave(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const result = new Float32Array(length * numChannels);

  // If mono, no interleaving is required; just pass the single channel through.
  if (numChannels === 1) {
    result.set(audioBuffer.getChannelData(0));
    return result;
  }

  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.getChannelData(1);

  // Weave the stereo samples together: L0, R0, L1, R1, L2, R2...
  for (let i = 0; i < length; i++) {
    result[i * 2] = left[i];
    result[i * 2 + 1] = right[i];
  }
  return result;
}

// Helper: Writes raw ASCII characters directly into the binary DataView buffer.
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}