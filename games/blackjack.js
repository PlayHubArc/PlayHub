window.ArcadeHub = window.ArcadeHub || {};

class BlackjackGame {
  constructor(stageEl, hub) {
    this.stageEl = stageEl;
    this.hub = hub;
    this.deck = [];
    this.playerHand = [];
    this.dealerHand = [];
    this.currentBet = 0;
    this.inRound = false;
    this.dealerHidden = true;
    this.renderUI();
  }

  // Kryptografisch sicherer Zufallsindex
  randomInt(max) {
    const array = new Uint32Array(1);
    window.crypto.getRandomValues(array);
    return array[0] % max;
  }

  buildAndShuffleDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    this.deck = [];

    for (const suit of suits) {
      for (const rank of ranks) {
        this.deck.push({ suit, rank });
      }
    }

    // Fisher-Yates-Shuffle
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = this.randomInt(i + 1);
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  drawCard() {
    if (this.deck.length < 10) {
      this.buildAndShuffleDeck();
    }
    return this.deck.pop();
  }

  calculateScore(hand, hideSecondCard = false) {
    let total = 0;
    let aces = 0;
    const cards = hideSecondCard ? [hand[0]] : hand;

    for (const card of cards) {
      if (!card) continue;
      if (card.rank === 'A') {
        aces += 1;
        total += 11;
      } else if (['K', 'Q', 'J'].includes(card.rank)) {
        total += 10;
      } else {
        total += parseInt(card.rank, 10);
      }
    }

    while (total > 21 && aces > 0) {
      total -= 10;
      aces -= 1;
    }
    return total;
  }

  startRound() {
    if (this.inRound) return;
    const chipValue = this.hub.getSelectedChip();

    if (!this.hub.withdraw(chipValue, 'Blackjack Einsatz')) {
      this.setStatus('Nicht genügend Credits! Nutze kleinere Chips oder Reload.');
      return;
    }

    this.hub.incrementRounds();
    this.currentBet = chipValue;
    this.inRound = true;
    this.dealerHidden = true;

    if (this.deck.length < 15) {
      this.buildAndShuffleDeck();
    }

    this.playerHand = [this.drawCard(), this.drawCard()];
    this.dealerHand = [this.drawCard(), this.drawCard()];
    this.hub.sound.play('card');

    this.updateTable();

    const playerScore = this.calculateScore(this.playerHand);
    if (playerScore === 21) {
      this.stand();
    } else {
      this.setStatus(`Einsatz: ${this.currentBet} CR — Deine Entscheidung!`);
    }
  }

  hit() {
    if (!this.inRound) return;
    this.playerHand.push(this.drawCard());
    this.hub.sound.play('card');
    this.updateTable();

    const score = this.calculateScore(this.playerHand);
    if (score > 21) {
      this.endRound('bust');
    } else if (score === 21) {
      this.stand();
    }
  }

  doubleDown() {
    if (!this.inRound || this.playerHand.length !== 2) return;
    if (!this.hub.withdraw(this.currentBet, 'Blackjack Double Down')) {
      this.setStatus('Nicht genügend Guthaben zum Verdoppeln!');
      return;
    }

    this.currentBet *= 2;
    this.playerHand.push(this.drawCard());
    this.hub.sound.play('chip');
    this.updateTable();

    const score = this.calculateScore(this.playerHand);
    if (score > 21) {
      this.endRound('bust');
    } else {
      this.stand();
    }
  }

  stand() {
    if (!this.inRound) return;
    this.dealerHidden = false;

    // Dealer muss ziehen bis mindestens 17
    while (this.calculateScore(this.dealerHand) < 17) {
      this.dealerHand.push(this.drawCard());
    }

    this.updateTable();
    const pScore = this.calculateScore(this.playerHand);
    const dScore = this.calculateScore(this.dealerHand);
    const isNaturalBJ = pScore === 21 && this.playerHand.length === 2;
    const isDealerNaturalBJ = dScore === 21 && this.dealerHand.length === 2;

    if (isNaturalBJ && !isDealerNaturalBJ) {
      this.endRound('blackjack');
    } else if (dScore > 21 || pScore > dScore) {
      this.endRound('win');
    } else if (pScore === dScore) {
      this.endRound('push');
    } else {
      this.endRound('lose');
    }
  }

