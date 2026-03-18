import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const WS_URL = "wss://7wbenwum8l.execute-api.us-east-1.amazonaws.com/dev";

// Colors for state bars (client-side only for rendering)
const STATE_COLORS = {
  food:   "#e8b86d",
  morale: "#e06b8b",
  tech:   "#6bc5e8",
  order:  "#8be06b",
};

// ─── WEBSOCKET HOOK ───────────────────────────────────────────────────────────
function useImperiumSocket() {
  const ws = useRef(null);
  const reconnectTimeout = useRef(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [myName, setMyName] = useState(null);
  const [error, setError] = useState(null);
  const [lastAction, setLastAction] = useState(null);

  const handleMessage = useCallback((msg) => {
    setLastAction(msg.action);
    switch (msg.action) {
      case "roomCreated":
        setGameId(msg.gameId);
        setGameState(msg.game);
        break;
      case "playerJoined":
      case "playerDisconnected":
      case "playerReconnected":
      case "gameStarted":
      case "gameUpdated":
      case "gameOver":
      case "gameState":
        if (msg.game) setGameState(msg.game);
        break;
      case "error":
        setError(msg.message);
        break;
    }
  }, []);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;
    const socket = new WebSocket(WS_URL);
    ws.current = socket;
    socket.onopen    = () => { setConnected(true); setError(null); };
    socket.onclose   = () => { setConnected(false); reconnectTimeout.current = setTimeout(connect, 3000); };
    socket.onerror   = () => setError("Error de conexión");
    socket.onmessage = (e) => { try { handleMessage(JSON.parse(e.data)); } catch {} };
  }, [handleMessage]);

  useEffect(() => {
    connect();
    return () => { clearTimeout(reconnectTimeout.current); ws.current?.close(); };
  }, [connect]);

  const send = useCallback((payload) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(payload));
    else setError("Sin conexión al servidor");
  }, []);

  const actions = {
    createRoom: (name) => { setMyName(name); send({ action: "createRoom", playerName: name }); },
    joinRoom:   (code, name) => { setMyName(name); send({ action: "joinRoom", gameId: code.toUpperCase(), playerName: name }); },
    startGame:  () => send({ action: "startGame" }),
    playCard:   (i) => send({ action: "playCard", optionIndex: i }),
    clearError: () => setError(null),
  };

  const myPlayerIndex = gameState?.players?.findIndex((p) => p.name === myName) ?? -1;
  const isMyTurn = gameState?.status === "PLAYING" && gameState?.currentPlayerIndex === myPlayerIndex;
  const isHost   = gameState?.players?.[0]?.name === myName;

  return { connected, gameState, gameId, myName, myPlayerIndex, isMyTurn, isHost, error, lastAction, actions };
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function StateBar({ state, prevValue }) {
  const delta = prevValue !== undefined ? Math.round(state.value - prevValue) : 0;
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (delta !== 0) { setFlash(true); const t = setTimeout(() => setFlash(false), 900); return () => clearTimeout(t); }
  }, [state.value]);
  const danger = state.value < 20 || state.value > 85;
  const color  = STATE_COLORS[state.id] || "#aaa";
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 10,
      background: flash ? (delta > 0 ? "rgba(139,224,107,0.12)" : "rgba(224,107,107,0.12)") : "rgba(255,255,255,0.04)",
      border: `1px solid ${danger ? (state.value < 20 ? "#e06b6b55" : "#e8d06b55") : "rgba(255,255,255,0.07)"}`,
      transition: "background 0.4s",
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
        <span style={{ fontSize:12, color:"#aaa", fontFamily:"'Cinzel',serif" }}>{state.icon} {state.label}</span>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          {delta !== 0 && (
            <span style={{ fontSize:10, fontWeight:700, color: delta > 0 ? "#8be06b" : "#e06b6b", animation:"floatUp 0.9s ease forwards" }}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
          <span style={{ fontSize:13, fontWeight:700, color: danger ? (state.value < 20 ? "#e06b6b" : "#e8d06b") : "#fff" }}>
            {Math.round(state.value)}
          </span>
        </div>
      </div>
      <div style={{ height:5, borderRadius:3, background:"rgba(255,255,255,0.08)", overflow:"hidden" }}>
        <div style={{
          height:"100%", borderRadius:3,
          width:`${state.value}%`,
          background: state.value < 20
            ? "linear-gradient(90deg,#e06b6b,#e84b4b)"
            : state.value > 85
            ? "linear-gradient(90deg,#e8d06b,#e8b86d)"
            : `linear-gradient(90deg,${color}88,${color})`,
          transition:"width 0.6s cubic-bezier(.4,0,.2,1)",
        }} />
      </div>
      {danger && <div style={{ fontSize:9, color: state.value < 20 ? "#e06b6b" : "#e8d06b", marginTop:3 }}>
        {state.value < 20 ? "⚠ CRÍTICO" : "⚠ EXTREMO"}
      </div>}
    </div>
  );
}

