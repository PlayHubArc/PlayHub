window.ArcadeHub = window.ArcadeHub || {};

/* ==========================================
   1. WEB AUDIO SYNTHESIZER (Ohne externe Assets)
   ========================================== */
class SoundController {
  constructor() {
    this.enabled = localStorage.getItem('arcadehub_sound') !== 'false';
    this.ctx = null;
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('arcadehub_sound', String(this.enabled));
    return this.enabled;
  }

  play(type) {
    if (!this.enabled) return;
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      if (type === 'click' || type === 'card') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.07);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.07);
        osc.start(now);
        osc.stop(now + 0.07);
      } else if (type === 'chip') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(1650, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'win') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554.37, now + 0.09);
        osc.frequency.setValueAtTime(659.25, now + 0.18);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'lose') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.linearRampToValueAtTime(110, now + 0.25);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (_) {}
  }
}

/* ==========================================
   2. EUROPÄISCHES ROULETTE (Canvas + Setzmatte)
   ========================================== */
class EuropeanRouletteGame {
  constructor(stageEl, hub) {
    this.stageEl = stageEl;
    this.hub = hub;
    this.wheelOrder = [
      0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
      5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
    ];
    this.redNumbers = new Set([
      1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
    ]);
    this.bets = {};
    this.spinning = false;
    this.wheelAngle = 0;
    this.animFrame = null;
    this.renderUI();
    this.drawWheel();
  }

  placeBet(key, label) {
    if (this.spinning) return;
    const chip = this.hub.getSelectedChip();
    if (!this.hub.withdraw(chip, `Roulette Wette (${label})`)) {
      this.setStatus('Nicht genügend Guthaben für diesen Chip!');
      return;
    }
    this.hub.sound.play('chip');
    this.bets[key] = (this.bets[key] || 0) + chip;
    this.updateBetMarkers();
    this.setStatus(`Wette platziert: ${label} (${this.bets[key]} CR)`);
  }

  clearBets() {
    if (this.spinning) return;
    const totalRefund = Object.values(this.bets).reduce((a, b) => a + b, 0);
    if (totalRefund > 0) {
      this.hub.deposit(totalRefund, 'Roulette Wetten storniert');
    }
    this.bets = {};
    this.updateBetMarkers();
    this.setStatus('Alle Einsätze vom Tisch genommen.');
  }

  spinWheel() {
    if (this.spinning) return;
    const totalStaked = Object.values(this.bets).reduce((a, b) => a + b, 0);
    if (totalStaked === 0) {
      this.setStatus('Platziere zuerst mindestens einen Chip auf der Setzmatte!');
      return;
    }

    this.spinning = true;
    this.hub.incrementRounds();

    const rand = new Uint32Array(1);
    window.crypto.getRandomValues(rand);
    const winningIndex = rand[0] % this.wheelOrder.length;
    const winningNumber = this.wheelOrder[winningIndex];

    const sliceAngle = (Math.PI * 2) / this.wheelOrder.length;
    const targetSliceAngle =
      -Math.PI / 2 - winningIndex * sliceAngle - sliceAngle / 2;
    const extraSpins = (5 + (rand[0] % 3)) * Math.PI * 2;
    const startAngle = this.wheelAngle % (Math.PI * 2);
    const finalAngle = extraSpins + targetSliceAngle;
    const duration = 3400;
    const startTime = performance.now();

    const animate = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      // Cubic ease-out Reibungsphysik
      const easeOut = 1 - Math.pow(1 - t, 3);
      this.wheelAngle = startAngle + (finalAngle - startAngle) * easeOut;
      this.drawWheel(winningNumber, t === 1);

      if (t < 1) {
        this.animFrame = requestAnimationFrame(animate);
      } else {
        this.spinning = false;
        this.resolveBets(winningNumber);
      }
    };