  endRound(outcome) {
    this.inRound = false;
    this.dealerHidden = false;
    this.updateTable();

    if (outcome === 'blackjack') {
      const payout = Math.floor(this.currentBet * 2.5); // 3:2 Auszahlung + Einsatz zurück
      this.hub.deposit(payout, 'Blackjack 3:2 Gewinn');
      this.hub.sound.play('win');
      this.setStatus(`BLACKJACK! Auszahlung 3:2 (+${payout} CR)`);
    } else if (outcome === 'win') {
      const payout = this.currentBet * 2;
      this.hub.deposit(payout, 'Blackjack Gewinn');
      this.hub.sound.play('win');
      this.setStatus(`Gewonnen! Du erhältst ${payout} CR.`);
    } else if (outcome === 'push') {
      this.hub.deposit(this.currentBet, 'Blackjack Unentschieden');
      this.setStatus(`Unentschieden (Push)! Einsatz (${this.currentBet} CR) zurück.`);
    } else if (outcome === 'bust') {
      this.hub.sound.play('lose');
      this.setStatus(`Überkauft (>21)! ${this.currentBet} CR verloren.`);
    } else {
      this.hub.sound.play('lose');
      this.setStatus(`Dealer gewinnt! ${this.currentBet} CR verloren.`);
    }
  }

  renderCardHTML(card, hidden = false) {
    if (hidden) {
      return `<div class="playing-card hidden-card"></div>`;
    }
    const isRed = card.suit === '♥' || card.suit === '♦';
    return `
      <div class="playing-card ${isRed ? 'red' : ''}">
        <div>${card.rank}${card.suit}</div>
        <div class="card-Center">${card.suit}</div>
        <div style="align-self:flex-end">${card.rank}${card.suit}</div>
      </div>
    `;
  }

  setStatus(msg) {
    const el = this.stageEl.querySelector('#bjStatus');
    if (el) el.textContent = msg;
  }

  updateTable() {
    const dealerCardsEl = this.stageEl.querySelector('#bjDealerCards');
    const playerCardsEl = this.stageEl.querySelector('#bjPlayerCards');
    const dealerScoreEl = this.stageEl.querySelector('#bjDealerScore');
    const playerScoreEl = this.stageEl.querySelector('#bjPlayerScore');

    dealerCardsEl.innerHTML = this.dealerHand
      .map((c, idx) => this.renderCardHTML(c, idx === 1 && this.dealerHidden))
      .join('');
    playerCardsEl.innerHTML = this.playerHand
      .map((c) => this.renderCardHTML(c, false))
      .join('');

    dealerScoreEl.textContent = this.dealerHand.length
      ? this.calculateScore(this.dealerHand, this.dealerHidden)
      : '0';
    playerScoreEl.textContent = this.playerHand.length
      ? this.calculateScore(this.playerHand, false)
      : '0';

    this.stageEl.querySelector('#bjDealBtn').disabled = this.inRound;
    this.stageEl.querySelector('#bjHitBtn').disabled = !this.inRound;
    this.stageEl.querySelector('#bjStandBtn').disabled = !this.inRound;
    this.stageEl.querySelector('#bjDoubleBtn').disabled =
      !this.inRound || this.playerHand.length !== 2;
  }

  renderUI() {
    this.stageEl.innerHTML = `
      <div class="bj-table">
        <div class="bj-zone">
          <div class="bj-zone-header">
            <span>DEALER (Zieht bis 17)</span>
            <span id="bjDealerScore" class="bj-score-badge">0</span>
          </div>
          <div id="bjDealerCards" class="bj-cards"></div>
        </div>

        <div id="bjStatus" class="bj-status-banner">
          Wähle unten deinen Einsatz-Chip und klicke auf "Karten geben"
        </div>

        <div class="bj-zone">
          <div id="bjPlayerCards" class="bj-cards"></div>
          <div class="bj-zone-header">
            <span>SPIELER HAND</span>
            <span id="bjPlayerScore" class="bj-score-badge">0</span>
          </div>
        </div>

        <div class="bj-controls">
          <button id="bjDealBtn" class="btn-neon">🃏 Karten geben</button>
          <button id="bjHitBtn" class="btn-neon" disabled>➕ Karte (Hit)</button>
          <button id="bjStandBtn" class="btn-neon" disabled>✋ Halten (Stand)</button>
          <button id="bjDoubleBtn" class="btn-neon" disabled>✖️2 Verdoppeln (Double)</button>
        </div>
      </div>
    `;

    this.stageEl.querySelector('#bjDealBtn').addEventListener('click', () => this.startRound());
    this.stageEl.querySelector('#bjHitBtn').addEventListener('click', () => this.hit());
    this.stageEl.querySelector('#bjStandBtn').addEventListener('click', () => this.stand());
    this.stageEl.querySelector('#bjDoubleBtn').addEventListener('click', () => this.doubleDown());
  }

  destroy() {}
}

window.ArcadeHub.BlackjackGame = BlackjackGame;