// Detectar touch device una sola vez
const isTouchDevice = () => window.matchMedia("(hover: none)").matches;

function CardComponent({ card, onChoice, disabled, currentPlayer, isMyTurn }) {
  const [hovering, setHovering] = useState(null);
  const isTouch = isTouchDevice();
  const showEffects = (i) => isTouch || hovering === i;
  return (
    <div style={{
      width:"100%", maxWidth:440,
      background:"linear-gradient(145deg,#1a1410,#0f0c08)",
      border:"1px solid rgba(232,184,109,0.25)", borderRadius:18,
      padding:"24px 22px", position:"relative", overflow:"hidden",
      boxShadow:"0 20px 60px rgba(0,0,0,0.7)",
    }}>
      <div style={{ position:"absolute", top:0, left:"10%", right:"10%", height:1, background:"linear-gradient(90deg,transparent,#e8b86d,transparent)" }} />

      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16,
        padding:"5px 10px", borderRadius:20, width:"fit-content",
        background: isMyTurn ? "rgba(232,184,109,0.1)" : "rgba(255,255,255,0.03)",
        border:`1px solid ${isMyTurn ? "rgba(232,184,109,0.3)" : "rgba(255,255,255,0.06)"}`,
      }}>
        <span style={{ fontSize:14 }}>{currentPlayer?.avatar}</span>
        <span style={{ fontSize:11, color: isMyTurn ? "#e8b86d" : "#555", fontFamily:"'Cinzel',serif", letterSpacing:1 }}>
          {isMyTurn ? "Tu turno" : `Turno de ${currentPlayer?.name}`}
        </span>
        {isMyTurn && <span style={{ width:6, height:6, borderRadius:"50%", background:"#e8b86d" }} />}
      </div>

      <div style={{ fontSize:56, textAlign:"center", margin:"0 auto 16px",
        width:80, height:80, display:"flex", alignItems:"center", justifyContent:"center",
        background:"rgba(255,255,255,0.03)", borderRadius:12, border:"1px solid rgba(255,255,255,0.05)" }}>
        {card.image}
      </div>

      <h2 style={{ fontFamily:"'Cinzel',serif", fontSize:18, fontWeight:700, color:"#e8b86d", textAlign:"center", marginBottom:10, letterSpacing:1 }}>
        {card.title}
      </h2>
      <p style={{ color:"#999", fontSize:13, lineHeight:1.7, textAlign:"center", marginBottom:20, fontFamily:"'EB Garamond',serif" }}>
        {card.description}
      </p>

      <div style={{ display:"flex", gap:10 }}>
        {card.options.map((opt, i) => (
          <button key={i}
            disabled={disabled}
            onMouseEnter={() => !disabled && setHovering(i)}
            onMouseLeave={() => setHovering(null)}
            onClick={() => onChoice(i)}
            style={{
              flex:1, padding:"12px 10px", borderRadius:10,
              border:`1px solid ${hovering === i ? "#e8b86d" : "rgba(232,184,109,0.2)"}`,
              background: hovering === i ? "rgba(232,184,109,0.12)" : "rgba(255,255,255,0.03)",
              color: hovering === i ? "#e8b86d" : "#999",
              fontFamily:"'Cinzel',serif", fontSize:12, fontWeight:600,
              cursor: disabled ? "not-allowed" : "pointer",
              transition:"all 0.2s", opacity: disabled ? 0.45 : 1,
            }}>
            {opt.label}
            {showEffects(i) && opt.effects && (
              <div style={{ marginTop:7, display:"flex", flexWrap:"wrap", gap:3, justifyContent:"center" }}>
                {Object.entries(opt.effects).filter(([,v]) => v !== 0).map(([k,v]) => (
                  <span key={k} style={{
                    fontSize:9, padding:"2px 5px", borderRadius:8,
                    background: v > 0 ? "rgba(139,224,107,0.15)" : "rgba(224,107,107,0.15)",
                    color: v > 0 ? "#8be06b" : "#e06b6b",
                    border:`1px solid ${v > 0 ? "rgba(139,224,107,0.25)" : "rgba(224,107,107,0.25)"}`,
                  }}>
                    {v > 0 ? "+" : ""}{v}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
      <div style={{ position:"absolute", bottom:0, left:"10%", right:"10%", height:1, background:"linear-gradient(90deg,transparent,#e8b86d33,transparent)" }} />
    </div>
  );
}

function EventToast({ event, onClose }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setTimeout(() => setVisible(true), 30); }, []);
  return (
    <div style={{
      position:"fixed", inset:0, zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center",
      background:"rgba(0,0,0,0.8)", backdropFilter:"blur(8px)",
      opacity: visible ? 1 : 0, transition:"opacity 0.3s",
    }}>
      <div style={{
        maxWidth:380, width:"90%", textAlign:"center",
        background: event.type === "bad" ? "linear-gradient(145deg,#1a0a0a,#0f0606)" : "linear-gradient(145deg,#0a1a0a,#06100a)",
        border:`1px solid ${event.type === "bad" ? "#e06b6b44" : "#6be06b44"}`,
        borderRadius:20, padding:"32px 28px",
        boxShadow:`0 0 60px ${event.type === "bad" ? "rgba(224,107,107,0.25)" : "rgba(107,224,107,0.25)"}`,
        transform: visible ? "scale(1)" : "scale(0.92)",
        transition:"transform 0.3s cubic-bezier(.34,1.56,.64,1)",
      }}>
        <div style={{ fontSize:64, marginBottom:12 }}>{event.icon}</div>
        <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, letterSpacing:4,
          color: event.type === "bad" ? "#e06b6b" : "#6be06b", marginBottom:6 }}>
          {event.type === "bad" ? "EVENTO CRÍTICO" : "EVENTO ESPECIAL"}
        </div>
        <h2 style={{ fontFamily:"'Cinzel',serif", fontSize:22, fontWeight:700,
          color: event.type === "bad" ? "#e06b6b" : "#6be06b", marginBottom:12 }}>
          {event.title}
        </h2>
        <p style={{ color:"#aaa", fontSize:13, lineHeight:1.7, fontFamily:"'EB Garamond',serif", marginBottom:20 }}>
          {event.description}
        </p>
        <button onClick={onClose} style={{
          padding:"10px 28px", borderRadius:10,
          border:`1px solid ${event.type === "bad" ? "#e06b6b" : "#6be06b"}`,
          background:"transparent",
          color: event.type === "bad" ? "#e06b6b" : "#6be06b",
          fontFamily:"'Cinzel',serif", fontSize:13, letterSpacing:1, cursor:"pointer",
        }}>CONTINUAR</button>
      </div>
    </div>
  );
}

function LogFeed({ log }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [log]);
  return (
    <div ref={ref} style={{ height:130, overflowY:"auto", padding:"8px 10px",
      background:"rgba(0,0,0,0.25)", borderRadius:10, border:"1px solid rgba(255,255,255,0.05)" }}>
      {log.length === 0
        ? <p style={{ color:"#333", fontSize:11, textAlign:"center", fontStyle:"italic", marginTop:40 }}>El destino aguarda…</p>
        : log.map((e, i) => (
          <div key={i} style={{ fontSize:11, color: i === log.length-1 ? "#e8b86d" : "#555",
            marginBottom:3, lineHeight:1.4, fontFamily:"'EB Garamond',serif" }}>
            <span style={{ color:"#333", marginRight:5 }}>{e.turn}.</span>
            {e.type === "event"
              ? `${e.eventIcon} ${e.eventTitle} ${e.effectStr}`
              : `${e.playerAvatar} ${e.playerName} → "${e.optionLabel}" en "${e.cardTitle}" ${e.effectStr}`
            }
          </div>
        ))
      }
    </div>
  );
}

// ─── SCREENS ──────────────────────────────────────────────────────────────────

function LobbyScreen({ actions, connected, error }) {
  const [mode, setMode]       = useState(null); // "create" | "join"
  const [name, setName]       = useState("");
  const [code, setCode]       = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = () => {
    if (!name.trim()) return;
    setLoading(true);
    actions.createRoom(name.trim());
  };

  const handleJoin = () => {
    if (!name.trim() || !code.trim()) return;
    setLoading(true);
    actions.joinRoom(code.trim(), name.trim());
  };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#0a0805,#080604)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ textAlign:"center", maxWidth:420, width:"100%" }}>
        <div style={{ fontSize:72, marginBottom:8, filter:"drop-shadow(0 0 30px rgba(232,184,109,0.35))" }}>⚜️</div>
        <h1 style={{ fontFamily:"'Cinzel',serif", fontSize:38, fontWeight:900, letterSpacing:3,
          background:"linear-gradient(90deg,#c49a3c,#e8b86d,#c49a3c)", backgroundSize:"200%",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
          animation:"shimmer 3s linear infinite", marginBottom:4 }}>
          IMPERIUM
        </h1>
        <p style={{ fontFamily:"'EB Garamond',serif", color:"#555", fontSize:15,
          letterSpacing:2, marginBottom:32, fontStyle:"italic" }}>
          Cada decisión moldea el destino
        </p>

        {/* Connection status */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginBottom:24 }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background: connected ? "#8be06b" : "#e06b6b",
            boxShadow: connected ? "0 0 8px #8be06b" : "none" }} />
          <span style={{ fontSize:10, color: connected ? "#8be06b" : "#e06b6b", fontFamily:"'Cinzel',serif", letterSpacing:1 }}>
            {connected ? "CONECTADO" : "CONECTANDO…"}
          </span>
        </div>

        {error && (
          <div style={{ padding:"10px 16px", borderRadius:10, background:"rgba(224,107,107,0.1)",
            border:"1px solid rgba(224,107,107,0.25)", color:"#e06b6b", fontSize:12,
            fontFamily:"'Cinzel',serif", marginBottom:16 }}>
            {error}
            <button onClick={actions.clearError} style={{ marginLeft:10, background:"none", border:"none",
              color:"#e06b6b", cursor:"pointer", fontSize:12 }}>✕</button>
          </div>
        )}

        {!mode ? (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <button onClick={() => setMode("create")} disabled={!connected}
              style={btnStyle("#e8b86d", connected)}>
              ⚜ CREAR SALA
            </button>
            <button onClick={() => setMode("join")} disabled={!connected}
              style={btnStyle("#6bc5e8", connected)}>
              🚪 UNIRSE A SALA
            </button>
          </div>
        ) : (
          <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(232,184,109,0.12)",
            borderRadius:16, padding:"24px 20px" }}>
            <p style={{ fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:3, color:"#555",
              marginBottom:16, textTransform:"uppercase" }}>
              {mode === "create" ? "Nueva Sala" : "Unirse a Sala"}
            </p>

            <input
              placeholder="Tu nombre"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (mode === "create" ? handleCreate() : handleJoin())}
              style={inputStyle}
            />

            {mode === "join" && (
              <input
                placeholder="Código de sala (ej. ABC123)"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleJoin()}
                style={{ ...inputStyle, marginTop:10, letterSpacing:3, textTransform:"uppercase" }}
                maxLength={6}
              />
            )}

            <div style={{ display:"flex", gap:10, marginTop:16 }}>
              <button onClick={() => { setMode(null); setLoading(false); actions.clearError(); }}
                style={{ flex:1, padding:"12px 0", borderRadius:10, border:"1px solid rgba(255,255,255,0.1)",
                  background:"transparent", color:"#555", fontFamily:"'Cinzel',serif", fontSize:12, cursor:"pointer" }}>
                VOLVER
              </button>
              <button
                onClick={mode === "create" ? handleCreate : handleJoin}
                disabled={loading || !name.trim() || (mode === "join" && !code.trim())}
                style={btnStyle("#e8b86d", !loading && name.trim() && (mode === "create" || code.trim()), true)}>
                {loading ? "…" : mode === "create" ? "CREAR" : "UNIRSE"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WaitingRoom({ gameState, gameId, isHost, actions, connected }) {
  const [copied, setCopied] = useState(false);
  const copyCode = () => {
    navigator.clipboard.writeText(gameId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#0a0805,#080604)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ maxWidth:420, width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:8 }}>⚜️</div>
        <h1 style={{ fontFamily:"'Cinzel',serif", fontSize:24, fontWeight:900, color:"#e8b86d", marginBottom:4 }}>
          SALA DE ESPERA
        </h1>

        {/* Room code */}
        <div onClick={copyCode} style={{ display:"inline-flex", alignItems:"center", gap:10,
          padding:"12px 24px", borderRadius:12, cursor:"pointer",
          background:"rgba(232,184,109,0.08)", border:"1px solid rgba(232,184,109,0.25)",
          margin:"16px 0 24px" }}>
          <span style={{ fontFamily:"'Cinzel',serif", fontSize:28, fontWeight:900, letterSpacing:6, color:"#e8b86d" }}>
            {gameId}
          </span>
          <span style={{ fontSize:16 }}>{copied ? "✅" : "📋"}</span>
        </div>
        <p style={{ color:"#444", fontSize:11, fontFamily:"'Cinzel',serif", letterSpacing:2, marginBottom:24 }}>
          {copied ? "¡COPIADO!" : "TOCA PARA COPIAR EL CÓDIGO"}
        </p>

        {/* Players */}
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:28 }}>
          {gameState.players.map((p, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px",
              background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12 }}>
              <span style={{ fontSize:22 }}>{p.avatar}</span>
              <span style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:"#ccc" }}>{p.name}</span>
              {i === 0 && <span style={{ marginLeft:"auto", fontSize:10, color:"#e8b86d",
                fontFamily:"'Cinzel',serif", letterSpacing:1 }}>ANFITRIÓN</span>}
            </div>
          ))}
          {gameState.players.length < 4 && (
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px",
              background:"rgba(255,255,255,0.02)", border:"1px dashed rgba(255,255,255,0.08)", borderRadius:12 }}>
              <span style={{ fontSize:22, opacity:0.3 }}>👤</span>
              <span style={{ fontFamily:"'Cinzel',serif", fontSize:12, color:"#333" }}>
                Esperando jugador…
              </span>
            </div>
          )}
        </div>

        {isHost ? (
          <button
            onClick={actions.startGame}
            disabled={gameState.players.length < 2}
            style={btnStyle("#e8b86d", gameState.players.length >= 2)}>
            {gameState.players.length < 2 ? "ESPERANDO MÁS JUGADORES…" : "⚔ INICIAR PARTIDA"}
          </button>
        ) : (
          <p style={{ color:"#444", fontSize:12, fontFamily:"'Cinzel',serif", letterSpacing:2,
            animation:"pulse 2s ease-in-out infinite" }}>
            ESPERANDO AL ANFITRIÓN…
          </p>
        )}
      </div>
    </div>
  );
}

