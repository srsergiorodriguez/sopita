<!-- src/mainview/components/Knob.svelte -->
<script>
  // Svelte 5 $props() with $bindable():
  // By wrapping the default value in $bindable(), we explicitly tell Svelte that parent 
  // components (like our Toolbar or EffectsRack) are allowed to use 'bind:value={...}' 
  // to establish a two-way data connection. If we just set 'value = 0', the parent 
  // could pass a value in, but the Knob couldn't push updates back up.
  let {
    value = $bindable(0),
    min = 0,
    max = 100,
    size = 60,
    label = "Knob",
    step = 1,
  } = $props();

  // Local UI State:
  // These variables only track the mechanics of the drag interaction, 
  // so they don't need to be exposed to the parent or stored in our global appState.
  let isDragging = $state(false);
  let startY = $state(0);
  let startValue = $state(0);

  // Svelte 5 Derived State:
  // Automatically recalculates the SVG rotation angle whenever 'value', 'min', or 'max' change.
  // We map the normalized value (0.0 to 1.0) to a 270-degree arc, starting at -135 degrees (bottom left) 
  // and ending at +135 degrees (bottom right).
  let rotation = $derived(-135 + ((value - min) / (max - min)) * 270);

  function handlePointerDown(e) {
    e.preventDefault();
    isDragging = true;
    startY = e.clientY;
    startValue = value;

    // Pointer events natively support both mouse and touch inputs simultaneously.
    // We attach the move/up listeners to the global window so the user can drag 
    // wildly across their entire screen without breaking the interaction.
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function handlePointerMove(e) {
    if (!isDragging) return;

    // Screen coordinates start with 0 at the top and increase as you go down.
    // Moving the mouse UP decreases clientY, so we subtract to create an intuitive "up = increase" interaction.
    const deltaY = startY - e.clientY;

    // Drag Sensitivity: 
    // Dictates that exactly 100 pixels of physical screen movement covers the entire min-to-max range.
    const sensitivity = (max - min) / 100;

    let newValue = startValue + deltaY * sensitivity;

    // Constrain the math to prevent the knob from spinning past its minimum or maximum boundaries.
    newValue = Math.max(min, Math.min(max, newValue));

    // Quantization: Forces the smooth floating-point drag value to snap to the nearest defined step.
    value = Math.round(newValue / step) * step;
  }

  function handlePointerUp() {
    isDragging = false;
    // Clean up global listeners to prevent memory leaks and zombie events when not dragging
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  }
</script>

<div class="knob-container">
  <!-- 
    Accessibility (a11y) Attributes:
    role="slider" and the aria-* properties tell screen readers exactly what this custom SVG represents 
    and what its current limits are. tabindex="0" makes it focusable via the keyboard.
  -->
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    onpointerdown={handlePointerDown}
    style="cursor: {isDragging ? 'grabbing' : 'grab'}; touch-action: none;"
    role="slider"
    tabindex="0"
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-label={label}
  >
    <!-- Background Track -->
    <circle
      cx="50"
      cy="50"
      r="40"
      fill="var(--bg-main)"
      stroke="var(--bg-panel)"
      stroke-width="8"
    />

    <!-- 
      The rotating indicator group:
      transform="rotate(angle, originX, originY)" allows us to spin the entire group 
      around the exact center of the 100x100 viewBox (50, 50).
    -->
    <g transform="rotate({rotation}, 50, 50)">
      <!-- Dial base -->
      <circle
        cx="50"
        cy="50"
        r="32"
        fill="var(--bg-panel)"
        stroke="var(--text-muted)"
        stroke-width="2"
      />
      <!-- Accent line (The indicator mark pointing "up" at 0 degrees) -->
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="18"
        stroke="var(--accent)"
        stroke-width="4"
        stroke-linecap="round"
      />
    </g>
  </svg>
  <span class="label">{label}</span>
  <span class="value">{value}</span>
</div>

<style>
  .knob-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    user-select: none;
    gap: 6px;
  }
  .label {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    user-select: none;
  }
  .value {
    font-size: 0.85rem;
    color: var(--accent);
    font-family: var(--font-mono);
    /* 
      Tabular Nums:
      Crucial for rapidly updating numeric displays. It forces all numbers to be the exact same width 
      (like a monospace font), preventing the label from jittering left and right when changing from 
      a narrow "1" to a wide "8".
    */
    font-variant-numeric: tabular-nums;
  }

  svg:focus {
    /* Removes the default browser blue glow when navigating via keyboard */
    outline: none;
  }
</style>