    this.animFrame = requestAnimationFrame(animate);
  }

  resolveBets(winNum) {
    let totalPayout = 0;
    const isRed = this.redNumbers.has(winNum);
    const isBlack = winNum !== 0 && !isRed;

    for (const [key, stake] of Object.entries(this.bets)) {
      if (key === `n_${winNum}`) {
        totalPayout += stake * 36; // 35:1 + Einsatz
      } else if (key === 'red' && isRed) {
        totalPayout += stake * 2;
      } else if (key === 'black' && isBlack) {
        totalPayout += stake * 2;
      } else if (key === 'even' && winNum !== 0 && winNum % 2 === 0) {
        totalPayout += stake * 2;
      } else if (key === 'odd' && winNum % 2 === 1) {
        totalPayout += stake * 2;
      } else if (key === 'low' && winNum >= 1 && winNum <= 18) {
        totalPayout += stake * 2;
      } else if (key === 'high' && winNum >= 19 && winNum <= 36) {
        totalPayout += stake * 2;
      }
    }

    const colorLabel = winNum === 0 ? 'GRÜN' : isRed ? 'ROT' : 'SCHWARZ';
    if (totalPayout > 0) {
      this.hub.deposit(totalPayout, 'Roulette Gewinn');
      this.hub.sound.play('win');
      this.setStatus(
        `Kugel landet auf ${winNum} (${colorLabel}) — GEWINN: +${totalPayout} CR!`
      );
    } else {
      this.hub.sound.play('lose');
      this.setStatus(`Kugel landet auf ${winNum} (${colorLabel}) — Kein Gewinn.`);
    }

    this.bets = {};
    this.updateBetMarkers();
  }

  drawWheel() {
    const canvas = this.stageEl.querySelector('#rouletteCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = 128;
    const slice = (Math.PI * 2) / this.wheelOrder.length;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.wheelOrder.forEach((num, i) => {
      const start = this.wheelAngle + i * slice;
      const end = start + slice;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();

      if (num === 0) ctx.fillStyle = '#15803d';
      else if (this.redNumbers.has(num)) ctx.fillStyle = '#b91c1c';
      else ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + slice / 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(num), radius - 8, 3);
      ctx.restore();
    });

    // Innenkessel
    ctx.beginPath();
    ctx.arc(cx, cy, 52, 0, Math.PI * 2);
    ctx.fillStyle = '#070913';
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Kugel-Indikator oben (12 Uhr)
    ctx.beginPath();
    ctx.arc(cx, cy - radius - 8, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#00f5d4';
    ctx.fill();
  }

  updateBetMarkers() {
    this.stageEl.querySelectorAll('[data-bet]').forEach((cell) => {
      const key = cell.getAttribute('data-bet');
      const oldMarker = cell.querySelector('.r-chip-marker');
      if (oldMarker) oldMarker.remove();

      if (this.bets[key]) {
        const badge = document.createElement('span');
        badge.className = 'r-chip-marker';
        badge.textContent = this.bets[key];
        cell.appendChild(badge);
      }
    });
  }

  setStatus(msg) {
    const el = this.stageEl.querySelector('#rouletteStatus');
    if (el) el.textContent = msg;
  }

  renderUI() {
    let numbersHTML = `<div class="r-cell zero" data-bet="n_0" data-label="Zahl 0">0</div>`;
    for (let n = 1; n <= 36; n++) {
      const cls = this.redNumbers.has(n) ? 'red' : 'black';
      numbersHTML += `<div class="r-cell ${cls}" data-bet="n_${n}" data-label="Zahl ${n}">${n}</div>`;
    }

    this.stageEl.innerHTML = `
      <div class="roulette-layout">
        <div class="roulette-wheel-wrap">
          <canvas id="rouletteCanvas" width="280" height="280"></canvas>
          <div style="display:flex; gap:0.5rem;">
            <button id="rouletteSpinBtn" class="btn-neon">🎡 Kessel drehen</button>
            <button id="rouletteClearBtn" class="btn-icon" title="Einsätze löschen">🗑️</button>
          </div>
        </div>

        <div class="roulette-board">
          <div id="rouletteStatus" class="bj-status-banner">
            Klicke auf Zahlen (35:1) oder Außenwetten (1:1), um Chips zu setzen!
          </div>
          <div class="roulette-numbers-grid">${numbersHTML}</div>
          <div class="r-outside-grid">
            <div class="r-cell black" data-bet="low" data-label="1-18">1-18</div>
            <div class="r-cell black" data-bet="even" data-label="Gerade">GERADE</div>
            <div class="r-cell red" data-bet="red" data-label="Rot">ROT ◆</div>
            <div class="r-cell black" data-bet="black" data-label="Schwarz">SCHWARZ ♠</div>
            <div class="r-cell black" data-bet="odd" data-label="Ungerade">UNGERADE</div>
            <div class="r-cell black" data-bet="high" data-label="19-36">19-36</div>
          </div>
        </div>
      </div>
    `;

    this.stageEl.querySelectorAll('[data-bet]').forEach((cell) => {
      cell.addEventListener('click', () => {
        this.placeBet(
          cell.getAttribute('data-bet'),
          cell.getAttribute('data-label')
        );
      });
    });

    this.stageEl
      .querySelector('#rouletteSpinBtn')
      .addEventListener('click', () => this.spinWheel());
    this.stageEl
      .querySelector('#rouletteClearBtn')
      .addEventListener('click', () => this.clearBets());
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }
}

/* ==========================================
   3. KOOP-PLATTFORMER ("FEUER & WASSER"-KLON)
   ========================================== */
class ElementalCoopGame {
  constructor(stageEl, hub) {
    this.stageEl = stageEl;
    this.hub = hub;
    this.keys = {};
    this.animFrame = null;
    this.renderUI();
    this.resetLevel();
    this.bindEvents();
    this.loop();
  }