function GameScreen({ gameState, myPlayerIndex, isMyTurn, isHost, actions }) {
  const [prevStates, setPrevStates] = useState(null);
  const [eventQueue, setEventQueue] = useState([]);
  const [activeCard, setActiveCard] = useState(true);
  const prevCardId = useRef(null);

  // Detect state changes and card changes
  useEffect(() => {
    if (!gameState) return;
    const cardChanged = gameState.currentCard?.id !== prevCardId.current;
    if (cardChanged) {
      setActiveCard(false);
      setTimeout(() => setActiveCard(true), 200);
      prevCardId.current = gameState.currentCard?.id;
    }
  }, [gameState?.currentCard?.id]);

  // Queue pending events for display
  useEffect(() => {
    if (gameState?.pendingEvents?.length > 0) {
      setEventQueue(gameState.pendingEvents);
    }
  }, [gameState?.pendingEvents]);

  const handleChoice = (optionIndex) => {
    setPrevStates(gameState.states);
    actions.playCard(optionIndex);
  };

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#0a0805,#070503)",
      padding:16, display:"flex", flexDirection:"column", gap:12 }}>

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <h1 style={{ fontFamily:"'Cinzel',serif", fontSize:16, fontWeight:900, color:"#e8b86d", letterSpacing:2, margin:0 }}>
            ⚜️ IMPERIUM
          </h1>
          <p style={{ color:"#333", fontSize:10, fontFamily:"'Cinzel',serif", margin:0, letterSpacing:1 }}>
            Turno {gameState.turn} · Sala {gameState.gameId}
          </p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px", borderRadius:20,
          background: isMyTurn ? "rgba(232,184,109,0.1)" : "rgba(255,255,255,0.03)",
          border:`1px solid ${isMyTurn ? "rgba(232,184,109,0.3)" : "rgba(255,255,255,0.06)"}` }}>
          <span style={{ width:6, height:6, borderRadius:"50%",
            background: isMyTurn ? "#e8b86d" : "#333",
            boxShadow: isMyTurn ? "0 0 8px #e8b86d" : "none",
            animation: isMyTurn ? "pulse 1.5s ease-in-out infinite" : "none" }} />
          <span style={{ fontSize:10, fontFamily:"'Cinzel',serif", color: isMyTurn ? "#e8b86d" : "#444", letterSpacing:1 }}>
            {isMyTurn ? "TU TURNO" : `TURNO DE ${currentPlayer?.name?.toUpperCase()}`}
          </span>
        </div>
      </div>

      {/* Players row */}
      <div style={{ display:"flex", gap:6 }}>
        {gameState.players.map((p, i) => (
          <div key={i} style={{ flex:1, padding:"6px 8px", borderRadius:10, textAlign:"center",
            background: i === gameState.currentPlayerIndex ? "rgba(232,184,109,0.1)" : "rgba(255,255,255,0.03)",
            border:`1px solid ${i === gameState.currentPlayerIndex ? "rgba(232,184,109,0.3)" : "rgba(255,255,255,0.06)"}`,
            transition:"all 0.3s" }}>
            <div style={{ fontSize:18 }}>{p.avatar}</div>
            <div style={{ fontSize:9, color: i === gameState.currentPlayerIndex ? "#e8b86d" : "#444",
              fontFamily:"'Cinzel',serif", letterSpacing:0.5, marginTop:2 }}>
              {p.name}
              {i === myPlayerIndex && <span style={{ color:"#555" }}> (tú)</span>}
            </div>
          </div>
        ))}
      </div>

      {/* States */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        {gameState.states.map((s, i) => (
          <StateBar key={s.id} state={s} prevValue={prevStates?.[i]?.value} />
        ))}
      </div>

      {/* Card */}
      {gameState.currentCard && (
        <div style={{ animation: activeCard ? "cardIn 0.4s cubic-bezier(.34,1.2,.64,1) forwards" : "none",
          opacity: activeCard ? 1 : 0 }}>
          <CardComponent
            card={gameState.currentCard}
            onChoice={handleChoice}
            disabled={!isMyTurn}
            currentPlayer={currentPlayer}
            isMyTurn={isMyTurn}
          />
        </div>
      )}

      {/* Log */}
      <div>
        <p style={{ fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:3, color:"#333",
          marginBottom:5, textTransform:"uppercase" }}>Crónica</p>
        <LogFeed log={gameState.log || []} />
      </div>

      {/* Event modal */}
      {eventQueue.length > 0 && (
        <EventToast event={eventQueue[0]} onClose={() => setEventQueue(q => q.slice(1))} />
      )}
    </div>
  );
}

