export function detectTransients(audioBuffer, sensitivity = 50) {
  if (!audioBuffer) return [];

  // We only analyze the left channel (0) to save CPU. 
  // For most rhythmic samples, transients occur simultaneously in both channels.
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // We divide the audio into chunks (windows) to measure average energy over time.
  // A 10ms window is a good balance between catching fast transients and ignoring low-frequency rumble.
  const windowSize = Math.floor(sampleRate / 100);

  // --- Macro Heuristics ---
  // 1. Cooldown (Debouncing): Prevents a single long drum hit from triggering multiple slices.
  // Higher sensitivity decreases the cooldown, allowing for faster rolls/flams to be detected.
  const minCooldownSecs = 0.2 - (sensitivity / 100) * 0.18;
  const cooldownSamples = minCooldownSecs * sampleRate;

  // 2. Relative Energy Delta: We look for sudden spikes in volume, not just loud parts.
  // This multiplier determines how much louder a window must be compared to the previous one.
  const deltaMultiplier = 3.0 - (sensitivity / 100) * 1.8;
  const noiseFloor = 0.01; // Prevents the algorithm from reacting to absolute silence or digital dither.

  const transients = [];
  let lastTransientIndex = -cooldownSamples;
  let previousEnergy = 0;

  // Iterate through the audio array in 10ms jumps
  for (let i = 0; i < channelData.length; i += windowSize) {
    let currentEnergy = 0;

    // Calculate the Mean Absolute Value (MAV) of the current window.
    // This is computationally cheaper than Root Mean Square (RMS) but works well for peak detection.
    for (let j = 0; j < windowSize; j++) {
      if (i + j < channelData.length) {
        currentEnergy += Math.abs(channelData[i + j]);
      }
    }
    currentEnergy /= windowSize;

    // Condition 1: Is the audio audible?
    // Condition 2: Did the energy spike violently enough compared to the last window?
    if (currentEnergy > noiseFloor && currentEnergy > (previousEnergy * deltaMultiplier)) {

      // Condition 3: Has enough time passed since the last detected hit?
      if ((i - lastTransientIndex) >= cooldownSamples) {

        // --- Zero-Crossing Snap ---
        // If we cut an audio wave while it is above or below the center line (0),
        // the speaker cone snaps instantly to the new position, causing an audible "pop" or "click".
        // To prevent this, we scan slightly backwards to find the nearest point where the wave crosses 0.
        let snapIndex = i;
        let smallestVal = Math.abs(channelData[i]);

        // Scan backwards up to 5 milliseconds
        const scanRange = Math.floor(sampleRate * 0.005);
        const startScan = Math.max(0, i - scanRange);

        for (let s = i; s >= startScan; s--) {
          const val = Math.abs(channelData[s]);
          if (val < smallestVal) {
            smallestVal = val;
            snapIndex = s;
          }
          // If we hit exactly 0, we can stop scanning immediately.
          if (val === 0) break;
        }

        // Store the detected time in seconds, not samples, for easier use in the UI and playback engine.
        transients.push(snapIndex / sampleRate);
        lastTransientIndex = snapIndex;
      }
    }
    // Save this window's energy to compare against the next one.
    previousEnergy = currentEnergy;
  }

  // Hardware samplers traditionally cap slices (e.g., 16, 32, or 64 pads).
  // We limit to 64 to keep the UI manageable and avoid performance hits.
  return transients.slice(0, 64);
}