  resetLevel() {
    this.gateOpen = false;
    this.p1 = { x: 40, y: 310, vx: 0, vy: 0, w: 24, h: 30, grounded: false, color: '#ff2a85', name: 'Pyro' };
    this.p2 = { x: 80, y: 310, vx: 0, vy: 0, w: 24, h: 30, grounded: false, color: '#00f5d4', name: 'Aqua' };

    this.platforms = [
      { x: 0, y: 350, w: 720, h: 30 },
      { x: 0, y: 245, w: 560, h: 16 },
      { x: 160, y: 140, w: 560, h: 16 },
      { x: 610, y: 285, w: 90, h: 14 },
      { x: 30, y: 185, w: 90, h: 14 }
    ];

    this.pools = [
      { x: 220, y: 344, w: 110, h: 12, type: 'lava' },
      { x: 410, y: 344, w: 110, h: 12, type: 'water' },
      { x: 260, y: 239, w: 110, h: 12, type: 'water' }
    ];

    this.buttons = [
      { x: 480, y: 237, w: 36, h: 8 },
      { x: 220, y: 132, w: 36, h: 8 }
    ];

    this.gate = { x: 370, y: 60, w: 16, h: 80 };
    this.doors = {
      fire: { x: 590, y: 88, w: 34, h: 52 },
      water: { x: 645, y: 88, w: 34, h: 52 }
    };
  }

  bindEvents() {
    this.keyDownHandler = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      this.keys[e.key.toLowerCase()] = true;
      this.keys[e.key] = true;
    };
    this.keyUpHandler = (e) => {
      this.keys[e.key.toLowerCase()] = false;
      this.keys[e.key] = false;
    };
    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);
  }

  updatePlayer(p, left, right, jump) {
    const speed = 3.6;
    p.vx = 0;
    if ( left ) p.vx = -speed;
    if ( right ) p.vx = speed;
    if ( jump && p.grounded ) {
      p.vy = -9.6;
      p.grounded = false;
      this.hub.sound.play('click');
    }

    p.vy += 0.45; // Gravitation
    p.x = Math.max(0, Math.min(720 - p.w, p.x + p.vx));
    p.y += p.vy;
    p.grounded = false;

    const obstacles = this.gateOpen ? this.platforms : [...this.platforms, this.gate];
    for (const plat of obstacles) {
      if (
        p.x < plat.x + plat.w &&
        p.x + p.w > plat.x &&
        p.y < plat.y + plat.h &&
        p.y + p.h > plat.y
      ) {
        if (p.vy > 0 && p.y + p.h - p.vy <= plat.y + 10) {
          p.y = plat.y - p.h;
          p.vy = 0;
          p.grounded = true;
        } else if (p.vy < 0 && p.y - p.vy >= plat.y + plat.h - 10) {
          p.y = plat.y + plat.h;
          p.vy = 0;
        } else if (p.vx > 0) {
          p.x = plat.x - p.w;
        } else if (p.vx < 0) {
          p.x = plat.x + plat.w;
        }
      }
    }
  }

  overlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  update() {
    this.updatePlayer(this.p1, this.keys['a'], this.keys['d'], this.keys['w']);
    this.updatePlayer(
      this.p2,
      this.keys['ArrowLeft'],
      this.keys['ArrowRight'],
      this.keys['ArrowUp']
    );

    // Koop-Schalter prüfen
    this.gateOpen = this.buttons.some(
      (btn) => this.overlap(this.p1, btn) || this.overlap(this.p2, btn)
    );

    // Elementar-Fallen prüfen
    for (const pool of this.pools) {
      if (pool.type === 'water' && this.overlap(this.p1, pool)) {
        this.hub.sound.play('lose');
        this.setStatus('Pyro ist ins Wasser gefallen! Level neu gestartet.');
        this.resetLevel();
        return;
      }
      if (pool.type === 'lava' && this.overlap(this.p2, pool)) {
        this.hub.sound.play('lose');
        this.setStatus('Aqua ist in die Lava gefallen! Level neu gestartet.');
        this.resetLevel();
        return;
      }
    }

    // Beide Spieler am Ziel-Portal?
    if (
      this.overlap(this.p1, this.doors.fire) &&
      this.overlap(this.p2, this.doors.water)
    ) {
      this.hub.sound.play('win');
      this.hub.deposit(150, 'Koop-Level Bonus');
      this.hub.incrementCoopLevel();
      this.setStatus('KOOP-SIEG! Beide Portale erreicht (+150 CR Bonus)!');
      this.resetLevel();
    }
  }

  draw() {
    const canvas = this.stageEl.querySelector('#coopCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Plattformen
    ctx.fillStyle = '#1e293b';
    for (const plat of this.platforms) {
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    }

    // Elementar-Becken
    for (const pool of this.pools) {
      ctx.fillStyle = pool.type === 'lava' ? '#ff2a85' : '#00f5d4';
      ctx.fillRect(pool.x, pool.y, pool.w, pool.h);
    }

    // Schalter & Tor
    ctx.fillStyle = '#fbbf24';
    for (const btn of this.buttons) {
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    }
    if (!this.gateOpen) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(this.gate.x, this.gate.y, this.gate.w, this.gate.h);
    }

    // Ziel-Portale
    ctx.strokeStyle = '#ff2a85';
    ctx.lineWidth = 3;
    ctx.strokeRect(this.doors.fire.x, this.doors.fire.y, this.doors.fire.w, this.doors.fire.h);
    ctx.strokeStyle = '#00f5d4';
    ctx.strokeRect(this.doors.water.x, this.doors.water.y, this.doors.water.w, this.doors.water.h);

    // Spieler 1 (Pyro) & Spieler 2 (Aqua)
    ctx.fillStyle = this.p1.color;
    ctx.fillRect(this.p1.x, this.p1.y, this.p1.w, this.p1.h);
    ctx.fillStyle = this.p2.color;
    ctx.fillRect(this.p2.x, this.p2.y, this.p2.w, this.p2.h);
  }

  loop() {
    this.update();
    this.draw();
    this.animFrame = requestAnimationFrame(() => this.loop());
  }

  setStatus(msg) {
    const el = this.stageEl.querySelector('#coopStatus');
    if (el) el.textContent = msg;
  }

  renderUI() {
    this.stageEl.innerHTML = `
      <div class="arcade-canvas-wrap">
        <div id="coopStatus" class="bj-status-banner">
          Pyro (WASD, immun gegen Lava) + Aqua (Pfeiltasten, immun gegen Wasser) — Haltet den gelben Schalter gedrückt!
        </div>
        <canvas id="coopCanvas" class="arcade-canvas" width="720" height="380"></canvas>
      </div>
    `;
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    window.removeEventListener('keydown', this.keyDownHandler);
    window.removeEventListener('keyup', this.keyUpHandler);
  }
}

