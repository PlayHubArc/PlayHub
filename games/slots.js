window.ArcadeHub = window.ArcadeHub || {};

class SlotMachineGame {
  constructor(stageEl, hub) {
    this.stageEl = stageEl;
    this.hub = hub;
    this.spinning = false;
    this.timers = [];
    this.symbols = [
      { icon: '7️⃣', name: 'Lucky 7', weight: 2, mult3: 50 },
      { icon: '🎰', name: 'BAR', weight: 4, mult3: 25 },
      { icon: '🔔', name: 'Glocke', weight: 6, mult3: 15 },
      { icon: '🍇', name: 'Traube', weight: 9, mult3: 10 },
      { icon: '🍊', name: 'Orange', weight: 11, mult3: 8 },
      { icon: '🍋', name: 'Zitrone', weight: 13, mult3: 5 },
      { icon: '🍒', name: 'Kirsche', weight: 15, mult3: 4 }
    ];
    this.renderUI();
  }

  randomSymbol() {
    const totalWeight = this.symbols.reduce((acc, s) => acc + s.weight, 0);
    const randArr = new Uint32Array(1);
    window.crypto.getRandomValues(randArr);
    let pick = randArr[0] % totalWeight;

    for (const sym of this.symbols) {
      if (pick < sym.weight) return sym;
      pick -= sym.weight;
    }
    return this.symbols[this.symbols.length - 1];
  }

  spin() {
    if (this.spinning) return;
    const bet = this.hub.getSelectedChip();

    if (!this.hub.withdraw(bet, 'Neon Slots Spin')) {
      this.setStatus('Nicht genügend Credits für diesen Spin!');
      return;
    }

    this.spinning = true;
    this.hub.incrementRounds();
    this.stageEl.querySelector('#slotSpinBtn').disabled = true;
    this.setStatus(`Walzen drehen... (Einsatz: ${bet} CR)`);
    this.hub.sound.play('click');

    const results = [this.randomSymbol(), this.randomSymbol(), this.randomSymbol()];
    const strips = this.stageEl.querySelectorAll('.slot-strip');

    strips.forEach((strip, reelIdx) => {
      const sequence = [];
      const spinLength = 14 + reelIdx * 5;
      for (let i = 0; i < spinLength - 1; i++) {
        sequence.push(this.randomSymbol().icon);
      }
      sequence.push(results[reelIdx].icon);

      strip.style.transition = 'none';
      strip.style.transform = 'translateY(0)';
      strip.innerHTML = sequence
        .map((icon) => `<div class="slot-symbol">${icon}</div>`)
        .join('');

      // Reflow erzwingen und CSS-Walzentransformation starten
      void strip.offsetHeight;
      const duration = 1.1 + reelIdx * 0.38;
      strip.style.transition = `transform ${duration}s cubic-bezier(0.15, 0.85, 0.25, 1.02)`;
      strip.style.transform = `translateY(-${(sequence.length - 1) * 120}px)`;

      const t = setTimeout(() => {
        this.hub.sound.play('card');
      }, duration * 1000);
      this.timers.push(t);
    });

    const evalTimer = setTimeout(() => {
      this.evaluateSpin(results, bet);
    }, 2000);
    this.timers.push(evalTimer);
  }

  evaluateSpin(results, bet) {
    this.spinning = false;
    this.stageEl.querySelector('#slotSpinBtn').disabled = false;

    const [r1, r2, r3] = results;
    let multiplier = 0;
    let winText = '';

    if (r1.icon === r2.icon && r2.icon === r3.icon) {
      multiplier = r1.mult3;
      winText = `JACKPOT-LINIE: 3x ${r1.icon} (${multiplier}x)`;
    } else if (
      [r1.icon, r2.icon, r3.icon].filter((i) => i === '🍒').length === 2
    ) {
      multiplier = 2;
      winText = '2x Kirschen-Bonus (2x)';
    } else if (r1.icon === r2.icon || r2.icon === r3.icon) {
      multiplier = 1.5;
      winText = 'Doppel-Treffer auf Nachbarwalzen (1.5x)';
    }

    if (multiplier > 0) {
      const winAmount = Math.floor(bet * multiplier);
      this.hub.deposit(winAmount, 'Slot Gewinn');
      this.hub.sound.play('win');
      this.setStatus(`${winText} — GEWINN: +${winAmount} CR!`);
    } else {
      this.setStatus('Kein Linientreffer. Versuche es erneut!');
    }
  }

  setStatus(text) {
    const el = this.stageEl.querySelector('#slotStatus');
    if (el) el.textContent = text;
  }

  updatePaytable() {
    const bet = this.hub.getSelectedChip();
    const grid = this.stageEl.querySelector('#slotPaytable');
    if (!grid) return;

    grid.innerHTML = this.symbols
      .map(
        (s) => `
        <div class="pay-item">
          <span>${s.icon} ${s.icon} ${s.icon}</span>
          <strong>${s.mult3 * bet} CR</strong>
        </div>
      `
      )
      .join('');
  }

  renderUI() {
    this.stageEl.innerHTML = `
      <div class="slot-cabinet">
        <div class="slot-window">
          <div class="slot-reel"><div class="slot-strip"><div class="slot-symbol">7️⃣</div></div></div>
          <div class="slot-reel"><div class="slot-strip"><div class="slot-symbol">7️⃣</div></div></div>
          <div class="slot-reel"><div class="slot-strip"><div class="slot-symbol">7️⃣</div></div></div>
        </div>

        <div id="slotStatus" class="bj-status-banner">
          Wähle deinen Chip-Einsatz für die dynamische Auszahlungstabelle!
        </div>

        <button id="slotSpinBtn" class="btn-neon" style="font-size:1.1rem; padding:0.75rem 2.2rem;">
          🎰 WALZEN DREHEN (SPIN)
        </button>

        <div id="slotPaytable" class="paytable-grid"></div>
      </div>
    `;

    this.stageEl
      .querySelector('#slotSpinBtn')
      .addEventListener('click', () => this.spin());

    this.chipListener = () => this.updatePaytable();
    window.addEventListener('arcadehub:chipchange', this.chipListener);
    this.updatePaytable();
  }

  destroy() {
    this.timers.forEach((t) => clearTimeout(t));
    window.removeEventListener('arcadehub:chipchange', this.chipListener);
  }
}

window.ArcadeHub.SlotMachineGame = SlotMachineGame;
