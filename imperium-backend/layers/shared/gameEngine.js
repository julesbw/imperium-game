/**
 * IMPERIUM — Shared Game Engine
 * Contains all game logic: cards, states, events, turn progression.
 * Used by Lambda functions via the shared layer.
 */

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const GAME_STATUS = {
  LOBBY:    'LOBBY',
  PLAYING:  'PLAYING',
  FINISHED: 'FINISHED',
};

const INITIAL_STATES = [
  { id: 'food',   label: 'Alimentos',  icon: '🌾', value: 50 },
  { id: 'morale', label: 'Moral',      icon: '❤️', value: 55 },
  { id: 'tech',   label: 'Tecnología', icon: '⚙️', value: 40 },
  { id: 'order',  label: 'Orden',      icon: '⚖️', value: 60 },
];

const CARDS = [
  {
    id: 'card_1', title: 'Cosecha Abundante',
    description: 'Las lluvias llegaron a tiempo. ¿Distribuimos los excedentes o los almacenamos?',
    image: '🌧️',
    options: [
      { label: 'Distribuir', effects: { food: 10,  morale: 15, tech: 0,  order: 5  } },
      { label: 'Almacenar',  effects: { food: 25,  morale: -5, tech: 0,  order: 5  } },
    ],
  },
  {
    id: 'card_2', title: 'Rebelión en el Este',
    description: 'Un grupo disidente exige mayor autonomía. ¿Negociamos o reprimimos?',
    image: '⚔️',
    options: [
      { label: 'Negociar',  effects: { food: -5,  morale: 10,  tech: 0, order: -10 } },
      { label: 'Reprimir',  effects: { food: 0,   morale: -20, tech: 0, order: 15  } },
    ],
  },
  {
    id: 'card_3', title: 'Inventor Errante',
    description: 'Un brillante inventor ofrece su tecnología a cambio de recursos.',
    image: '💡',
    options: [
      { label: 'Aceptar',  effects: { food: -10, morale: 5,  tech: 20, order: 0 } },
      { label: 'Rechazar', effects: { food: 0,   morale: 0,  tech: 0,  order: 5 } },
    ],
  },
  {
    id: 'card_4', title: 'Plaga en los Campos',
    description: 'Una enfermedad arruina la mitad de los cultivos.',
    image: '🪲',
    options: [
      { label: 'Importar',  effects: { food: 5,   morale: 5,   tech: 0, order: -5  } },
      { label: 'Racionar',  effects: { food: -15, morale: -10, tech: 0, order: 10  } },
    ],
  },
  {
    id: 'card_5', title: 'Festival Nacional',
    description: 'Proponen un gran festival para unir al pueblo.',
    image: '🎉',
    options: [
      { label: 'Organizar', effects: { food: -8, morale: 20, tech: 0,  order: 5 } },
      { label: 'Cancelar',  effects: { food: 0,  morale: -10, tech: 5, order: 0 } },
    ],
  },
  {
    id: 'card_6', title: 'Tratado Comercial',
    description: 'Una nación vecina ofrece un tratado ventajoso.',
    image: '🤝',
    options: [
      { label: 'Firmar',   effects: { food: 15, morale: 5,  tech: 10, order: -5  } },
      { label: 'Declinar', effects: { food: 0,  morale: 0,  tech: 0,  order: 10  } },
    ],
  },
  {
    id: 'card_7', title: 'Sequía Prolongada',
    description: 'Meses sin lluvia. Las reservas de agua se agotan.',
    image: '☀️',
    options: [
      { label: 'Racionamiento estricto', effects: { food: -10, morale: -15, tech: 5,  order: 10  } },
      { label: 'Buscar nuevas fuentes',  effects: { food: -5,  morale: 5,   tech: 15, order: -5  } },
    ],
  },
  {
    id: 'card_8', title: 'Propuesta de Alianza',
    description: 'Un reino vecino propone una alianza militar.',
    image: '🛡️',
    options: [
      { label: 'Aceptar',  effects: { food: -5,  morale: 10, tech: 5,  order: 15  } },
      { label: 'Declinar', effects: { food: 5,   morale: -5, tech: 0,  order: 0   } },
    ],
  },
];