function GameOverScreen({ gameState, onRestart }) {
  const collapsed = gameState.gameOver?.reason === "collapse";
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#0a0805,#080604)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ maxWidth:420, width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:64, marginBottom:12 }}>{collapsed ? "💀" : "🏛️"}</div>
        <h1 style={{ fontFamily:"'Cinzel',serif", fontSize:30, fontWeight:900,
          color: collapsed ? "#e06b6b" : "#e8b86d", marginBottom:6 }}>
          {collapsed ? "EL IMPERIO CAE" : "FIN DE LA ERA"}
        </h1>
        <p style={{ color:"#555", fontFamily:"'EB Garamond',serif", fontSize:14, marginBottom:28 }}>
          {gameState.gameOver?.message} · {gameState.turn - 1} turnos · {gameState.players.length} gobernantes
        </p>
        <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:28 }}>
          {gameState.states.map(s => (
            <div key={s.id} style={{ display:"flex", justifyContent:"space-between",
              padding:"8px 14px", background:"rgba(255,255,255,0.03)",
              borderRadius:8, border:"1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ color:"#666", fontFamily:"'Cinzel',serif", fontSize:12 }}>{s.icon} {s.label}</span>
              <span style={{ fontFamily:"'Cinzel',serif", fontSize:12, fontWeight:700,
                color: s.value < 20 ? "#e06b6b" : s.value > 80 ? "#e8d06b" : "#aaa" }}>
                {Math.round(s.value)}
              </span>
            </div>
          ))}
        </div>
        <button onClick={onRestart} style={btnStyle("#e8b86d", true)}>
          NUEVA PARTIDA
        </button>
      </div>
    </div>
  );
}