/* ==========================================
   4. CYBER SNAKE DX (Arcade-Klassiker)
   ========================================== */
class CyberSnakeGame {
  constructor(stageEl, hub) {
    this.stageEl = stageEl;
    this.hub = hub;
    this.gridSize = 20;
    this.score = 0;
    this.renderUI();
    this.reset();
    this.bindControls();
    this.interval = setInterval(() => this.tick(), 110);
  }

  reset() {
    this.snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 }
    ];
    this.dir = { x: 1, y: 0 };
    this.nextDir = { x: 1, y: 0 };
    this.score = 0;
    this.spawnFood();
  }

  spawnFood() {
    this.food = {
      x: Math.floor(Math.random() * 28),
      y: Math.floor(Math.random() * 18)
    };
  }

  bindControls() {
    this.keyHandler = (e) => {
      const k = e.key.toLowerCase();
      if ((k === 'arrowup' || k === 'w') && this.dir.y === 0) this.nextDir = { x: 0, y: -1 };
      if ((k === 'arrowdown' || k === 's') && this.dir.y === 0) this.nextDir = { x: 0, y: 1 };
      if ((k === 'arrowleft' || k === 'a') && this.dir.x === 0) this.nextDir = { x: -1, y: 0 };
      if ((k === 'arrowright' || k === 'd') && this.dir.x === 0) this.nextDir = { x: 1, y: 0 };
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  tick() {
    this.dir = this.nextDir;
    const head = {
      x: (this.snake[0].x + this.dir.x + 28) % 28,
      y: (this.snake[0].y + this.dir.y + 18) % 18
    };

    if (this.snake.some((s) => s.x === head.x && s.y === head.y)) {
      this.hub.sound.play('lose');
      this.reset();
      return;
    }

    this.snake.unshift(head);
    if (head.x === this.food.x && head.y === this.food.y) {
      this.score += 10;
      this.hub.sound.play('win');
      this.hub.deposit(5, 'Snake Energie-Kern');
      this.hub.updateSnakeHighscore(this.score);
      this.spawnFood();
    } else {
      this.snake.pop();
    }

    this.draw();
  }

  draw() {
    const canvas = this.stageEl.querySelector('#snakeCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ff2a85';
    ctx.fillRect(this.food.x * 20 + 2, this.food.y * 20 + 2, 16, 16);

    this.snake.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#00f5d4' : '#8b5cf6';
      ctx.fillRect(seg.x * 20 + 1, seg.y * 20 + 1, 18, 18);
    });

    const scoreEl = this.stageEl.querySelector('#snakeScore');
    if (scoreEl) scoreEl.textContent = `SCORE: ${this.score} (+5 CR pro Kern)`;
  }

  renderUI() {
    this.stageEl.innerHTML = `
      <div class="arcade-canvas-wrap">
        <div id="snakeScore" class="bj-status-banner">SCORE: 0</div>
        <canvas id="snakeCanvas" class="arcade-canvas" width="560" height="360"></canvas>
        <div class="touch-controls">
          <button class="btn-icon" data-dir="up">▲</button>
          <button class="btn-icon" data-dir="left">◀</button>
          <button class="btn-icon" data-dir="down">▼</button>
          <button class="btn-icon" data-dir="right">▶</button>
        </div>
      </div>
    `;

    this.stageEl.querySelectorAll('[data-dir]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const d = btn.getAttribute('data-dir');
        if (d === 'up' && this.dir.y === 0) this.nextDir = { x: 0, y: -1 };
        if (d === 'down' && this.dir.y === 0) this.nextDir = { x: 0, y: 1 };
        if (d === 'left' && this.dir.x === 0) this.nextDir = { x: -1, y: 0 };
        if (d === 'right' && this.dir.x === 0) this.nextDir = { x: 1, y: 0 };
      });
    });
  }

  destroy() {
    clearInterval(this.interval);
    window.removeEventListener('keydown', this.keyHandler);
  }
}

