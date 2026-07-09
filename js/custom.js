/* ================================================================
   CONFIGURATION
   ================================================================ */
const soundEnabled = true; // set to false to disable celebration sound completely

// Pool of sample scratch codes
const CODE_POOL = ["SAVE25X9","WIN4582","OFF50NOW","SUPER100","DEAL20X"];

/* Celebration sound is generated on the fly with the Web Audio API below —
   this avoids embedding a large base64 blob while keeping the page fully
   offline-capable (no network request is made to play it). */
function playCelebrationSound(){
  if(!soundEnabled) return;
  try{
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // A tiny ascending arpeggio "ta-da" style chime
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i)=>{
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.28, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  }catch(e){ /* audio not available — fail silently */ }
}

/* ================================================================
   STATE
   ================================================================ */
let isRevealed = false;
let scratchDone = false;

/* ================================================================
   UTILITIES
   ================================================================ */
function randomCode(){
  return CODE_POOL[Math.floor(Math.random() * CODE_POOL.length)];
}

function randomBetween(min, max){
  return Math.random() * (max - min) + min;
}

function randomColor(){
  const palette = ["#f5c451","#ff5da2","#6d28d9","#4fd1e8","#ffffff","#ff9f43","#7bed9f"];
  return palette[Math.floor(Math.random() * palette.length)];
}

/* ================================================================
   SCRATCH CARD SETUP (HTML5 Canvas)
   ================================================================ */
const canvas = document.getElementById("scratchCanvas");
const ctx = canvas.getContext("2d");
const cardWrap = document.getElementById("cardWrap");
const scratchHint = document.getElementById("scratchHint");

let isDrawing = false;
let lastX = 0, lastY = 0;

function sizeCanvas(){
  const rect = cardWrap.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  drawScratchSurface();
}

// Paint the metallic silver scratch-off surface
function drawScratchSurface(){
  const w = canvas.width, h = canvas.height;

  // Base metallic gradient
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#e8e8ec");
  grad.addColorStop(0.25, "#c9ccd4");
  grad.addColorStop(0.5, "#f4f5f8");
  grad.addColorStop(0.75, "#b7bac4");
  grad.addColorStop(1, "#dfe1e6");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Diagonal shimmer lines for a foil-like texture
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  for(let i = -h; i < w; i += 14){
    ctx.beginPath();
    ctx.moveTo(i, h);
    ctx.lineTo(i + h, 0);
    ctx.stroke();
  }
  ctx.restore();
}

sizeCanvas();
window.addEventListener("resize", () => {
  if(!scratchDone) sizeCanvas();
});