const EVENTS = [
  {
    id: 'famine',
    trigger: (s) => s.food < 20,
    type: 'bad',
    title: '¡HAMBRUNA!',
    icon: '💀',
    description: 'El pueblo muere de hambre. Las ciudades se vacían.',
    effects: { food: -10, morale: -15, tech: 0, order: -10 },
  },
  {
    id: 'revolt',
    trigger: (s) => s.morale < 15,
    type: 'bad',
    title: '¡REVOLUCIÓN!',
    icon: '🔥',
    description: 'El pueblo se levanta. El caos reina en las calles.',
    effects: { food: -5, morale: 20, tech: 0, order: -20 },
  },
  {
    id: 'anarchy',
    trigger: (s) => s.order < 10,
    type: 'bad',
    title: '¡ANARQUÍA!',
    icon: '⚡',
    description: 'Sin ley ni gobierno, todo colapsa.',
    effects: { food: -10, morale: -10, tech: -5, order: 15 },
  },
  {
    id: 'golden',
    trigger: (s) => s.food > 85 && s.morale > 80,
    type: 'good',
    title: 'ERA DORADA',
    icon: '✨',
    description: 'Abundancia y felicidad. La civilización florece.',
    effects: { food: 5, morale: 5, tech: 10, order: 5 },
  },
  {
    id: 'techboom',
    trigger: (s) => s.tech > 90,
    type: 'good',
    title: 'RENACIMIENTO TECH',
    icon: '🚀',
    description: 'El avance tecnológico acelera todo.',
    effects: { food: 10, morale: 10, tech: 0, order: 5 },
  },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function clamp(v) {
  return Math.max(0, Math.min(100, v));
}

function shuffleDeck(cards) {
  const deck = [...cards, ...cards, ...cards]; // 3 copies for longer games
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function applyEffects(states, effects) {
  return states.map((s) => ({
    ...s,
    value: clamp(s.value + (effects[s.id] || 0)),
  }));
}

function stateMap(states) {
  return Object.fromEntries(states.map((s) => [s.id, s.value]));
}

function checkTriggeredEvents(states, shownEventIds = []) {
  const map = stateMap(states);
  return EVENTS.filter((e) => e.trigger(map) && !shownEventIds.includes(e.id));
}

function checkGameOver(states, turn) {
  const anyCollapsed = states.some((s) => s.value <= 0);
  const maxTurns = turn >= 30;
  if (anyCollapsed) return { over: true, reason: 'collapse', message: 'El Imperio ha caído.' };
  if (maxTurns)     return { over: true, reason: 'maxturns',  message: 'Fin de la era.' };
  return { over: false };
}

// ─── GAME STATE FACTORY ───────────────────────────────────────────────────────

function createNewGame(gameId, hostConnectionId, hostName) {
  const deck = shuffleDeck(CARDS);
  const ttl = Math.floor(Date.now() / 1000) + 86400; // 24h TTL

  return {
    gameId,
    status: GAME_STATUS.LOBBY,
    hostConnectionId,
    players: [
      {
        connectionId: hostConnectionId,
        name: hostName,
        avatar: '👑',
        index: 0,
      },
    ],
    states: INITIAL_STATES.map((s) => ({ ...s })),
    deck,                    // full shuffled deck stored in DDB
    currentCardIndex: 0,
    currentPlayerIndex: 0,
    turn: 1,
    log: [],
    shownEventIds: [],
    pendingEvents: [],
    gameOver: null,
    createdAt: new Date().toISOString(),
    ttl,
  };
}

const AVATARS = ['👑', '⚔️', '🏛️', '🌿'];

function addPlayerToGame(game, connectionId, playerName) {
  if (game.players.length >= 4) throw new Error('La sala está llena (máx. 4 jugadores)');
  if (game.status !== GAME_STATUS.LOBBY) throw new Error('El juego ya comenzó');
  if (game.players.find((p) => p.connectionId === connectionId)) {
    throw new Error('Ya estás en esta sala');
  }

  const index = game.players.length;
  game.players.push({
    connectionId,
    name: playerName,
    avatar: AVATARS[index] || '🎭',
    index,
  });
  return game;
}

function startGame(game, requesterConnectionId) {
  if (game.hostConnectionId !== requesterConnectionId) throw new Error('Solo el anfitrión puede iniciar');
  if (game.players.length < 2) throw new Error('Se necesitan al menos 2 jugadores');
  if (game.status !== GAME_STATUS.LOBBY) throw new Error('El juego ya está en curso');

  game.status = GAME_STATUS.PLAYING;
  game.startedAt = new Date().toISOString();
  return game;
}

function processPlay(game, connectionId, optionIndex) {
  if (game.status !== GAME_STATUS.PLAYING) throw new Error('El juego no está en curso');

  const currentPlayer = game.players[game.currentPlayerIndex];
  if (currentPlayer.connectionId !== connectionId) {
    throw new Error('No es tu turno');
  }

  const currentCard = game.deck[game.currentCardIndex];
  if (!currentCard) throw new Error('No hay más cartas');

  const option = currentCard.options[optionIndex];
  if (!option) throw new Error('Opción inválida');

  // Apply effects
  const prevStates = game.states.map((s) => ({ ...s }));
  game.states = applyEffects(game.states, option.effects);

  // Build effect summary for log
  const effectStr = Object.entries(option.effects)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => {
      const s = INITIAL_STATES.find((st) => st.id === k);
      return `${s?.icon}${v > 0 ? '+' : ''}${v}`;
    })
    .join(' ');

  // Add to log
  game.log.push({
    turn: game.turn,
    playerName: currentPlayer.name,
    playerAvatar: currentPlayer.avatar,
    cardTitle: currentCard.title,
    optionLabel: option.label,
    effectStr,
    timestamp: new Date().toISOString(),
  });

  // Check for triggered events
  const triggered = checkTriggeredEvents(game.states, game.shownEventIds);
  if (triggered.length > 0) {
    // Apply event effects immediately and add to shown list
    for (const event of triggered) {
      game.states = applyEffects(game.states, event.effects);
      game.shownEventIds.push(event.id);
      game.log.push({
        turn: game.turn,
        type: 'event',
        eventId: event.id,
        eventTitle: event.title,
        eventType: event.type,
        eventIcon: event.icon,
        effectStr: Object.entries(event.effects)
          .filter(([, v]) => v !== 0)
          .map(([k, v]) => {
            const s = INITIAL_STATES.find((st) => st.id === k);
            return `${s?.icon}${v > 0 ? '+' : ''}${v}`;
          })
          .join(' '),
        timestamp: new Date().toISOString(),
      });
    }
    game.pendingEvents = triggered; // frontend will display these
  } else {
    game.pendingEvents = [];
  }

  // Check game over
  const gameOverCheck = checkGameOver(game.states, game.turn);
  if (gameOverCheck.over) {
    game.status = GAME_STATUS.FINISHED;
    game.gameOver = gameOverCheck;
    return game;
  }

  // Advance turn
  game.currentCardIndex += 1;
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  game.turn += 1;

  return game;
}

module.exports = {
  GAME_STATUS,
  CARDS,
  EVENTS,
  INITIAL_STATES,
  createNewGame,
  addPlayerToGame,
  startGame,
  processPlay,
  shuffleDeck,
};