/* ==========================================
   5. RETRO DOOM / 3D RAYCASTER & IFRAME CONTAINER
   ========================================== */
class Retro3DContainer {
  constructor(stageEl, hub, mode) {
    this.stageEl = stageEl;
    this.hub = hub;
    this.mode = mode;
    this.px = 3.5;
    this.py = 3.5;
    this.pa = 0;
    this.keys = {};
    this.map = [
      [1,1,1,1,1,1,1,1],
      [1,0,0,0,0,1,0,1],
      [1,0,1,0,0,0,0,1],
      [1,0,1,0,0,1,0,1],
      [1,0,0,0,0,0,0,1],
      [1,0,1,1,0,1,0,1],
      [1,0,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,1]
    ];
    this.renderUI();
  }

  startBuiltinRaycaster() {
    const holder = this.stageEl.querySelector('#retroViewport');
    holder.innerHTML = `<canvas id="rayCanvas" class="arcade-canvas" width="640" height="360"></canvas>`;
    const canvas = holder.querySelector('#rayCanvas');
    const ctx = canvas.getContext('2d');

    this.kd = (e) => { this.keys[e.key.toLowerCase()] = true; };
    this.ku = (e) => { this.keys[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);

    const loop = () => {
      if (this.keys['a'] || this.keys['arrowleft']) this.pa -= 0.045;
      if (this.keys['d'] || this.keys['arrowright']) this.pa += 0.045;
      const move = (this.keys['w'] || this.keys['arrowup'] ? 0.06 : 0) -
                   (this.keys['s'] || this.keys['arrowdown'] ? 0.06 : 0);
      const nx = this.px + Math.cos(this.pa) * move;
      const ny = this.py + Math.sin(this.pa) * move;
      if (this.map[Math.floor(ny)][Math.floor(nx)] === 0) {
        this.px = nx;
        this.py = ny;
      }

      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, 640, 180);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 180, 640, 180);

      const numRays = 160;
      const fov = Math.PI / 3;
      for (let r = 0; r < numRays; r++) {
        const rayAngle = this.pa - fov / 2 + (r / numRays) * fov;
        let dist = 0;
        let hit = false;
        while (!hit && dist < 10) {
          dist += 0.03;
          const tx = Math.floor(this.px + Math.cos(rayAngle) * dist);
          const ty = Math.floor(this.py + Math.sin(rayAngle) * dist);
          if (this.map[ty] && this.map[ty][tx] === 1) hit = true;
        }
        const corrected = dist * Math.cos(rayAngle - this.pa);
        const wallH = Math.min(360, 260 / corrected);
        const shade = Math.max(30, 230 - corrected * 28);
        ctx.fillStyle = this.mode === 'doom'
          ? `rgb(${shade}, 30, 65)`
          : `rgb(0, ${shade}, ${shade})`;
        ctx.fillRect(r * 4, 180 - wallH / 2, 4, wallH);
      }

      this.anim = requestAnimationFrame(loop);
    };
    loop();
  }

  renderUI() {
    const defaultUrl = this.mode === 'doom'
      ? 'https://dos.zone/player/?bundleUrl=https%3A%2F%2Fcdn.dos.zone%2Fcustom%2Fdos%2Fdoom.jsdos?anonymous=1'
      : 'https://hexgl.bkcore.com/play/';

    this.stageEl.innerHTML = `
      <div class="arcade-canvas-wrap">
        <div style="display:flex; gap:0.6rem; flex-wrap:wrap; justify-content:center;">
          <button id="runRaycasterBtn" class="btn-neon">🕹️ Integrierte 3D-Raycaster-Engine (WASD)</button>
          <button id="loadIframeBtn" class="btn-neon">🌐 Externen WebAssembly / WebGL Stream laden</button>
        </div>
        <div id="retroViewport" style="width:100%; display:flex; justify-content:center; margin-top:0.5rem;"></div>
      </div>
    `;

    this.stageEl.querySelector('#runRaycasterBtn').addEventListener('click', () => {
      if (this.anim) cancelAnimationFrame(this.anim);
      this.startBuiltinRaycaster();
    });

    this.stageEl.querySelector('#loadIframeBtn').addEventListener('click', () => {
      if (this.anim) cancelAnimationFrame(this.anim);
      const holder = this.stageEl.querySelector('#retroViewport');
      holder.innerHTML = `
        <iframe src="${defaultUrl}" width="760" height="420"
          style="border:2px solid var(--neon-cyan); border-radius:12px; background:#000;"
          allowfullscreen></iframe>
      `;
    });

    this.startBuiltinRaycaster();
  }

  destroy() {
    if (this.anim) cancelAnimationFrame(this.anim);
    if (this.kd) window.removeEventListener('keydown', this.kd);
    if (this.ku) window.removeEventListener('keyup', this.ku);
  }
}