// ─── STYLE HELPERS ────────────────────────────────────────────────────────────

const inputStyle = {
  width:"100%", padding:"12px 14px", borderRadius:10, boxSizing:"border-box",
  border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)",
  color:"#e8b86d", fontFamily:"'Cinzel',serif", fontSize:13,
  outline:"none", letterSpacing:1,
};

function btnStyle(color, enabled, small = false) {
  return {
    width: small ? undefined : "100%",
    flex: small ? 1 : undefined,
    padding: small ? "12px 0" : "16px 0",
    borderRadius:12,
    border:`1px solid ${enabled ? color + "88" : "rgba(255,255,255,0.06)"}`,
    background: enabled ? `rgba(${hexToRgb(color)},0.1)` : "transparent",
    color: enabled ? color : "#333",
    fontFamily:"'Cinzel',serif", fontSize:13, fontWeight:700, letterSpacing:2,
    cursor: enabled ? "pointer" : "not-allowed",
    transition:"all 0.2s",
  };
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────

export default function App() {
  const { connected, gameState, gameId, myName, myPlayerIndex, isMyTurn, isHost, error, actions } = useImperiumSocket();

  const screen = !gameState
    ? "lobby"
    : gameState.status === "LOBBY"
    ? "waiting"
    : gameState.status === "FINISHED"
    ? "gameover"
    : "game";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=EB+Garamond:ital,wght@0,400;1,400&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        html, body { width:100%; height:100%; }
        body { background:#0a0805; display:flex; justify-content:center; }
        #root { width:100%; max-width:520px; }
        @keyframes shimmer { 0%{background-position:0%} 100%{background-position:200%} }
        @keyframes pulse   { 0%,100%{opacity:0.4} 50%{opacity:1} }
        @keyframes floatUp { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-18px)} }
        @keyframes cardIn  { from{opacity:0;transform:translateY(14px) scale(0.97)} to{opacity:1;transform:none} }
        input::placeholder { color:#333; }
        ::-webkit-scrollbar { width:3px; }
        ::-webkit-scrollbar-thumb { background:#e8b86d22; border-radius:2px; }
        @media (max-width: 540px) {
          #root { max-width:100%; }
        }
      `}</style>

      {screen === "lobby"   && <LobbyScreen actions={actions} connected={connected} error={error} />}
      {screen === "waiting" && <WaitingRoom gameState={gameState} gameId={gameId} isHost={isHost} actions={actions} connected={connected} />}
      {screen === "game"    && <GameScreen  gameState={gameState} myPlayerIndex={myPlayerIndex} isMyTurn={isMyTurn} isHost={isHost} actions={actions} />}
      {screen === "gameover"&& <GameOverScreen gameState={gameState} onRestart={() => window.location.reload()} />}
    </>
  );
}
