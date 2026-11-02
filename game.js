/**
 * Geometric Rhythm - Core Game Engine
 * Multiple levels, GD-style level menu, neon theme, music, no editor.
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game Constants (GD-accurate: 60fps frame-based physics)
// Moderate-easier variant: lower gravity + stronger jump so the cube clears
// ~3.2 blocks (apex ~95px vs stock GD ~78px) — noticeably easier than real GD
// but snappier/less floaty than the previous 4.3-block setting.
const GRAVITY = 0.82;
const JUMP_FORCE = -12.5;
const GROUND_Y = 500;
const TILE_SIZE = 30;
const PAD_FORCE = { YELLOW: 14.98, PINK: 9.24, RED: 20.0 };

// Game State
let gameState = 'MENU'; // MENU, PLAYING, GAMEOVER, COMPLETE
let lastTime = 0;
let levelX = 0;
let currentSpeed = 5;
let currentLevel = 0;
let attemptCount = 1;
let activeTriggers = []; // { group, targetX, targetY, startTime, duration }
let levelObjectsSnapshot = [];
let muted = false;
let loopId = 0; // rAF handle to prevent duplicate loops

// Player Settings
class Player {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = 100;
        this.y = GROUND_Y - TILE_SIZE;
        this.vy = 0;
        this.prevY = this.y;
        this.vx = currentSpeed;
        this.mode = 'CUBE'; // CUBE, SHIP, BALL, UFO, WAVE, ROBOT, SPIDER, SWING
        this.gravity = 1; // 1 (Normal), -1 (Inverted)
        this.size = 1; // 1 (Normal), 0.6 (Mini)
        this.speedMultiplier = 1; // 0.5x, 1x, 2x, 3x, 4x
        this.angle = 0;
        this.isGrounded = false;
        this.isDead = false;
        this.color = getColorHex(getEquipped('color1'));
        this.trail = [];
        this.jumpBuffer = 0;
        this.timeScale = 1;
    }

    update(dt) {
        if (this.isDead) return;

        const timeScale = dt / 16.6 || 1; // Base physics on 60fps
        this.timeScale = timeScale;

        // Apply Speed
        this.vx = (currentSpeed * this.speedMultiplier) * timeScale;
        levelX += this.vx;

        // Mode specific physics
        switch (this.mode) {
            case 'CUBE': this.updateCube(dt, timeScale); break;
            case 'SHIP': this.updateShip(dt, timeScale); break;
            case 'BALL': this.updateBall(dt, timeScale); break;
            case 'UFO': this.updateUFO(dt, timeScale); break;
            case 'WAVE': this.updateWave(dt, timeScale); break;
            case 'ROBOT': this.updateRobot(dt, timeScale); break;
            case 'SPIDER': this.updateSpider(dt, timeScale); break;
            case 'SWING': this.updateSwing(dt, timeScale); break;
        }

        // Apply Gravity/Velocity
        this.prevY = this.y;
        this.y += this.vy * timeScale;
        if (this.jumpBuffer > 0) this.jumpBuffer--;

        // Ground/Ceiling Collision
        const effectiveSize = TILE_SIZE * this.size;
        if (this.y > GROUND_Y - effectiveSize && this.gravity === 1) {
            this.y = GROUND_Y - effectiveSize;
            this.vy = 0;
            this.isGrounded = true;
            if (this.mode === 'CUBE' || this.mode === 'ROBOT') this.angle = Math.round(this.angle / 90) * 90;
            if (this.jumpBuffer > 0 && (this.mode === 'CUBE' || this.mode === 'ROBOT')) {
                this.jumpBuffer = 0;
                this.jump();
            }
        } else if (this.y < 50 && this.gravity === -1) {
            this.y = 50;
            this.vy = 0;
            this.isGrounded = true;
            if (this.jumpBuffer > 0 && (this.mode === 'CUBE' || this.mode === 'ROBOT')) {
                this.jumpBuffer = 0;
                this.jump();
            }
        } else {
            this.isGrounded = false;
        }

        // Update Trail
        this.trail.push({x: this.x, y: this.y + effectiveSize/2});
        if (this.trail.length > 20) this.trail.shift();

        // Check Object Collisions
        this.checkCollisions();
    }

    updateCube(dt, timeScale) {
        this.vy += (GRAVITY * this.gravity) * timeScale;
        if (!this.isGrounded) this.angle += (this.vy * 2) * timeScale;
    }

    updateShip(dt, timeScale) {
        this.vy += (GRAVITY * 0.8 * this.gravity) * timeScale;
        // GD ship has capped rise/fall speeds (~3.9/3.5 units per frame)
        if (this.gravity === 1) this.vy = Math.max(-4.0, Math.min(3.5, this.vy));
        else this.vy = Math.max(-3.5, Math.min(4.0, this.vy));
        // Manual control: hold = rotate up, release = rotate down (no autopilot)
        const turnRate = 8 * timeScale;
        if (isKeyDown) this.angle -= turnRate * this.gravity;
        else this.angle += turnRate * this.gravity;
        this.angle = Math.max(-90 * this.gravity, Math.min(90 * this.gravity, this.angle));
    }

    updateBall(dt, timeScale) {
        this.vy += (GRAVITY * this.gravity) * timeScale;
        if (!this.isGrounded) this.angle += this.vy * timeScale;
        else this.angle = Math.round(this.angle / 90) * 90;
    }

    updateUFO(dt, timeScale) {
        this.vy += (GRAVITY * 0.6 * this.gravity) * timeScale;
        // Clamp UFO speed like ship — prevents falling off-screen
        if (this.gravity === 1) this.vy = Math.max(-4.5, Math.min(4.0, this.vy));
        else this.vy = Math.max(-4.0, Math.min(4.5, this.vy));
        this.angle += (2 * this.gravity) * timeScale;
    }

    updateWave(dt, timeScale) {
        this.vy = Math.max(-12, Math.min(12, this.vy));
        this.angle = this.vy * 5;
    }

    updateRobot(dt, timeScale) {
        this.vy += (GRAVITY * this.gravity) * timeScale;
        this.vy = Math.max(-6, Math.min(6, this.vy));
    }

    updateSpider(dt, timeScale) {
        this.vy += (GRAVITY * this.gravity) * timeScale;
    }

    updateSwing(dt, timeScale) {
        this.vy += (GRAVITY * 0.4 * this.gravity) * timeScale;
        this.vy = Math.max(-6, Math.min(6, this.vy));
        this.angle = this.vy * 3;
    }

    jump(isHeld = false) {
        if (this.isDead) return;

        switch (this.mode) {
            case 'CUBE':
                if (this.isGrounded) {
                    // Never downgrade a stronger launch (yellow/red pad) to a
                    // plain jump: only apply JUMP_FORCE if we are not already
                    // moving up faster than a normal jump.
                    const jv = JUMP_FORCE * this.gravity;
                    if (this.gravity === 1 ? this.vy > jv : this.vy < jv) this.vy = jv;
                }
                break;
            case 'SHIP':
                this.vy -= (GRAVITY * 1.6) * this.gravity * (this.timeScale || 1);
                break;
            case 'BALL':
                if (this.isGrounded) {
                    this.gravity *= -1;
                    this.isGrounded = false;
                }
                break;
            case 'UFO':
                this.vy = JUMP_FORCE * 0.8 * this.gravity;
                break;
            case 'WAVE':
                this.gravity = isHeld ? -1 : 1;
                this.vy = isHeld ? -8 : 8;
                break;
            case 'ROBOT':
                if (this.isGrounded) this.vy = JUMP_FORCE * this.gravity;
                break;
            case 'SPIDER':
                if (this.isGrounded) {
                    this.gravity *= -1;
                    const effectiveSize = TILE_SIZE * this.size;
                    this.y = (this.gravity === 1) ? GROUND_Y - effectiveSize : 50;
                    this.isGrounded = true;
                }
                break;
            case 'SWING':
                this.gravity *= -1;
                break;
        }
    }

    checkCollisions() {
        const px = this.x + levelX;
        const py = this.y;
        const ps = TILE_SIZE * this.size;

        levelData.objects.forEach(obj => {
            if (this.isDead) return;

            if (obj.type === 'BLOCK') {
                this.collideBlock(obj, px, py, ps);
                return;
            }

            // Saws are lethal: kill on any overlap (full player box, like GD saws).
            if (obj.type === 'SAW' || obj.type === 'MOVE_SAW') {
                if (this.aabbOverlap(px, py, ps, obj)) this.die();
                return;
            }

            const isPortal = obj.type.indexOf('PORTAL') === 0;
            const isTrigger = (obj.type.indexOf('PAD_') === 0) ||
                              (obj.type.indexOf('ORB_') === 0);

            // Interaction objects (pads, orbs, portals) trigger exactly when the
            // player's visual box touches the object's hitbox (full-box overlap),
            // so effects fire on real contact. Portals are NOT x-only: they only
            // switch mode if you actually pass through their hitbox - dodging over
            // or under a portal no longer flips your mode.
            const hit = this.aabbOverlap(px, py, ps, obj);

            if (obj.type === 'SPIKE') {
                if (hit && this.spikeHit(obj, px, py, ps)) this.die();
                return;
            }

            // Pads & orbs re-arm when the player leaves their overlap, so they
            // trigger reliably every time they are touched (GD behavior) instead of
            // being one-shot-per-run. Act only on the overlap-ENTER edge.
            if (isTrigger) {
                if (hit && !obj._overlap) this.handleObjectEffect(obj);
                obj._overlap = hit;
                return;
            }

            // Portals / everything else: gate on the one-shot activated flag.
            if (hit) this.handleObjectEffect(obj);
        });
    }

    aabbOverlap(px, py, ps, obj) {
        return px < obj.x + obj.size && px + ps > obj.x &&
               py < obj.y + obj.size && py + ps > obj.y;
    }

    collideBlock(obj, px, py, ps) {
        const ss = this.solidBoxSize();
        const sx = px + (ps - ss) / 2;
        const sy = py + (ps - ss) / 2;

        // Landing uses GD's surface-crossing test: the player's foot line was
        // above (or at) the block's top last frame and is inside it now, while
        // moving downward -> snap onto the surface. Penetration-depth heuristics
        // wrongly reject steep GD-style descents onto platform edges.
        const prevBottom = this.prevY + ps;

        if (this.aabbOverlap(px, py, ps, obj)) {
            if (this.gravity === 1) {
                if (this.vy >= 0 && prevBottom <= obj.y + 1) {
                    this.y = obj.y - ps;
                    this.vy = 0;
                    this.isGrounded = true;
                    return;
                }
            } else {
                // Inverted gravity: land on the block's underside while moving up
                if (this.vy <= 0 && this.prevY >= obj.y + obj.size - 1) {
                    this.y = obj.y + obj.size;
                    this.vy = 0;
                    this.isGrounded = true;
                    return;
                }
            }
        }

        // Otherwise it's a side/bottom hit. In real GD only the smaller solid
        // hitbox kills on horizontal block contact, so grazing edges is safe.
        if (this.aabbOverlap(sx, sy, ss, obj)) {
            // GD lets a strong launch carry the player up past a block's top
            // corner even while the inner box shaves the face (the classic
            // pad-over-tower hug): if a fast vertical escape clears the block
            // within a few ticks, the clip is survivable. Head-on wall crashes
            // have no such escape and still kill.
            const depthX = Math.min(sx + ss - obj.x, obj.x + obj.size - sx);
            let launchedClear = false;
            if (!this.isGrounded && depthX <= 8) {
                if (this.gravity === 1 && this.vy <= -4) {
                    launchedClear = (sy - obj.y) <= -this.vy * 2;
                } else if (this.gravity === -1 && this.vy >= 4) {
                    launchedClear = (obj.y + obj.size - (sy + ss)) <= this.vy * 2;
                }
            }
            if (launchedClear) {
                return;
            }
            this.die();
        }
    }

    solidBoxSize() {
        if (this.mode === 'WAVE') return 3;
        return this.size < 1 ? 6 : 9;
    }

    spikeHit(obj, px, py, ps) {
        // Real GD hazard rules: spikes are checked against the player's SMALL
        // inner hitbox (~1/3 of the cube), and the spike's own hitbox is a small
        // rectangle near the center of its cell (~0.3 x 0.35 blocks), which is
        // what makes grazing spike tips survivable in GD.
        const s = obj.size;
        const rx = obj.x + s * 0.35;
        const ry = obj.y + s * 0.28;
        const rw = s * 0.30;
        const rh = s * 0.38;
        const ss = this.solidBoxSize();
        const sx = px + (ps - ss) / 2;
        const sy = py + (ps - ss) / 2;
        return sx < rx + rw && sx + ss > rx &&
               sy < ry + rh && sy + ss > ry;
    }

    handleObjectEffect(obj) {
        // Pads & orbs re-arm via _overlap in checkCollisions, so they must not be
        // gated by the persistent activated flag. Portals are still one-shot.
        const isTrigger = (obj.type.indexOf('PAD_') === 0) ||
                          (obj.type.indexOf('ORB_') === 0);
        if (!isTrigger && obj.activated) return;

        switch (obj.type) {
            case 'PORTAL_SHIP': this.mode = 'SHIP'; obj.activated = true; break;
            case 'PORTAL_BALL': this.mode = 'BALL'; obj.activated = true; break;
            case 'PORTAL_WAVE': this.mode = 'WAVE'; obj.activated = true; break;
            case 'PORTAL_UFO': this.mode = 'UFO'; obj.activated = true; break;
            case 'PORTAL_SWING': this.mode = 'SWING'; obj.activated = true; break;
            case 'PORTAL_CUBE': this.mode = 'CUBE'; obj.activated = true; break;
            case 'PORTAL_TELEPORT': this.y += obj.exitOffset || 300; this.y = Math.max(50, Math.min(GROUND_Y - TILE_SIZE * this.size, this.y)); obj.activated = true; break;
            case 'PORTAL_GRAVITY_UP': this.gravity = -1; obj.activated = true; break;
            case 'PORTAL_GRAVITY_DOWN': this.gravity = 1; obj.activated = true; break;
            case 'SIZE_MINI': this.size = 0.6; obj.activated = true; break;
            case 'SIZE_BIG': this.size = 1; obj.activated = true; break;
            case 'SPEED_05': currentSpeed = levelData.speed * 0.5; obj.activated = true; break;
            case 'SPEED_1': currentSpeed = levelData.speed; obj.activated = true; break;
            case 'SPEED_2': currentSpeed = levelData.speed * 2; obj.activated = true; break;
            case 'ORB_JUMP': 
                this.vy = JUMP_FORCE * 1.2 * this.gravity; 
                this.isGrounded = false;
                obj.activated = true;
                break;
            case 'ORB_GRAVITY': 
                this.gravity *= -1; 
                obj.activated = true;
                break;
            case 'ORB_BLACK': 
                this.gravity *= -1;
                this.vy = -JUMP_FORCE * 1.5 * this.gravity; 
                this.isGrounded = false;
                obj.activated = true;
                break;
            case 'ORB_TELEPORT':
                this.y -= 250;
                this.y = Math.max(50, this.y);
                obj.activated = true;
                break;
            case 'PAD_JUMP': 
                this.vy = -PAD_FORCE.YELLOW * this.gravity; 
                this.isGrounded = false;
                obj.activated = true;
                break;
            case 'PAD_YELLOW': 
                this.vy = -PAD_FORCE.YELLOW * this.gravity; 
                this.isGrounded = false;
                obj.activated = true;
                break;
            case 'PAD_PINK': 
                this.vy = -PAD_FORCE.PINK * this.gravity; 
                this.isGrounded = false;
                obj.activated = true;
                break;
            case 'PAD_RED': 
                this.vy = -PAD_FORCE.RED * this.gravity; 
                this.isGrounded = false;
                obj.activated = true;
                break;
            case 'TRIGGER_MOVE': this.activateMoveTrigger(obj); break;
        }
    }

    activateMoveTrigger(trigger) {
        activeTriggers.push({
            type: 'MOVE',
            targetGroup: trigger.group,
            moveX: trigger.moveX || 0,
            moveY: trigger.moveY || 0,
            duration: (trigger.duration || 10) * 16.6, // frames to ms rough conversion
            startTime: performance.now(),
            startPositions: new Map() // group mapping
        });
        trigger.activated = true;
    }

    die() {
        if (this.isDead) return;
        this.isDead = true;
        gameState = 'GAMEOVER';
        canvas.style.pointerEvents = 'none';
        document.getElementById('death-msg').innerText = 'TRY AGAIN';
        document.getElementById('attempt-display').innerText = 'ATTEMPT ' + attemptCount;
        document.getElementById('game-over').classList.remove('hidden');
        
        // Reset objects to their original positions from snapshot
        if (levelObjectsSnapshot.length > 0) {
            levelData.objects = JSON.parse(JSON.stringify(levelObjectsSnapshot));
        }
    }

    draw() {
        // Trail behind player
        this.drawTrail();

        ctx.save();
        ctx.translate(this.x + (TILE_SIZE * this.size) / 2, this.y + (TILE_SIZE * this.size) / 2);
        ctx.rotate(this.angle * Math.PI / 180);

        const s = TILE_SIZE * this.size;
        const c1 = getColorHex(getEquipped('color1'));
        const c2 = getColorHex(getEquipped('color2'));
        if (this.mode === 'SHIP') {
            drawShipBody(ctx, getEquipped('ship'), s, c1, c2);
        } else {
            drawIconBody(ctx, getEquipped('icon'), s, c1, c2);
        }

        ctx.restore();
    }

    drawTrail() {
        const trailType = getEquipped('trail');
        if (!trailType || trailType === 'none' || this.trail.length === 0) return;
        const c1 = getColorHex(getEquipped('color1'));
        ctx.save();
        for (let i = 0; i < this.trail.length; i++) {
            const p = this.trail[i];
            const t = i / this.trail.length;
            const alpha = 0.08 + t * 0.55;
            const size = 3 + t * 7;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = trailType === 'rainbow' ? `hsl(${(i * 20) % 360},100%,60%)` : c1;
            if (trailType === 'dot') {
                ctx.beginPath();
                ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else if (trailType === 'fire') {
                ctx.beginPath();
                ctx.moveTo(p.x - size / 2, p.y);
                ctx.lineTo(p.x, p.y - size);
                ctx.lineTo(p.x + size / 2, p.y);
                ctx.fill();
            } else {
                ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
            }
        }
        ctx.restore();
    }
}

const player = new Player();

// Input Handling
let isKeyDown = false;
let isLeftDown = false;
let isRightDown = false;
let lastTouchTime = 0; // suppress mouse events after touch

function inputDown() {
    if (gameState !== 'PLAYING') return;
    isKeyDown = true;
    if (player.mode === 'CUBE' || player.mode === 'ROBOT' || player.mode === 'BALL') {
        player.jumpBuffer = 6;
    }
    player.jump(true);
}

function inputUp() {
    isKeyDown = false;
    if (player.mode === 'WAVE') player.jump(false);
}

function inputLeft(down) {
    isLeftDown = down;
}

function inputRight(down) {
    isRightDown = down;
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        if (gameState === 'PLAYING') e.preventDefault();
        inputDown();
    }
    if (e.code === 'ArrowLeft') {
        if (gameState === 'PLAYING') e.preventDefault();
        inputLeft(true);
    }
    if (e.code === 'ArrowRight') {
        if (gameState === 'PLAYING') e.preventDefault();
        inputRight(true);
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        inputUp();
    }
    if (e.code === 'ArrowLeft') {
        inputLeft(false);
    }
    if (e.code === 'ArrowRight') {
        inputRight(false);
    }
});

canvas.addEventListener('mousedown', (e) => {
    if (Date.now() - lastTouchTime < 400) return; // suppress after touch
    inputDown();
});

canvas.addEventListener('mouseup', () => {
    if (Date.now() - lastTouchTime < 400) return;
    inputUp();
});

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    lastTouchTime = Date.now();
    inputDown();
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    lastTouchTime = Date.now();
    inputUp();
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    inputUp();
}, { passive: false });

// Reset stuck keys when tab loses focus
window.addEventListener('blur', () => {
    isKeyDown = false;
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden) isKeyDown = false;
});

// UI Logic
function showHUD(show) {
    document.getElementById('hud').style.display = show ? 'flex' : 'none';
}

function hideOverlays(exclude) {
    ['level-menu', 'game-over', 'level-complete', 'customize-menu', 'shop-menu', 'feedback-overlay'].forEach(id => {
        if (id !== exclude) {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        }
    });
}

function showMainMenu() {
    document.getElementById('main-menu').classList.remove('hidden');
    hideOverlays(null);
    showHUD(false);
    canvas.style.pointerEvents = 'none';
    gameState = 'MENU';
    stopMusic();
    updateCurrencyDisplay();
}

function showLevelMenu() {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('level-menu').classList.remove('hidden');
    hideOverlays('level-menu');
    showHUD(false);
    gameState = 'MENU';
    stopMusic();
    buildLevelMenu(); // rebuild so newly completed levels appear
    updateCurrencyDisplay();
}

function showCustomizeMenu() {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('customize-menu').classList.remove('hidden');
    hideOverlays('customize-menu');
    showHUD(false);
    gameState = 'MENU';
    buildCustomizeMenu();
}

function showShopMenu() {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('shop-menu').classList.remove('hidden');
    hideOverlays('shop-menu');
    showHUD(false);
    gameState = 'MENU';
    buildShopMenu();
}

function startLevel(index) {
    currentLevel = index;
    levelData = LEVELS[index];
    currentSpeed = levelData.speed;
    attemptCount = 1;

    document.getElementById('main-menu').classList.add('hidden');
    hideOverlays(null);
    gameState = 'PLAYING';
    canvas.style.pointerEvents = 'auto';
    showHUD(true);
    
    levelObjectsSnapshot = JSON.parse(JSON.stringify(levelData.objects));
    player.reset();
    levelX = 0;
    activeTriggers = [];
    lastTime = performance.now();
    playMusic(selectedSong || levelData.music);
    cancelAnimationFrame(loopId);
    loopId = requestAnimationFrame(gameLoop);
}

function restartLevel() {
    document.getElementById('game-over').classList.add('hidden');
    document.getElementById('level-complete').classList.add('hidden');
    gameState = 'PLAYING';
    canvas.style.pointerEvents = 'auto';
    currentSpeed = levelData.speed;
    attemptCount++;
    player.reset();
    levelX = 0;
    activeTriggers = [];
    levelData.objects = JSON.parse(JSON.stringify(levelObjectsSnapshot));
    lastTime = performance.now();
    playMusic(selectedSong || levelData.music, true);
    cancelAnimationFrame(loopId);
    loopId = requestAnimationFrame(gameLoop);
}

function completeLevel() {
    if (player.isDead) return;
    gameState = 'COMPLETE';
    canvas.style.pointerEvents = 'none';
    document.getElementById('level-complete').classList.remove('hidden');
    document.getElementById('complete-progress').innerText = '100%';
    document.getElementById('complete-stars').innerText = '★'.repeat(levelData.stars);

    const completed = getCompletedLevels();
    const firstTime = !completed.includes(currentLevel);
    if (firstTime) {
        completed.push(currentLevel);
        localStorage.setItem('geometric_completed', JSON.stringify(completed));
    }

    // Reward calculation
    const orbs = levelData.stars * 50;
    const diamonds = firstTime ? 3 : 0;
    addCurrency(orbs, diamonds);
    document.getElementById('complete-unlock').innerText =
        firstTime ? 'REWARD: ♥ +' + orbs + '  ◆ +' + diamonds : 'REPLAY: ♥ +' + orbs;
    stopMusic();
}

function getCompletedLevels() {
    try {
        const data = JSON.parse(localStorage.getItem('geometric_completed'));
        if (Array.isArray(data)) return data;
    } catch (e) {}
    return [];
}

// Currency
function getCurrency() {
    try {
        const c = JSON.parse(localStorage.getItem('geometric_cur'));
        if (c && typeof c.orbs === 'number' && typeof c.diamonds === 'number') return c;
    } catch (e) {}
    return { orbs: 0, diamonds: 0 };
}

function saveCurrency(c) {
    localStorage.setItem('geometric_cur', JSON.stringify(c));
}

function addCurrency(orbs, diamonds) {
    const c = getCurrency();
    c.orbs += orbs || 0;
    c.diamonds += diamonds || 0;
    saveCurrency(c);
    updateCurrencyDisplay();
}

function updateCurrencyDisplay() {
    const c = getCurrency();
    document.querySelectorAll('.currency-display').forEach(el => {
        el.innerHTML =
            '<span class="cur cur--orbs"><span class="cur__icon" aria-hidden="true">♥</span>' + c.orbs + '</span>' +
            '<span class="cur cur--gems"><span class="cur__icon" aria-hidden="true">◆</span>' + c.diamonds + '</span>';
    });
}

// Customization catalogs
const ICONS = [
    { id: 'base',    name: 'Base Cube',     cost: 0 },
    { id: 'round',   name: 'Round Cube',    cost: 150, currency: 'orbs' },
    { id: 'square',  name: 'Square Cube',   cost: 200, currency: 'orbs' },
    { id: 'spike',   name: 'Spike Cube',    cost: 300, currency: 'orbs' },
    { id: 'glow',    name: 'Glow Cube',     cost: 450, currency: 'orbs' },
    { id: 'diamond', name: 'Diamond Cube',  cost: 2, currency: 'diamonds' },
    { id: 'crown',   name: 'Crown Cube',    cost: 3, currency: 'diamonds' }
];

// Ship hulls. These are drawn whenever the player is in ship mode, so a
// single equipped hull carries across every level.
const SHIPS = [
    { id: 'rocket',  name: 'Neon Rocket', cost: 0 },
    { id: 'dart',    name: 'Dart',        cost: 250, currency: 'orbs' },
    { id: 'falcon',  name: 'Falcon',      cost: 400, currency: 'orbs' },
    { id: 'manta',   name: 'Manta',       cost: 600, currency: 'orbs' },
    { id: 'saucer',  name: 'Saucer',      cost: 2, currency: 'diamonds' },
    { id: 'phantom', name: 'Phantom',     cost: 4, currency: 'diamonds' }
];


const COLORS = [
    { id: 'cyan',   hex: '#00f3ff', name: 'Cyan',   cost: 0 },
    { id: 'white',  hex: '#ffffff', name: 'White',  cost: 100, currency: 'orbs' },
    { id: 'pink',   hex: '#ff00ff', name: 'Pink',   cost: 150, currency: 'orbs' },
    { id: 'green',  hex: '#39ff14', name: 'Green',  cost: 200, currency: 'orbs' },
    { id: 'yellow', hex: '#ffff00', name: 'Yellow', cost: 200, currency: 'orbs' },
    { id: 'red',    hex: '#ff4444', name: 'Red',    cost: 250, currency: 'orbs' },
    { id: 'orange', hex: '#ff8800', name: 'Orange', cost: 300, currency: 'orbs' },
    { id: 'purple', hex: '#9400d3', name: 'Purple', cost: 350, currency: 'orbs' },
    { id: 'gold',   hex: '#ffd700', name: 'Gold',   cost: 1, currency: 'diamonds' },
    { id: 'neon',   hex: '#00ff9f', name: 'Neon',   cost: 2, currency: 'diamonds' }
];

const TRAILS = [
    { id: 'none',    name: 'No Trail',     cost: 0 },
    { id: 'fade',    name: 'Fade Trail',   cost: 100, currency: 'orbs' },
    { id: 'dot',     name: 'Dot Trail',    cost: 200, currency: 'orbs' },
    { id: 'fire',    name: 'Fire Trail',   cost: 350, currency: 'orbs' },
    { id: 'rainbow', name: 'Rainbow Trail', cost: 1, currency: 'diamonds' }
];

// Customization storage
function getOwned() {
    const fresh = { icons: ['base'], colors: ['cyan', 'white'], trails: ['none'], ships: ['rocket'] };
    try {
        const o = JSON.parse(localStorage.getItem('geometric_owned'));
        if (o && Array.isArray(o.icons) && Array.isArray(o.colors) && Array.isArray(o.trails)) {
            // Older saves predate ship hulls — keep everything and add the default.
            return { ...fresh, ...o, ships: Array.isArray(o.ships) ? o.ships : ['rocket'] };
        }
    } catch (e) {}
    return fresh;
}

function saveOwned(o) {
    localStorage.setItem('geometric_owned', JSON.stringify(o));
}

function buyItem(cat, item) {
    const c = getCurrency();
    const cost = item.cost || 0;
    if (item.currency === 'diamonds') {
        if (c.diamonds < cost) return false;
        c.diamonds -= cost;
    } else {
        if (c.orbs < cost) return false;
        c.orbs -= cost;
    }
    saveCurrency(c);
    const o = getOwned();
    if (!o[cat].includes(item.id)) o[cat].push(item.id);
    saveOwned(o);
    updateCurrencyDisplay();
    return true;
}

function getEquip() {
    const fresh = { icon: 'base', ship: 'rocket', color1: 'cyan', color2: 'white', trail: 'none' };
    try {
        const e = JSON.parse(localStorage.getItem('geometric_equip'));
        if (e && e.icon && e.color1 && e.color2 && e.trail) {
            return { ...fresh, ...e, ship: e.ship || 'rocket' };
        }
    } catch (err) {}
    return fresh;
}

function saveEquip(e) {
    localStorage.setItem('geometric_equip', JSON.stringify(e));
}

function getEquipped(key) {
    return getEquip()[key];
}

function equipItem(cat, id) {
    const e = getEquip();
    if (cat === 'icons') e.icon = id;
    else if (cat === 'ships') e.ship = id;
    else if (cat === 'color1') e.color1 = id;
    else if (cat === 'color2') e.color2 = id;
    else if (cat === 'trail') e.trail = id;
    saveEquip(e);
}

function getColorHex(id) {
    const map = {
        cyan: '#00f3ff', white: '#ffffff', pink: '#ff00ff', green: '#39ff14',
        yellow: '#ffff00', red: '#ff4444', orange: '#ff8800', purple: '#9400d3',
        gold: '#ffd700', neon: '#00ff9f'
    };
    return map[id] || '#00f3ff';
}

// Difficulty / level menu (GD-style)
function diffColor(diff) {
    if (diff === 'Easy') return '#00ff00';
    if (diff === 'Normal') return '#00ccff';
    if (diff === 'Hard') return '#ff4444';
    if (diff === 'Insane') return '#ff2bd6';
    return '#ff4444';
}

function difficultyFaceSVG(diff) {
    const col = diffColor(diff);
    const mouth = diff === 'Insane'
        ? 'M5.6 14.2 Q10 11.4 14.4 14.2'
        : diff === 'Hard' ? 'M6 13 Q10 10.5 14 13' : 'M6 10.5 Q10 13.5 14 10.5';
    const brows = diff === 'Insane'
        ? `<path d="M4.8 4.6 L8 6 M15.2 4.6 L12 6" stroke="#0a0a1a" stroke-width="1.4" stroke-linecap="round"/>`
        : '';
    const eyes = diff === 'Insane'
        ? `<path d="M5.4 7.2 L8 9.2 M6.7 9.4 L8 8.2" stroke="#0a0a1a" stroke-width="1.2" stroke-linecap="round"/>
           <path d="M14.6 7.2 L12 9.2 M13.3 9.4 L12 8.2" stroke="#0a0a1a" stroke-width="1.2" stroke-linecap="round"/>`
        : `<rect x="5.2" y="5.8" width="2.4" height="3.6" rx="1" fill="#0a0a1a"/>
           <rect x="12.4" y="5.8" width="2.4" height="3.6" rx="1" fill="#0a0a1a"/>`;
    return `<svg viewBox="0 0 20 20" width="46" height="46">
        <circle cx="10" cy="10" r="9" fill="${col}" stroke="#0a0a1a" stroke-width="1.5"/>
        ${brows}
        ${eyes}
        <path d="${mouth}" stroke="#0a0a1a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    </svg>`;
}

function buildLevelMenu() {
    const grid = document.getElementById('level-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const completed = getCompletedLevels();

    LEVELS.forEach((level, i) => {
        const card = document.createElement('div');
        card.className = 'level-card' + (completed.includes(i) ? ' is-complete' : '');
        const col = diffColor(level.diff);
        card.style.setProperty('--diff', col);
        const done = completed.includes(i);

        card.innerHTML = `
            <span class="level-card__num">${String(i + 1).padStart(2, '0')}</span>
            <div class="level-face">${difficultyFaceSVG(level.diff)}</div>
            <div class="level-name">${level.name}</div>
            <div class="level-meta">
                <span class="level-diff">${level.diff}</span>
                <span class="level-stars" aria-label="${level.stars} stars">${'★'.repeat(level.stars)}</span>
            </div>
            <span class="level-check" aria-hidden="true">${done ? '✓' : ''}</span>
        `;

        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', level.name + ', ' + level.diff + (done ? ', completed' : ''));
        card.onclick = () => startLevel(i);
        card.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                startLevel(i);
            }
        };
        grid.appendChild(card);
    });
}

// Customize menu
const CUST_TABS = ['icons', 'ships', 'color1', 'color2', 'trail'];
let custTab = 'icons';

function buildCustomizeMenu() {
    if (!document.getElementById('customize-menu')) return;
    const tabsEl = document.getElementById('customize-tabs');
    if (!tabsEl) return;
    if (!tabsEl.dataset.built) {
        tabsEl.dataset.built = '1';
        CUST_TABS.forEach(t => {
            const b = document.createElement('button');
            b.className = 'tab-btn';
            b.textContent = t === 'color1' ? 'COLOR 1' : t === 'color2' ? 'COLOR 2' : t.toUpperCase();
            b.onclick = () => { custTab = t; buildCustomizeMenu(); };
            tabsEl.appendChild(b);
        });
    }
    Array.from(tabsEl.children).forEach((b, i) => b.classList.toggle('active', CUST_TABS[i] === custTab));
    buildCustomizeGrid();
    updateCurrencyDisplay();
}

function custCat() {
    if (custTab === 'ships') return 'ships';
    return custTab === 'color1' || custTab === 'color2' ? 'colors' : custTab === 'trail' ? 'trails' : 'icons';
}

function buildCustomizeGrid() {
    const grid = document.getElementById('customize-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const cat = custCat();
    const items = cat === 'icons' ? ICONS : cat === 'ships' ? SHIPS : cat === 'trails' ? TRAILS : COLORS;
    const owned = getOwned();
    const equip = getEquip();

    items.forEach(item => {
        const isOwned = owned[cat].includes(item.id);
        const isEquipped =
            (custTab === 'icons' && equip.icon === item.id) ||
            (custTab === 'ships' && equip.ship === item.id) ||
            (custTab === 'color1' && equip.color1 === item.id) ||
            (custTab === 'color2' && equip.color2 === item.id) ||
            (custTab === 'trail' && equip.trail === item.id);

        const div = document.createElement('div');
        div.className = 'cust-item' + (isOwned ? ' owned' : ' locked') + (isEquipped ? ' equipped' : '');
        if (cat === 'colors') div.style.background = item.hex;

        const swatch = cat === 'colors' ? '' : `<div class="cust-icon">${iconPreviewSVG(item, cat)}</div>`;
        div.innerHTML = swatch +
            `<div class="cust-item-name">${item.name}</div>` +
            `<div class="cust-item-cost">${isOwned ? (isEquipped ? 'EQUIPPED' : 'OWNED') : (item.currency === 'diamonds' ? '◆' + item.cost : '♥' + item.cost)}</div>`;

        div.tabIndex = 0;
        div.setAttribute('role', 'button');
        div.setAttribute('aria-label', item.name + (isEquipped ? ', equipped' : isOwned ? ', owned' : ', locked'));
        div.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); div.click(); }
        };

        div.onclick = () => {
            if (isOwned) {
                equipItem(custTab, item.id);
                player.color = getColorHex(getEquipped('color1'));
                buildCustomizeMenu();
            } else {
                openShopFor(custTab, item.id);
            }
        };
        grid.appendChild(div);
    });
}

function iconPreviewSVG(item, cat) {
    if (cat === 'icons') {
        const rx = item.id === 'round' ? 3 : 1;
        return `<svg viewBox="0 0 24 24" width="34" height="34"><rect x="6" y="8" width="12" height="12" rx="${rx}" fill="#fff" stroke="#0a0a1a" stroke-width="1"/></svg>`;
    }
    if (cat === 'ships') {
        const hulls = {
            rocket: '<path d="M3 9 H17 L21 12 L17 15 H3 Z" fill="#fff"/><path d="M4 9 L8 4 L10 9 Z M4 15 L8 20 L10 15 Z" fill="#8fd8ff"/><circle cx="15.5" cy="12" r="1.7" fill="#0a0a1a"/><path d="M3 10 L0 12 L3 14 Z" fill="#ff8800"/>',
            dart: '<path d="M21 12 L11 9 L5 9.6 L5 14.4 L11 15 Z" fill="#fff"/><path d="M7 9.6 L2 4 L6 10.6 Z M7 14.4 L2 20 L6 13.4 Z" fill="#8fd8ff"/><path d="M6 11.5 H13 V12.5 H6 Z" fill="#0a0a1a" opacity=".3"/>',
            falcon: '<path d="M21 12 L14 8.5 L5 8.5 L3 12 L5 15.5 L14 15.5 Z" fill="#fff"/><path d="M13 8.5 L2 3 L7 10 Z M13 15.5 L2 21 L7 14 Z" fill="#8fd8ff"/><ellipse cx="13" cy="12" rx="3.2" ry="1.9" fill="#0a0a1a" opacity=".35"/>',
            manta: '<path d="M20 12 L13 9 L6 9.8 L4 12 L6 14.2 L13 15 Z" fill="#fff"/><path d="M12 9.4 C8 5 4 4 1 6 C5 8 7 10 8 11 Z" fill="#8fd8ff"/><path d="M12 14.6 C8 19 4 20 1 18 C5 16 7 14 8 13 Z" fill="#8fd8ff"/><circle cx="16" cy="12" r=".9" fill="#8fd8ff"/>',
            saucer: '<ellipse cx="12" cy="13" rx="9" ry="3.4" fill="#fff"/><path d="M8.8 13 a3.2 4 0 0 1 6.4 0 Z" fill="#8fd8ff"/><circle cx="5.5" cy="13" r=".8" fill="#8fd8ff"/><circle cx="12" cy="13.4" r=".8" fill="#8fd8ff"/><circle cx="18.5" cy="13" r=".8" fill="#8fd8ff"/>',
            phantom: '<path d="M21 12 L12 8.6 L5 9.4 L7 12 L5 14.6 L12 15.4 Z" fill="#fff"/><path d="M7 9.4 L2 4 L5 10.6 Z M7 14.6 L2 20 L5 13.4 Z" fill="#8fd8ff"/><circle cx="16" cy="12" r="1.1" fill="#8fd8ff"/>'
        };
        return `<svg viewBox="0 0 24 24" width="34" height="34">${hulls[item.id] || hulls.rocket}</svg>`;
    }
    if (cat === 'trails') {
        return `<svg viewBox="0 0 24 24" width="34" height="34"><rect x="3" y="10" width="3" height="3" fill="#fff"/><rect x="8" y="10" width="3" height="3" fill="#fff"/><rect x="13" y="10" width="3" height="3" fill="#fff"/><rect x="18" y="10" width="3" height="3" fill="#fff"/></svg>`;
    }
    return '';
}

// Shop menu
const SHOP_TABS = ['icons', 'ships', 'colors', 'trails'];
let shopTab = 'icons';
let shopTarget = null;

function buildShopMenu() {
    if (!document.getElementById('shop-menu')) return;
    const tabsEl = document.getElementById('shop-tabs');
    if (!tabsEl) return;
    if (!tabsEl.dataset.built) {
        tabsEl.dataset.built = '1';
        SHOP_TABS.forEach(t => {
            const b = document.createElement('button');
            b.className = 'tab-btn';
            b.textContent = t.toUpperCase();
            b.onclick = () => { shopTab = t; buildShopMenu(); };
            tabsEl.appendChild(b);
        });
    }
    let focusId = null;
    if (shopTarget) {
        const map = { color1: 'colors', color2: 'colors', trail: 'trails', icons: 'icons', ships: 'ships' };
        shopTab = map[shopTarget.tab] || 'icons';
        focusId = shopTarget.itemId;
        shopTarget = null;
    }
    Array.from(tabsEl.children).forEach((b, i) => b.classList.toggle('active', SHOP_TABS[i] === shopTab));
    buildShopGrid();
    updateCurrencyDisplay();

    // Arriving from a locked item: point the player at what they wanted.
    if (focusId) {
        const items = shopTab === 'icons' ? ICONS : shopTab === 'ships' ? SHIPS : shopTab === 'trails' ? TRAILS : COLORS;
        const idx = items.findIndex(it => it.id === focusId);
        const el = idx > -1 ? document.getElementById('shop-grid').children[idx] : null;
        if (el) {
            el.scrollIntoView({ block: 'center' });
            el.classList.add('flash-target');
            setTimeout(() => el.classList.remove('flash-target'), 1500);
        }
    }
}

function openShopFor(tab, itemId) {
    shopTarget = { tab, itemId };
    showShopMenu();
}

function buildShopGrid() {
    const grid = document.getElementById('shop-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const items = shopTab === 'icons' ? ICONS : shopTab === 'ships' ? SHIPS : shopTab === 'trails' ? TRAILS : COLORS;
    const cat = shopTab;
    const owned = getOwned();
    const cur = getCurrency();

    items.forEach(item => {
        const isOwned = owned[cat].includes(item.id);
        const canAfford = item.currency === 'diamonds' ? cur.diamonds >= (item.cost || 0) : cur.orbs >= (item.cost || 0);

        const div = document.createElement('div');
        div.className = 'shop-item' + (isOwned ? ' owned' : (canAfford ? ' buyable' : ' locked'));
        if (cat === 'colors') div.style.background = item.hex;
        div.innerHTML = `<div class="cust-icon">${iconPreviewSVG(item, cat)}</div>` +
            `<div class="cust-item-name">${item.name}</div>` +
            `<div class="cust-item-cost">${isOwned ? 'OWNED' : (item.currency === 'diamonds' ? '◆' + item.cost : '♥' + item.cost)}</div>`;

        div.tabIndex = 0;
        div.setAttribute('role', 'button');
        div.setAttribute('aria-label', item.name + (isOwned ? ', owned' : canAfford ? ', buy for ' + item.cost : ', locked'));
        div.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); div.click(); }
        };

        div.onclick = () => {
            if (isOwned) {
                equipItem(cat === 'colors' ? 'color1' : cat === 'trails' ? 'trail' : cat, item.id);
                player.color = getColorHex(getEquipped('color1'));
                buildShopGrid();
                buildCustomizeMenu();
                flash('EQUIPPED ' + item.name.toUpperCase());
            } else if (!canAfford) {
                flash('NOT ENOUGH ' + (item.currency === 'diamonds' ? 'DIAMONDS' : 'ORBS'));
            } else if (buyItem(cat, item)) {
                flash('BOUGHT ' + item.name.toUpperCase());
                buildShopGrid();
            }
        };
        grid.appendChild(div);
    });
}

// Flash message
let flashTimer = null;
function flash(msg) {
    const el = document.getElementById('flash-msg');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.classList.add('hidden'), 1400);
}

// Level Menu
function buildSongSelector() {
    const sel = document.getElementById('song-selector');
    if (!sel) return;
    sel.innerHTML = '';
    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'Default (per level)';
    sel.appendChild(def);
    SONGS.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.file;
        opt.textContent = s.name;
        sel.appendChild(opt);
    });
    sel.value = selectedSong || '';
    sel.onchange = () => {
        selectedSong = sel.value || null;
        // Preview the chosen song right in the menu
        if (selectedSong && !muted) {
            playMusic(selectedSong);
        } else {
            stopMusic();
        }
    };
}

// Music
function playMusic(src, restart = false) {
    const music = document.getElementById('bg-music');
    if (!music || muted) return;
    if (restart) {
        music.currentTime = 0;
        music.play().catch(() => {});
        return;
    }
    music.src = src;
    music.load();
    music.play().catch(() => {});
}

function stopMusic() {
    const music = document.getElementById('bg-music');
    if (!music) return;
    music.pause();
}

// Song Selector (original GD tracks + custom wild picks)
const SONGS = [
    { file: 'audio/stereo-madness.mp3', name: 'Stereo Madness' },
    { file: 'audio/back-on-track.mp3', name: 'Back On Track' },
    { file: 'audio/polargeist.mp3', name: 'Polargeist' },
    { file: 'audio/dry-out.mp3', name: 'Dry Out' },
    { file: 'audio/base-after-base.mp3', name: 'Base After Base' },
    { file: 'audio/cant-let-go.mp3', name: "Can't Let Go" },
    { file: 'audio/dimension.mp3', name: 'Dimension' },
    { file: 'audio/sphere.mp3', name: 'Sphere' },
    { file: 'audio/exoplanet.mp3', name: 'Exoplanet' },
    { file: 'audio/field-of-hopes.mp3', name: 'Field of Hopes' },
    { file: 'audio/fallen-down.mp3', name: 'Fallen Down' },
    { file: 'audio/undertale-shop.mp3', name: 'Undertale Shop' },
    { file: 'audio/a-cybers-world.mp3', name: "A Cyber's World" },
    { file: 'audio/tv-world.mp3', name: 'TV World' },
    { file: 'audio/megalovania.mp3', name: 'Megalovania' }
];

let selectedSong = null;

function bindEl(id, fn) {
    const el = document.getElementById(id);
    if (el) el.onclick = fn;
}

bindEl('mute-btn', () => {
    muted = !muted;
    const muteBtn = document.getElementById('mute-btn');
    muteBtn.innerText = muted ? 'MUSIC: OFF' : 'MUSIC: ON';
    muteBtn.setAttribute('aria-pressed', String(muted));
    const music = document.getElementById('bg-music');
    if (music) {
        if (muted) {
            music.pause();
        } else if (gameState === 'PLAYING' || gameState === 'MENU') {
            music.play().catch(() => {});
        }
    }
});

bindEl('exit-levels-btn', () => showMainMenu());
bindEl('play-btn', () => showLevelMenu());
bindEl('customize-btn', () => showCustomizeMenu());
bindEl('shop-btn', () => showShopMenu());
bindEl('customize-back-btn', () => showMainMenu());
bindEl('shop-back-btn', () => showMainMenu());
bindEl('restart-btn', () => restartLevel());
bindEl('menu-btn', () => showLevelMenu());
bindEl('complete-replay-btn', () => restartLevel());
bindEl('complete-menu-btn', () => showLevelMenu());
bindEl('feedback-btn', () => {
    const overlay = document.getElementById('feedback-overlay');
    const frame = document.getElementById('feedback-frame');
    overlay.classList.remove('hidden');
    // Lazy-load the Google Form only when the panel is actually opened (after
    // it is visible, so the browser starts the request immediately).
    if (frame && !frame.getAttribute('src') && frame.dataset.src) {
        frame.src = frame.dataset.src;
    }
});
bindEl('feedback-close-btn', () => document.getElementById('feedback-overlay').classList.add('hidden'));
bindEl('feedback-ext-btn', () => window.open('https://docs.google.com/forms/d/e/1FAIpQLSfHtF4FDY2DHXI8NNPhvM4j6tvYzHIWeBlbGw7Aly58lAXVkA/viewform', '_blank'));



// Player Icon Drawing
// Ships face the direction of travel (+x) so the hull stays level while
// flying and noses up when the ship climbs (angle = vy * 3).
function shipFlame(ctx, s, x0, y0, half, length) {
    const flicker = 0.78 + 0.22 * Math.sin(performance.now() / 38);
    const tip = x0 - s * length * flicker;
    const g = ctx.createLinearGradient(x0, y0, tip, y0);
    g.addColorStop(0, '#fff6b8');
    g.addColorStop(0.45, '#ffab2e');
    g.addColorStop(1, 'rgba(255, 70, 0, 0)');
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ff7a00';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, y0 - s * half);
    ctx.lineTo(tip, y0);
    ctx.lineTo(x0, y0 + s * half);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawShipBody(ctx, shipId, s, c1, c2) {
    ctx.save();
    ctx.shadowBlur = 14;
    ctx.shadowColor = c1;
    ctx.fillStyle = c1;

    if (shipId === 'dart') {
        shipFlame(ctx, s, -s * 0.36, 0, 0.11, 0.36);
        // Slim needle hull
        ctx.beginPath();
        ctx.moveTo(s * 0.74, 0);
        ctx.lineTo(s * 0.12, -s * 0.19);
        ctx.lineTo(-s * 0.32, -s * 0.14);
        ctx.lineTo(-s * 0.32, s * 0.14);
        ctx.lineTo(s * 0.12, s * 0.19);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = c2;
        // Swept rear wings
        ctx.beginPath();
        ctx.moveTo(s * 0.02, -s * 0.15); ctx.lineTo(-s * 0.6, -s * 0.48); ctx.lineTo(-s * 0.28, -s * 0.08);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 0.02, s * 0.15); ctx.lineTo(-s * 0.6, s * 0.48); ctx.lineTo(-s * 0.28, s * 0.08);
        ctx.closePath(); ctx.fill();
        // Spine
        ctx.fillRect(-s * 0.04, -s * 0.05, s * 0.34, s * 0.1);
    } else if (shipId === 'falcon') {
        shipFlame(ctx, s, -s * 0.4, 0, 0.17, 0.3);
        // Broad fuselage
        ctx.beginPath();
        ctx.moveTo(s * 0.66, 0);
        ctx.lineTo(s * 0.22, -s * 0.25);
        ctx.lineTo(-s * 0.28, -s * 0.25);
        ctx.lineTo(-s * 0.4, 0);
        ctx.lineTo(-s * 0.28, s * 0.25);
        ctx.lineTo(s * 0.22, s * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = c2;
        // Wide falcon wings
        ctx.beginPath();
        ctx.moveTo(s * 0.08, -s * 0.22); ctx.lineTo(-s * 0.56, -s * 0.58); ctx.lineTo(-s * 0.18, -s * 0.16);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 0.08, s * 0.22); ctx.lineTo(-s * 0.56, s * 0.58); ctx.lineTo(-s * 0.18, s * 0.16);
        ctx.closePath(); ctx.fill();
        // Cockpit
        ctx.beginPath();
        ctx.ellipse(s * 0.13, 0, s * 0.16, s * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
    } else if (shipId === 'manta') {
        shipFlame(ctx, s, -s * 0.32, 0, 0.09, 0.26);
        // Flat ray body
        ctx.beginPath();
        ctx.moveTo(s * 0.58, 0);
        ctx.lineTo(s * 0.1, -s * 0.17);
        ctx.lineTo(-s * 0.26, -s * 0.11);
        ctx.lineTo(-s * 0.34, 0);
        ctx.lineTo(-s * 0.26, s * 0.11);
        ctx.lineTo(s * 0.1, s * 0.17);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = c2;
        // Long manta wings
        ctx.beginPath();
        ctx.moveTo(s * 0.06, -s * 0.13);
        ctx.quadraticCurveTo(-s * 0.24, -s * 0.56, -s * 0.64, -s * 0.42);
        ctx.quadraticCurveTo(-s * 0.36, -s * 0.14, -s * 0.26, -s * 0.06);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 0.06, s * 0.13);
        ctx.quadraticCurveTo(-s * 0.24, s * 0.56, -s * 0.64, s * 0.42);
        ctx.quadraticCurveTo(-s * 0.36, s * 0.14, -s * 0.26, s * 0.06);
        ctx.closePath(); ctx.fill();
        // Eye
        ctx.beginPath();
        ctx.arc(s * 0.24, 0, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
    } else if (shipId === 'saucer') {
        ctx.shadowBlur = 18;
        ctx.shadowColor = c2;
        ctx.fillStyle = c2;
        ctx.globalAlpha = 0.22;
        ctx.beginPath();
        ctx.ellipse(-s * 0.1, s * 0.3, s * 0.55, s * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowColor = c1;
        ctx.fillStyle = c1;
        // Disc
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.62, s * 0.23, 0, 0, Math.PI * 2);
        ctx.fill();
        // Dome
        ctx.beginPath();
        ctx.arc(-s * 0.04, 0, s * 0.24, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        // Hull lights
        ctx.fillStyle = c2;
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.arc(i * s * 0.28, s * 0.07, s * 0.05, 0, Math.PI * 2);
            ctx.fill();
        }
        // Nose light
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.beginPath();
        ctx.arc(s * 0.46, -s * 0.02, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
    } else if (shipId === 'phantom') {
        shipFlame(ctx, s, -s * 0.3, -s * 0.16, 0.07, 0.3);
        shipFlame(ctx, s, -s * 0.3, s * 0.16, 0.07, 0.3);
        // Arrow fuselage with notched tail
        ctx.beginPath();
        ctx.moveTo(s * 0.72, 0);
        ctx.lineTo(s * 0.06, -s * 0.21);
        ctx.lineTo(-s * 0.32, -s * 0.15);
        ctx.lineTo(-s * 0.18, 0);
        ctx.lineTo(-s * 0.32, s * 0.15);
        ctx.lineTo(s * 0.06, s * 0.21);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = c2;
        // Twin tail winglets
        ctx.beginPath();
        ctx.moveTo(-s * 0.16, -s * 0.11); ctx.lineTo(-s * 0.52, -s * 0.44); ctx.lineTo(-s * 0.28, -s * 0.08);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s * 0.16, s * 0.11); ctx.lineTo(-s * 0.52, s * 0.44); ctx.lineTo(-s * 0.28, s * 0.08);
        ctx.closePath(); ctx.fill();
        // Sensor eye
        ctx.beginPath();
        ctx.arc(s * 0.24, 0, s * 0.07, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Neon Rocket — the default hull
        shipFlame(ctx, s, -s * 0.42, 0, 0.15, 0.34);
        ctx.beginPath();
        ctx.moveTo(-s * 0.44, -s * 0.3);
        ctx.lineTo(s * 0.26, -s * 0.3);
        ctx.lineTo(s * 0.64, 0);
        ctx.lineTo(s * 0.26, s * 0.3);
        ctx.lineTo(-s * 0.44, s * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = c2;
        // Tail fins
        ctx.beginPath();
        ctx.moveTo(-s * 0.32, -s * 0.28); ctx.lineTo(-s * 0.02, -s * 0.58); ctx.lineTo(s * 0.06, -s * 0.28);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s * 0.32, s * 0.28); ctx.lineTo(-s * 0.02, s * 0.58); ctx.lineTo(s * 0.06, s * 0.28);
        ctx.closePath(); ctx.fill();
        // Porthole
        ctx.beginPath();
        ctx.arc(s * 0.14, 0, s * 0.11, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawIconBody(ctx, iconId, s, c1, c2) {
    const h = s / 2;

    ctx.fillStyle = c1;
    ctx.shadowBlur = 18;
    ctx.shadowColor = c1;

    if (iconId === 'round') {
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-h, -h, s, s, 7) : ctx.rect(-h, -h, s, s);
        ctx.fill();
    } else if (iconId === 'diamond') {
        ctx.save();
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-h * 0.68, -h * 0.68, s * 0.68, s * 0.68);
        ctx.restore();
    } else {
        ctx.fillRect(-h, -h, s, s);
        ctx.beginPath();
        if (iconId === 'base') {
            ctx.moveTo(-h * 0.45, -h); ctx.lineTo(0, -h * 1.42); ctx.lineTo(h * 0.45, -h);
        } else if (iconId === 'spike') {
            ctx.moveTo(-h, -h);
            ctx.lineTo(-h * 0.62, -h * 1.35); ctx.lineTo(-h * 0.28, -h);
            ctx.lineTo(0, -h * 1.35); ctx.lineTo(h * 0.28, -h);
            ctx.lineTo(h * 0.62, -h * 1.35); ctx.lineTo(h, -h);
        } else if (iconId === 'crown') {
            ctx.moveTo(-h, -h);
            ctx.lineTo(-h * 0.55, -h * 1.35); ctx.lineTo(-h * 0.25, -h);
            ctx.lineTo(0, -h * 1.35); ctx.lineTo(h * 0.25, -h);
            ctx.lineTo(h * 0.55, -h * 1.35); ctx.lineTo(h, -h);
        }
        ctx.fill();
    }

    // Secondary color band
    if (iconId !== 'diamond' && iconId !== 'crown') {
        ctx.fillStyle = c2;
        ctx.fillRect(-h, -h + s * 0.62, s, s * 0.13);
    }

    // Glow cube border
    if (iconId === 'glow') {
        ctx.strokeStyle = c2;
        ctx.lineWidth = 4;
        ctx.strokeRect(-h, -h, s, s);
    }

    // Eyes
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(-h * 0.5, -h * 0.28, s * 0.2, s * 0.3);
    ctx.fillRect(h * 0.3, -h * 0.28, s * 0.2, s * 0.3);
}

// Animate moving saws: oscillate their position based on levelX scroll
function animateMovingSaws() {
    levelData.objects.forEach(obj => {
        if (obj.type !== 'MOVE_SAW') return;
        if (obj._bx === undefined) { obj._bx = obj.x; obj._by = obj.y; }
        const amp = obj.amp || 40;
        const period = obj.period || 120;
        const phase = obj.phase || 0;
        const off = amp * Math.sin((levelX + phase) / period * Math.PI * 2);
        if (obj.axis === 'x') { obj.x = obj._bx + off; }
        else { obj.y = obj._by + off; }
    });
}

// Main Loop
function gameLoop(timestamp) {
    if (gameState !== 'PLAYING' && gameState !== 'GAMEOVER' && gameState !== 'COMPLETE') return;

    const dt = Math.max(0, Math.min(timestamp - lastTime, 100));
    lastTime = timestamp;

    // Canvas dimensions (CSS pixels). The canvas is sized by its container
    // (the picture frame), so measure the canvas itself rather than the window.
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth || window.innerWidth;
    const ch = canvas.clientHeight || window.innerHeight;

    // Resize Canvas (retina-aware)
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Clear Canvas
    ctx.clearRect(0, 0, cw, ch);

    // Draw Background & Ground
    drawWorld();

    // Animate moving saws before drawing/colliding
    animateMovingSaws();

    // Draw level objects
    drawObjects();

    // Update & Draw Player
    if (gameState === 'PLAYING') {
        // GD runs its physics at 240Hz internally (4 substeps per rendered
        // frame). Substepping keeps tight jump windows hittable and makes
        // platform-edge landings reliable.
        const SUBSTEPS = 4;
        const step = dt / SUBSTEPS;
        for (let s = 0; s < SUBSTEPS; s++) {
            // Tick-based input: ship/wave thrust applies every physics tick
            if (isKeyDown && gameState === 'PLAYING' && (player.mode === 'SHIP' || player.mode === 'WAVE')) {
                player.jump(true);
            }
            player.update(step);
            if (player.isDead || gameState !== 'PLAYING') break;
        }
        processTriggers(timestamp);
        updateHUD();

        // Level completion detection
        if (levelX >= levelData.endX) {
            completeLevel();
        }
    }
    player.draw();

    loopId = requestAnimationFrame(gameLoop);
}

function processTriggers(now) {
    activeTriggers = activeTriggers.filter(trigger => {
        const elapsed = now - trigger.startTime;
        const progress = Math.min(elapsed / trigger.duration, 1);

        levelData.objects.forEach(obj => {
            if (obj.group === trigger.targetGroup && obj.type !== 'TRIGGER_MOVE') {
                // Initialize start position for relative move
                if (!trigger.startPositions.has(obj)) {
                    trigger.startPositions.set(obj, {x: obj.x, y: obj.y});
                }
                const start = trigger.startPositions.get(obj);
                obj.x = start.x + (trigger.moveX * progress);
                obj.y = start.y + (trigger.moveY * progress);
            }
        });

        return progress < 1;
    });

    // Also auto-activate triggers based on player position
    levelData.objects.forEach(obj => {
        if (obj.type.startsWith('TRIGGER_') && !obj.activated && (player.x + levelX) >= obj.x) {
            player.handleObjectEffect(obj);
        }
    });
}

function updateHUD() {
    const totalWidth = levelData.endX || 5000;
    const progress = Math.min((levelX / totalWidth) * 100, 100);
    const bar = document.getElementById('progress-bar');
    bar.style.width = progress + '%';
    bar.setAttribute('aria-valuenow', Math.floor(progress));
    document.getElementById('score').innerText = Math.floor(progress) + '%';
}

function drawObjects() {
    ctx.save();
    ctx.translate(-levelX, 0);
    
    levelData.objects.forEach(obj => {
        if (obj.x + (obj.size || 0) - levelX < -100 || obj.x - levelX > (canvas.clientWidth || window.innerWidth) + 100) return;

        const x = obj.x;
        const y = obj.y;
        const s = obj.size;

        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';

        if (obj.type === 'SPIKE') {
            ctx.save();
            ctx.translate(x + s / 2, y + s / 2);
            ctx.rotate(((obj.rot || 0) * Math.PI) / 180);
            ctx.fillStyle = obj.color || '#ff2244';
            ctx.shadowBlur = 15;
            ctx.shadowColor = ctx.fillStyle;
            ctx.beginPath();
            ctx.moveTo(-s / 2, s / 2);
            ctx.lineTo(0, -s / 2);
            ctx.lineTo(s / 2, s / 2);
            ctx.fill();
            ctx.restore();
        } else if (obj.type === 'SAW' || obj.type === 'MOVE_SAW') {
            // Spinning saw blade: circle with teeth
            ctx.save();
            ctx.translate(x + s / 2, y + s / 2);
            const sawPhase = (levelX + (obj._bx || 0)) * 0.05;
            ctx.rotate(sawPhase);
            ctx.fillStyle = obj.color || '#ff4466';
            ctx.shadowBlur = 12;
            ctx.shadowColor = ctx.fillStyle;
            ctx.beginPath();
            ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
            ctx.fill();
            // teeth
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * s * 0.2, Math.sin(a) * s * 0.2);
                ctx.lineTo(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55);
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
            ctx.restore();
        } else if (obj.type.startsWith('ORB')) {
            ctx.fillStyle = obj.color || '#fff';
            ctx.strokeStyle = obj.type === 'ORB_BLACK' ? '#000' : ctx.fillStyle;
            ctx.beginPath();
            ctx.arc(x + s/2, y + s/2, s/3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 0.3;
            ctx.fill();
            ctx.globalAlpha = 1.0;
        } else if (obj.type.startsWith('PAD')) {
            // Jump pad: trapezoid plate with glow
            const pc = getPadColor(obj.type);
            ctx.fillStyle = pc;
            ctx.shadowBlur = 18;
            ctx.shadowColor = pc;
            ctx.beginPath();
            ctx.moveTo(x + s * 0.15, y + s * 0.95);
            ctx.lineTo(x + s * 0.85, y + s * 0.95);
            ctx.lineTo(x + s * 0.65, y + s * 0.6);
            ctx.lineTo(x + s * 0.35, y + s * 0.6);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillRect(x + s * 0.4, y + s * 0.62, s * 0.2, s * 0.12);
        } else if (obj.type.startsWith('PORTAL')) {
            ctx.fillStyle = getPortalColor(obj.type) + '44';
            ctx.strokeStyle = getPortalColor(obj.type);
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.ellipse(x + s / 2, y + s / 2, s * 0.25, s * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (obj.type.startsWith('TRIGGER')) {
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.strokeRect(x, 0, 2, canvas.clientHeight || window.innerHeight);
            ctx.setLineDash([]);
        } else {
            ctx.fillStyle = obj.color || '#fff';
            ctx.shadowBlur = 15;
            ctx.shadowColor = ctx.fillStyle;
            ctx.fillRect(x, y, s, s);
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.strokeRect(x, y, s, s);
        }
    });

    ctx.restore();
}

function getPortalColor(type) {
    if (type.includes('SHIP')) return '#39ff14';
    if (type.includes('BALL')) return '#ff00ff';
    if (type.includes('WAVE')) return '#00f3ff';
    if (type.includes('UFO')) return '#ffaa00';
    if (type.includes('SWING')) return '#ff6ef0';
    if (type.includes('CUBE')) return '#00f3ff';
    if (type.includes('TELEPORT')) return '#ffff00';
    if (type.includes('GRAVITY_UP')) return '#39d0ff';
    if (type.includes('GRAVITY_DOWN')) return '#ff9d00';
    return '#fff';
}

function getPadColor(type) {
    if (type.includes('PINK')) return '#ff6ef0';
    if (type.includes('RED')) return '#ff2244';
    return '#ffd700';
}

function drawWorld() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    // Draw Background
    ctx.fillStyle = levelData.bg || '#0a0a0a';
    ctx.fillRect(0, 0, w, h);
    
    // Draw Ground
    ctx.fillStyle = '#111';
    ctx.fillRect(0, GROUND_Y, w, h - GROUND_Y);
    
    // Ground Line (Neon Glow)
    ctx.strokeStyle = levelData.ground || varToHex('--neon-pink') || '#ff00ff';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(w, GROUND_Y);
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function varToHex(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

// Initial Setup
let levelData = LEVELS[0];
const _dpr = window.devicePixelRatio || 1;
canvas.width = (canvas.clientWidth || window.innerWidth) * _dpr;
canvas.height = (canvas.clientHeight || window.innerHeight) * _dpr;
ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);

buildLevelMenu();
buildSongSelector();
updateCurrencyDisplay();