/* ==========================================
   6. HAUPT-PORTAL & BANKROLL-CONTROLLER
   ========================================== */
class ArcadeHubApp {
  constructor() {
    this.sound = new SoundController();
    this.selectedChip = 10;
    this.activeCategory = 'all';
    this.activeGameInstance = null;

    this.balance = this.loadNumber('arcadehub_balance', 1000);
    this.peakBalance = this.loadNumber('arcadehub_peak', Math.max(1000, this.balance));
    this.roundsPlayed = this.loadNumber('arcadehub_rounds', 0);
    this.coopLevels = this.loadNumber('arcadehub_coop', 0);
    this.snakeHigh = this.loadNumber('arcadehub_snake_high', 0);
    this.favorites = new Set(
      JSON.parse(localStorage.getItem('arcadehub_favs') || '[]')
    );

    this.gamesCatalog = [
      {
        id: 'blackjack',
        title: 'Neon Blackjack (17 & 4)',
        category: 'casino',
        tag: 'Casino • 3:2 Payout',
        icon: '🃏',
        gradient: 'linear-gradient(135deg, #064e3b, #0f172a)',
        desc: '52-Karten-Deck mit kryptografischem Fisher-Yates-Shuffle, Hit, Stand & Double Down.',
        rules: 'Ziel ist 21 Punkte. Dealer zieht bis mindestens 17. Blackjack zahlt 3:2, regulärer Sieg 1:1.',
        hasBetting: true
      },
      {
        id: 'slots',
        title: 'Cyber Slots 777',
        category: 'casino',
        tag: 'Casino • 3 Walzen',
        icon: '🎰',
        gradient: 'linear-gradient(135deg, #701a75, #1e1b4b)',
        desc: '3-Walzen-Automat mit CSS-Transform-Reels, Lucky 7 Jackpot und dynamischer Paytable.',
        rules: 'Wähle deinen Chip-Einsatz und drücke Spin. 3 gleiche Symbole zahlen bis zu 50x, 2 Kirschen 2x.',
        hasBetting: true
      },
      {
        id: 'roulette',
        title: 'Europäisches Roulette',
        category: 'casino',
        tag: 'Casino • Single Zero',
        icon: '🎡',
        gradient: 'linear-gradient(135deg, #7f1d1d, #0f172a)',
        desc: 'Animierter Canvas-Roulettekessel mit Auslauf-Reibung, Einzelzahlen (35:1) und Außenwetten.',
        rules: 'Platziere Chips auf Zahlen (0-36, Quote 35:1) oder Außenfeldern (Rot/Schwarz, Gerade/Ungerade, 1:1).',
        hasBetting: true
      },
      {
        id: 'coop',
        title: 'Pyro & Aqua: Elemental Temple',
        category: 'coop',
        tag: '2-Spieler Koop',
        icon: '🔥',
        gradient: 'linear-gradient(135deg, #be123c, #0284c7)',
        desc: 'Lokaler 2-Spieler-Plattformer auf einer Tastatur mit Elementar-Fallen und Koop-Schaltern.',
        rules: 'Spieler 1 (Pyro): WASD. Spieler 2 (Aqua): Pfeiltasten. Öffnet gemeinsam das Tor und erreicht beide Portale (+150 CR).',
        hasBetting: false
      },
      {
        id: 'snake',
        title: 'Cyber Snake DX',
        category: 'retro',
        tag: 'Retro Arcade',
        icon: '🐍',
        gradient: 'linear-gradient(135deg, #0f766e, #1e1b4b)',
        desc: 'Klassisches Highspeed-Snake auf HTML5-Canvas mit Touch-D-Pad und Credit-Belohnungen.',
        rules: 'Steuerung per WASD, Pfeiltasten oder Touch-Buttons. Jeder gesammelte Energiekern bringt +5 CR.',
        hasBetting: false
      },
      {
        id: 'doom',
        title: 'DOOM Shareware / 3D Corridor',
        category: 'retro',
        tag: 'DOS / Raycaster',
        icon: '👹',
        gradient: 'linear-gradient(135deg, #450a0a, #18181b)',
        desc: 'Integrierter 3D-Raycaster-Korridor sowie JS-DOS WebAssembly-Loader für den Shooter-Klassiker.',
        rules: 'Steuere mit WASD oder Pfeiltasten direkt durch das 3D-Labyrinth oder wechsle zum JS-DOS Stream.',
        hasBetting: false
      },
      {
        id: 'webgl',
        title: 'HexGL / Cyber Arena 3D',
        category: 'retro',
        tag: 'WebGL / 3D Demake',
        icon: '🚀',
        gradient: 'linear-gradient(135deg, #312e81, #090d16)',
        desc: '3D-WebGL-Container mit integriertem Offline-Cyber-Raycaster und Three.js/WebGL-Stream.',
        rules: 'Nutze WASD / Pfeiltasten zur Navigation im 3D-Raum oder lade das externe WebGL-Rennspiel.',
        hasBetting: false
      }
    ];

    this.initDOM();
    this.syncWalletUI();
    this.renderCatalog();
  }

