/**
 * useImperiumSocket — React hook that manages the WebSocket connection
 * between the frontend and the AWS API Gateway WebSocket backend.
 *
 * Usage:
 *   const { connected, gameState, send, actions } = useImperiumSocket(WS_URL);
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Replace with your `sam deploy` output WebSocketURL ──────────────────────
const DEFAULT_WS_URL = 'wss://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/dev';

export function useImperiumSocket(wsUrl = DEFAULT_WS_URL) {
  const ws = useRef(null);
  const [connected, setConnected]   = useState(false);
  const [gameState, setGameState]   = useState(null);   // full public game view
  const [gameId, setGameId]         = useState(null);
  const [myName, setMyName]         = useState(null);
  const [lastEvent, setLastEvent]   = useState(null);   // raw last server message
  const [error, setError]           = useState(null);
  const reconnectTimeout            = useRef(null);

  // ── Connect ───────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const socket = new WebSocket(wsUrl);
    ws.current = socket;

    socket.onopen = () => {
      console.log('[WS] Connected');
      setConnected(true);
      setError(null);
    };

    socket.onclose = () => {
      console.log('[WS] Disconnected — retrying in 3s');
      setConnected(false);
      reconnectTimeout.current = setTimeout(connect, 3000);
    };

    socket.onerror = (e) => {
      console.error('[WS] Error', e);
      setError('Error de conexión con el servidor');
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('[WS] ←', msg.action, msg);
        setLastEvent(msg);
        handleMessage(msg);
      } catch (e) {
        console.error('[WS] Parse error', e);
      }
    };
  }, [wsUrl]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeout.current);
      ws.current?.close();
    };
  }, [connect]);

  // ── Message router ────────────────────────────────────────────────────────
  function handleMessage(msg) {
    switch (msg.action) {
      case 'roomCreated':
        setGameId(msg.gameId);
        setGameState(msg.game);
        break;

      case 'playerJoined':
      case 'playerDisconnected':
      case 'playerReconnected':
      case 'gameStarted':
      case 'gameUpdated':
      case 'gameOver':
      case 'gameState':
        if (msg.game) setGameState(msg.game);
        break;

      case 'error':
        setError(msg.message);
        break;

      default:
        break;
    }
  }

  // ── Send helper ───────────────────────────────────────────────────────────
  const send = useCallback((payload) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(payload));
    } else {
      setError('Sin conexión al servidor');
    }
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  const actions = {
    createRoom: (playerName) => {
      setMyName(playerName);
      send({ action: 'createRoom', playerName });
    },

    joinRoom: (roomCode, playerName) => {
      setMyName(playerName);
      setGameId(roomCode.toUpperCase());
      send({ action: 'joinRoom', gameId: roomCode.toUpperCase(), playerName });
    },

    startGame: () => {
      send({ action: 'startGame' });
    },

    playCard: (optionIndex) => {
      send({ action: 'playCard', optionIndex });
    },

    getGame: (code, playerName) => {
      send({ action: 'getGame', gameId: code, playerName });
    },

    clearError: () => setError(null),
  };

  // Derive whose turn it is
  const myPlayerIndex = gameState?.players?.findIndex((p) => p.name === myName);
  const isMyTurn = gameState?.status === 'PLAYING' &&
    gameState?.currentPlayerIndex === myPlayerIndex;

  return {
    connected,
    gameState,
    gameId,
    myName,
    myPlayerIndex,
    isMyTurn,
    lastEvent,
    error,
    actions,
    send,
  };
}