// Determine pointer position relative to canvas
function getPos(e){
  const rect = canvas.getBoundingClientRect();
  let clientX, clientY;
  if(e.touches && e.touches.length){
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  return { x: clientX - rect.left, y: clientY - rect.top };
}

// Erase an irregular, torn-foil-style patch at the given position —
// instead of one perfectly smooth circle, a main dab plus several small
// randomized "flecks" around its edge mimic the rough, jagged marks left
// by an actual coin scratching foil.
function scratchAt(x, y){
  ctx.globalCompositeOperation = "destination-out";

  const baseRadius = randomBetween(16, 20);
  ctx.beginPath();
  ctx.arc(x, y, baseRadius, 0, Math.PI * 2);
  ctx.fill();

  const flecks = 5;
  for(let i = 0; i < flecks; i++){
    const angle = Math.random() * Math.PI * 2;
    const dist = baseRadius * randomBetween(0.45, 1.15);
    const fx = x + Math.cos(angle) * dist;
    const fy = y + Math.sin(angle) * dist;
    const r = randomBetween(3, 9);
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function startScratch(e){
  if(scratchDone) return;
  isDrawing = true;
  const pos = getPos(e);
  lastX = pos.x; lastY = pos.y;
  scratchAt(pos.x, pos.y);
  scratchHint.style.opacity = 0;
}

function moveScratch(e){
  if(!isDrawing || scratchDone) return;
  e.preventDefault();
  const pos = getPos(e);

  // Interpolate between last point and current point for smooth strokes
  const dist = Math.hypot(pos.x - lastX, pos.y - lastY);
  const steps = Math.max(1, Math.floor(dist / 6));
  for(let i = 0; i <= steps; i++){
    const ix = lastX + (pos.x - lastX) * (i/steps);
    const iy = lastY + (pos.y - lastY) * (i/steps);
    scratchAt(ix, iy);
  }
  lastX = pos.x; lastY = pos.y;

  checkScratchProgress();
}

function endScratch(){
  isDrawing = false;
}

// Sample canvas pixels to estimate percentage scratched
function checkScratchProgress(){
  const w = canvas.width, h = canvas.height;
  const sampleStep = 8; // sample every N pixels for performance
  const imageData = ctx.getImageData(0, 0, w, h).data;
  let transparent = 0, total = 0;

  for(let y = 0; y < h; y += sampleStep){
    for(let x = 0; x < w; x += sampleStep){
      const idx = (y * w + x) * 4;
      total++;
      if(imageData[idx + 3] < 32) transparent++;
    }
  }

  const pct = (transparent / total) * 100;
  if(pct >= 65 && !scratchDone){
    scratchDone = true;
    revealCard();
  }
}

// Mouse events
canvas.addEventListener("mousedown", startScratch);
canvas.addEventListener("mousemove", moveScratch);
window.addEventListener("mouseup", endScratch);

// Touch events
canvas.addEventListener("touchstart", startScratch, { passive:false });
canvas.addEventListener("touchmove", moveScratch, { passive:false });
canvas.addEventListener("touchend", endScratch);

/* ================================================================
   REVEAL SEQUENCE — fade out canvas, trigger celebration
   ================================================================ */
function revealCard(){
  if(isRevealed) return;
  isRevealed = true;

  // Smoothly fade the scratch canvas away to fully reveal the prize
  $(canvas).animate({ opacity: 0 }, 500, function(){
    canvas.style.pointerEvents = "none";
  });

  cardWrap.classList.add("revealed");
  scratchHint.style.opacity = 0;
  scratchHint.style.display = "none";

  playCelebrationSound();
  launchConfetti();

  // Sparkles begin once confetti settles, continue for ~4.5s
  setTimeout(startSparkles, 900);
}

/* ================================================================
   CONFETTI / PARTY CRACKER ANIMATION
   Launched from bottom-left and bottom-right, meeting near center,
   powered by requestAnimationFrame for smooth 60fps motion.
   ================================================================ */
function launchConfetti(){
  const total = 140; // total particle count (120-150 range)
  const half = Math.floor(total / 2);
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const particles = [];

  function makeParticle(originX, originY, dirSign){
    const size = randomBetween(6, 14);
    const el = document.createElement("div");
    el.className = "confetti-piece";
    const isCircle = Math.random() > 0.5;
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.style.background = randomColor();
    el.style.borderRadius = isCircle ? "50%" : "2px";
    document.body.appendChild(el);

    // Initial velocity: upward and toward center, with natural spread
    const angle = randomBetween(55, 85) * (Math.PI/180); // steep upward angle
    const speed = randomBetween(11, 19);
    const vx = Math.cos(angle) * speed * dirSign * randomBetween(0.7, 1.3);
    const vy = -Math.sin(angle) * speed;

    return {
      el,
      x: originX,
      y: originY,
      vx,
      vy,
      rotation: randomBetween(0, 360),
      rotSpeed: randomBetween(-14, 14),
      gravity: randomBetween(0.35, 0.55),
      life: 0,
      maxLife: randomBetween(90, 140), // frames before fade completes
      opacity: 1
    };
  }

  // Bottom-left burst
  for(let i = 0; i < half; i++){
    particles.push(makeParticle(vw * 0.02, vh * 0.98, 1));
  }
  // Bottom-right burst
  for(let i = 0; i < total - half; i++){
    particles.push(makeParticle(vw * 0.98, vh * 0.98, -1));
  }

  let frame = 0;
  const maxFrames = 170;

  function tick(){
    frame++;
    let anyAlive = false;

    particles.forEach(p => {
      if(p.life > p.maxLife) return;
      anyAlive = true;

      p.vy += p.gravity;      // gravity pulls particle down over time
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotSpeed;
      p.life++;

      // Fade out over the final third of life
      const fadeStart = p.maxLife * 0.6;
      if(p.life > fadeStart){
        p.opacity = Math.max(0, 1 - (p.life - fadeStart) / (p.maxLife - fadeStart));
      }

      p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rotation}deg)`;
      p.el.style.opacity = p.opacity;
    });

    if(frame < maxFrames && anyAlive){
      requestAnimationFrame(tick);
    } else {
      // Cleanup DOM nodes once animation finishes
      particles.forEach(p => p.el.remove());
    }
  }

  requestAnimationFrame(tick);
}

/* ================================================================
   FLOATING SPARKLES AROUND THE REVEALED CODE
   Generated continuously for ~4.5 seconds after confetti settles.
   ================================================================ */
function startSparkles(){
  const layer = document.getElementById("sparkleLayer");
  const duration = 4500;
  const startTime = Date.now();

  const interval = setInterval(() => {
    if(Date.now() - startTime > duration){
      clearInterval(interval);
      return;
    }
    spawnSparkle(layer);
  }, 120);
}

function spawnSparkle(layer){
  const size = randomBetween(4, 10);
  const sparkle = document.createElement("div");
  sparkle.className = "sparkle";
  sparkle.style.width = size + "px";
  sparkle.style.height = size + "px";
  sparkle.style.left = randomBetween(5, 95) + "%";
  sparkle.style.top = randomBetween(20, 90) + "%";
  sparkle.style.opacity = 0;
  layer.appendChild(sparkle);

  // Use jQuery to animate float-up + twinkle + fade
  $(sparkle)
    .css({ opacity: 0, transform: "translateY(0) scale(0.4)" })
    .animate({ opacity: 1 }, 200)
    .animate({ opacity: 1 }, 250)
    .animate({ opacity: 0 }, 700, function(){
      $(this).remove();
    });

  // Simultaneously drift upward with a smooth CSS transition
  requestAnimationFrame(() => {
    sparkle.style.transition = "transform 1.1s ease-out";
    sparkle.style.transform = `translateY(-${randomBetween(30, 70)}px) scale(1)`;
  });
}

/* ================================================================
   RESET / GENERATE NEW CODE
   ================================================================ */
function resetCard(){
  isRevealed = false;
  scratchDone = false;

  // New random code
  document.getElementById("prizeCode").textContent = randomCode();

  // Remove glow + reset canvas opacity/pointer events
  cardWrap.classList.remove("revealed");
  canvas.style.pointerEvents = "auto";
  canvas.style.opacity = 1;

  // Clear any leftover sparkles
  $("#sparkleLayer").empty();

  // Remove any confetti still lingering
  $(".confetti-piece").remove();

  // Restore scratch hint badge
  scratchHint.style.display = "flex";
  scratchHint.style.opacity = 1;

  // Repaint scratch surface
  sizeCanvas();
}

document.getElementById("resetBtn").addEventListener("click", resetCard);

/* ================================================================
   INITIALIZE — random code on first load
   ================================================================ */
document.getElementById("prizeCode").textContent = randomCode();