  loadNumber(key, fallback) {
    const raw = localStorage.getItem(key);
    const parsed = raw !== null ? parseInt(raw, 10) : NaN;
    return Number.isNaN(parsed) ? fallback : parsed;
  }

  /* --- Bankroll API --- */
  getBalance() {
    return this.balance;
  }

  deposit(amount, reason = '') {
    const val = Math.max(0, Math.floor(amount));
    this.balance += val;
    if (this.balance > this.peakBalance) {
      this.peakBalance = this.balance;
      localStorage.setItem('arcadehub_peak', String(this.peakBalance));
    }
    localStorage.setItem('arcadehub_balance', String(this.balance));
    this.syncWalletUI();
    if (reason) this.showToast(`+${val} CR (${reason})`);
    return this.balance;
  }

  withdraw(amount, reason = '') {
    const val = Math.max(0, Math.floor(amount));
    if (this.balance < val) return false;
    this.balance -= val;
    localStorage.setItem('arcadehub_balance', String(this.balance));
    this.syncWalletUI();
    return true;
  }

  freeReload() {
    if (this.balance > 0) return;
    this.sound.play('win');
    this.deposit(500, 'Bankrott-Schutz Free Reload');
  }

  getSelectedChip() {
    return this.selectedChip;
  }

  incrementRounds() {
    this.roundsPlayed += 1;
    localStorage.setItem('arcadehub_rounds', String(this.roundsPlayed));
    this.syncWalletUI();
  }

  incrementCoopLevel() {
    this.coopLevels += 1;
    localStorage.setItem('arcadehub_coop', String(this.coopLevels));
    this.syncWalletUI();
  }

  updateSnakeHighscore(score) {
    if (score > this.snakeHigh) {
      this.snakeHigh = score;
      localStorage.setItem('arcadehub_snake_high', String(this.snakeHigh));
      this.syncWalletUI();
    }
  }

  syncWalletUI() {
    document.getElementById('headerBalance').textContent = this.balance;
    document.getElementById('modalBalance').textContent = this.balance;
    document.getElementById('statRounds').textContent = this.roundsPlayed;
    document.getElementById('statPeakBalance').textContent = `${this.peakBalance} CR`;
    document.getElementById('statCoopLevels').textContent = this.coopLevels;
    document.getElementById('statSnakeHigh').textContent = this.snakeHigh;
    document.getElementById('favCount').textContent = this.favorites.size;

    const isBankrupt = this.balance <= 0;
    document.getElementById('reloadBtn').classList.toggle('hidden', !isBankrupt);
    document.getElementById('modalReloadBtn').classList.toggle('hidden', !isBankrupt);
  }

