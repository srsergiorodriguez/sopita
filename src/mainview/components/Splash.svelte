<script>
  import { onMount, onDestroy } from 'svelte';
  import { appState } from '../store.svelte.js';

  // Svelte 5 replaces the traditional 'export let' with the $props() rune.
  // This explicitly defines the inputs this component expects from its parent.
  let { onLoad } = $props();
  let container;
  let canvas;
  let animFrame;
  let shapes = [];
  let width = 0;
  let height = 0;
  let shapeColor = '#000';

  // Theme Synchronization:
  // This $effect reads appState.theme implicitly. Whenever the theme toggles,
  // it re-evaluates the CSS variables applied to the root document and updates
  // the canvas drawing color dynamically, allowing the 2D rendering context 
  // to instantly react to global state changes.
  $effect(() => {
    const currentTheme = appState.theme;
    const rootStyles = getComputedStyle(document.documentElement);
    shapeColor = rootStyles.getPropertyValue('--accent').trim();
  });

  // Procedural Generation Algorithm:
  // Distributes shapes across evenly spaced vertical lanes to prevent visual clumping.
  function createShape(isInitialLoad = false, laneIndex = 0, totalLanes = 12) {
    const minSize = width / 14;
    const maxSize = width / 10;
    const size = Math.random() * (maxSize - minSize) + minSize;
    
    // Calculate the horizontal center of the current lane
    const laneWidth = width / totalLanes;
    const x = (laneIndex * laneWidth) + (laneWidth / 2);
    
    let y;
    if (isInitialLoad) {
      // On first load, spawn shapes along a mathematical sine wave pattern 
      // spanning the width of the screen, mixed with organic random jitter.
      const sineWave = Math.sin((laneIndex / totalLanes) * Math.PI * 2); 
      const amplitude = height / 3;
      const jitter = (Math.random() - 0.5); 
      
      y = (sineWave * amplitude) + jitter;
    } else {
      // Once a shape falls off the bottom edge, respawn it completely out of view at the top.
      y = -size * 1.5;
    }
    
    return {
      lane: laneIndex,
      totalLanes: totalLanes,
      x: x,
      y: y,
      size: size,
      type: Math.floor(Math.random() * 3), 
      speed: (Math.random() * 2) + 4,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.015
    };
  }

  function initShapes() {
    shapes = [];
    const totalShapes = 12;
    for (let i = 0; i < totalShapes; i++) {
      shapes.push(createShape(true, i, totalShapes));
    }
  }

  // The core animation loop. 
  // Clears the canvas entirely every frame and redraws all shapes at their newly calculated positions.
  function drawShapes(ctx) {
    ctx.clearRect(0, 0, width, height); 

    ctx.strokeStyle = shapeColor;
    ctx.lineWidth = 2; 

    shapes.forEach(shape => {
      shape.y += shape.speed;
      shape.rotation += shape.rotSpeed;

      // Boundary detection: recycle shape objects to maintain memory performance 
      // instead of instantiating new objects for the garbage collector to clean up.
      if (shape.y - shape.size > height) {
        Object.assign(shape, createShape(false, shape.lane, shape.totalLanes));
      }

      // HTML5 Canvas Transformations:
      // To rotate a shape around its own exact center, we must temporarily translate the entire canvas grid
      // to the shape's coordinates, rotate the grid itself, draw the path at (0,0), and then restore the grid.
      ctx.save();
      ctx.translate(shape.x, shape.y);
      ctx.rotate(shape.rotation);
      ctx.beginPath();

      if (shape.type === 0) {
        ctx.arc(0, 0, shape.size / 2, 0, Math.PI * 2);
      } else if (shape.type === 1) {
        ctx.rect(-shape.size / 2, -shape.size / 2, shape.size, shape.size);
      } else if (shape.type === 2) {
        ctx.moveTo(0, -shape.size / 2);
        ctx.lineTo(shape.size / 2, shape.size / 2);
        ctx.lineTo(-shape.size / 2, shape.size / 2);
        ctx.closePath();
      }

      ctx.stroke();
      ctx.restore();
    });

    // Request the browser to schedule the next frame perfectly synchronized with the display's refresh rate.
    animFrame = requestAnimationFrame(() => drawShapes(ctx));
  }

  onMount(() => {
    const ctx = canvas.getContext('2d', { alpha: true });

    // Responsive High-DPI Canvas Scaling:
    // A standard 100% width/height CSS canvas will look unpleasantly blurry on Retina/High-DPI displays.
    // We use a ResizeObserver to explicitly multiply the internal coordinate system 
    // by the device's pixel ratio, keeping the vector strokes perfectly crisp.
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        width = entry.contentRect.width;
        height = entry.contentRect.height;
        
        canvas.width = width * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        
        if (shapes.length === 0) initShapes();
      }
    });

    resizeObserver.observe(container);
    animFrame = requestAnimationFrame(() => drawShapes(ctx));

    // The cleanup function returned from onMount.
    // Svelte guarantees this runs when the component is destroyed (e.g., when an audio file loads), 
    // preventing zombie background animation loops and memory leaks.
    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animFrame);
    };
  });
</script>

<div class="splash-container" bind:this={container}>
  <canvas bind:this={canvas} class="generative-canvas"></canvas>
  
  <div class="overlay">
    <button class="btn btn-primary btn-lg" onclick={onLoad}>Load Audio File</button>
  </div>
</div>

<style>
  .splash-container {
    flex-grow: 1;
    position: relative;
    border-radius: var(--radius-md);
    overflow: hidden;
    border: var(--border-strong);
    background: var(--bg-panel);
  }

  .generative-canvas {
    position: absolute; 
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none; 
  }

  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>