  initDOM() {
    // Kategorien
    document.querySelectorAll('.cat-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cat-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeCategory = btn.getAttribute('data-category');
        this.renderCatalog();
      });
    });

    // Suche
    document.getElementById('gameSearch').addEventListener('input', () => {
      this.renderCatalog();
    });

    // Reload Buttons
    document.getElementById('reloadBtn').addEventListener('click', () => this.freeReload());
    document.getElementById('modalReloadBtn').addEventListener('click', () => this.freeReload());

    // Sound Buttons
    const updateSoundIcons = () => {
      const icon = this.sound.enabled ? '🔊' : '🔇';
      document.getElementById('soundToggleHeader').textContent = icon;
      document.getElementById('modalSoundBtn').textContent = icon;
    };
    updateSoundIcons();

    document.getElementById('soundToggleHeader').addEventListener('click', () => {
      this.sound.toggle();
      updateSoundIcons();
    });
    document.getElementById('modalSoundBtn').addEventListener('click', () => {
      this.sound.toggle();
      updateSoundIcons();
    });

    // Chip-Auswahl
    document.querySelectorAll('.chip').forEach((chipBtn) => {
      chipBtn.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        chipBtn.classList.add('active');
        this.selectedChip = parseInt(chipBtn.getAttribute('data-value'), 10);
        document.getElementById('selectedChipLabel').textContent = `${this.selectedChip} CR`;
        this.sound.play('chip');
        window.dispatchEvent(new CustomEvent('arcadehub:chipchange'));
      });
    });

    // Modal Steuerung
    document.getElementById('modalCloseBtn').addEventListener('click', () => this.closeModal());
    document.getElementById('modalRulesBtn').addEventListener('click', () => {
      document.getElementById('modalRulesDrawer').classList.toggle('hidden');
    });
    document.getElementById('modalFullscreenBtn').addEventListener('click', () => {
      const modalWin = document.getElementById('modalContainer');
      if (!document.fullscreenElement) {
        modalWin.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  toggleFavorite(gameId) {
    if (this.favorites.has(gameId)) {
      this.favorites.delete(gameId);
    } else {
      this.favorites.add(gameId);
    }
    localStorage.setItem('arcadehub_favs', JSON.stringify([...this.favorites]));
    this.syncWalletUI();
    this.renderCatalog();
  }

  renderCatalog() {
    const grid = document.getElementById('gamesGrid');
    const query = document.getElementById('gameSearch').value.trim().toLowerCase();

    const filtered = this.gamesCatalog.filter((g) => {
      const matchesCat =
        this.activeCategory === 'all' ||
        (this.activeCategory === 'favorites' && this.favorites.has(g.id)) ||
        g.category === this.activeCategory;
      const matchesQuery =
        !query ||
        g.title.toLowerCase().includes(query) ||
        g.desc.toLowerCase().includes(query);
      return matchesCat && matchesQuery;
    });

    grid.innerHTML = filtered
      .map((g) => {
        const isFav = this.favorites.has(g.id);
        return `
          <article class="game-card glass-panel">
            <div class="card-banner" style="background: ${g.gradient}">
              <span>${g.icon}</span>
              <button class="fav-toggle ${isFav ? 'active' : ''}" data-fav="${g.id}" title="Favorit">★</button>
              <span class="card-tag">${g.tag}</span>
            </div>
            <div class="card-body">
              <h3 class="card-title">${g.title}</h3>
              <p class="card-desc">${g.desc}</p>
              <div class="card-footer">
                <span class="card-meta">${g.hasBetting ? '◈ Casino-Währung' : '🎮 Direkt spielbar'}</span>
                <button class="btn-neon" data-play="${g.id}">Spielen</button>
              </div>
            </div>
          </article>
        `;
      })
      .join('');

    grid.querySelectorAll('[data-fav]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFavorite(btn.getAttribute('data-fav'));
      });
    });

    grid.querySelectorAll('[data-play]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.openGame(btn.getAttribute('data-play'));
      });
    });
  }

  openGame(gameId) {
    const gameMeta = this.gamesCatalog.find((g) => g.id === gameId);
    if (!gameMeta) return;

    this.closeModal();
    this.sound.play('click');

    document.getElementById('modalGameTitle').textContent = gameMeta.title;
    document.getElementById('modalCategoryBadge').textContent = gameMeta.tag;
    document.getElementById('modalRulesText').textContent = gameMeta.rules;
    document.getElementById('modalRulesDrawer').classList.add('hidden');
    document.getElementById('modalBettingBar').classList.toggle('hidden', !gameMeta.hasBetting);
    document.getElementById('gameModal').classList.remove('hidden');

    const stage = document.getElementById('gameStage');
    stage.innerHTML = '';

    if (gameId === 'blackjack') {
      this.activeGameInstance = new window.ArcadeHub.BlackjackGame(stage, this);
    } else if (gameId === 'slots') {
      this.activeGameInstance = new window.ArcadeHub.SlotMachineGame(stage, this);
    } else if (gameId === 'roulette') {
      this.activeGameInstance = new EuropeanRouletteGame(stage, this);
    } else if (gameId === 'coop') {
      this.activeGameInstance = new ElementalCoopGame(stage, this);
    } else if (gameId === 'snake') {
      this.activeGameInstance = new CyberSnakeGame(stage, this);
    } else if (gameId === 'doom') {
      this.activeGameInstance = new Retro3DContainer(stage, this, 'doom');
    } else if (gameId === 'webgl') {
      this.activeGameInstance = new Retro3DContainer(stage, this, 'webgl');
    }
  }

  closeModal() {
    if (this.activeGameInstance && typeof this.activeGameInstance.destroy === 'function') {
      this.activeGameInstance.destroy();
    }
    this.activeGameInstance = null;
    document.getElementById('gameModal').classList.add('hidden');
  }

  showToast(message) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.ArcadeHub.app = new ArcadeHubApp();
});
