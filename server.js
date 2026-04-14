const express = require("express");
const { WebSocketServer, WebSocket } = require("ws");
const { createServer } = require("http");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
app.use(express.static(path.join(__dirname, "public")));

// ─────────────────────────────────────────────────────────────────────────────
// RONDAS DEL JUEGO
// Tipos disponibles:
//   "mcq"      → selección múltiple clásica
//   "sort"     → arrastrar tarjetas para ordenar pasos
//   "match"    → conectar pares (izquierda ↔ derecha)
//   "strategy" → construir un plan de contenido bloque a bloque
//   "vote"     → cada miembro del equipo vota; gana la mayoría interna
// ─────────────────────────────────────────────────────────────────────────────
const ROUNDS = [
  {
    type: "mcq",
    text: "¿Cuántos segundos tienes para capturar atención antes de que el algoritmo deje de distribuir tu video?",
    options: ["10 segundos", "5 segundos", "3 segundos", "1 segundo"],
    correct: 2,
    points: 100,
    timeLimit: 20,
    explanation: "La regla de los 3 segundos: si el usuario abandona antes, el algoritmo interpreta eso como señal negativa y reduce el alcance del video."
  },
  {
    type: "sort",
    text: "Organicen estos pasos para publicar un Reel en Instagram en el orden correcto",
    items: [
      "Escribe el caption con hashtags",
      "Abre Instagram y toca el botón +",
      "Agrega música y texto al video",
      "Selecciona 'Reel' en las opciones",
      "Graba o sube tu video",
      "Toca 'Compartir'"
    ],
    // Índices del arreglo original en el orden correcto
    correctOrder: [1, 3, 4, 2, 0, 5],
    points: 200,
    timeLimit: 45,
    explanation: "El orden correcto: abrir la app → seleccionar Reel → grabar/subir el video → editar con música y texto → escribir el caption → compartir."
  },
  {
    type: "match",
    text: "Unan cada plataforma con su fortaleza principal",
    pairs: [
      { left: "TikTok",    right: "Descubrimiento masivo y viralidad" },
      { left: "Instagram", right: "Estética visual y Social Commerce" },
      { left: "YouTube",   right: "Autoridad profunda y tutoriales" },
      { left: "LinkedIn",  right: "Networking B2B y reputación profesional" }
    ],
    points: 150,
    timeLimit: 40,
    explanation: "Cada red tiene su superpoder: TikTok para que te descubran, Instagram para mostrar y vender, YouTube para enseñar en profundidad, LinkedIn para conectar con empresas."
  },
  {
    type: "vote",
    text: "Un emprendedor tiene solo 2 horas a la semana para dedicarle a redes. ¿Cuál es la mejor decisión?",
    options: [
      "Publicar todos los días aunque sea contenido sin esfuerzo",
      "Publicar 2 veces por semana con valor y responder comentarios",
      "Invertir todo el tiempo en publicidad pagada",
      "Esperar a tener más tiempo antes de empezar"
    ],
    correct: 1,
    points: 150,
    timeLimit: 35,
    explanation: "La consistencia con calidad supera la frecuencia vacía. 2 publicaciones semanales bien pensadas + interacción construyen más comunidad que publicar a diario sin estrategia."
  },
  {
    type: "strategy",
    text: "Tienen una panadería artesanal en Medellín. Armen su estrategia de contenido eligiendo una opción en cada bloque.",
    blocks: [
      {
        label: "🎯 Público objetivo",
        options: [
          "Toda Colombia, de todas las edades",
          "Personas en Medellín que valoran lo artesanal, 20-40 años",
          "Restaurantes y hoteles (B2B únicamente)",
          "Turistas extranjeros"
        ],
        correct: 1,
        hint: "Un negocio local debe hablarle primero a su comunidad cercana"
      },
      {
        label: "📱 Red principal",
        options: [
          "LinkedIn — para conectar con empresas",
          "Twitter/X — para conversaciones de tendencia",
          "Instagram + TikTok — visual y alcance local",
          "YouTube — tutoriales de panadería de 30 minutos"
        ],
        correct: 2,
        hint: "Un producto visual como el pan necesita plataformas visuales"
      },
      {
        label: "📸 Tipo de contenido",
        options: [
          "Solo fotos del producto con precio",
          "Detrás de cámara: amasar, hornear, decorar",
          "Memes de panadería sin relación al negocio",
          "Noticias del gremio panadero nacional"
        ],
        correct: 1,
        hint: "La autenticidad genera más confianza que la publicidad directa"
      },
      {
        label: "⏱ Frecuencia",
        options: [
          "Una vez al mes para no saturar",
          "10 veces al día en todas las redes",
          "3-4 veces por semana con contenido de valor",
          "Solo publicar cuando haya descuentos"
        ],
        correct: 2,
        hint: "La consistencia moderada supera tanto la ausencia como el exceso"
      }
    ],
    points: 300,
    timeLimit: 60,
    explanation: "Estrategia ganadora para la panadería: público local específico + plataformas visuales + mostrar el proceso real + frecuencia constante. Cada decisión correcta suma puntos."
  },
  {
    type: "mcq",
    text: "¿Cuál herramienta gratuita permite programar publicaciones y revisar métricas de varias redes desde un solo lugar?",
    options: ["Photoshop", "Metricool", "Google Ads", "Hootsuite Pro"],
    correct: 1,
    points: 100,
    timeLimit: 20,
    explanation: "Metricool tiene plan gratuito robusto para programar y analizar métricas de múltiples redes sociales desde un panel centralizado."
  },
  {
    type: "match",
    text: "Conecten cada error común con su solución correcta",
    pairs: [
      { left: "Solo publicas para vender",         right: "Aplica la regla 80/20 de valor" },
      { left: "Copias tendencias sin adaptarlas",  right: "Ponle la identidad de tu marca" },
      { left: "Nunca respondes comentarios",       right: "Las redes son conversaciones" },
      { left: "Estás en todas las redes a la vez", right: "Domina 1 o 2 primero" }
    ],
    points: 150,
    timeLimit: 40,
    explanation: "Cada error tiene un antídoto claro. El denominador común es la falta de estrategia: actuar sin ella es el error más costoso en marketing digital."
  },
  {
    type: "vote",
    text: "Un video llega a 50,000 personas pero nadie compra. ¿Cuál es el problema más probable?",
    options: [
      "El video era demasiado largo",
      "Hubo alcance pero no había un llamado a la acción claro",
      "TikTok no sirve para vender",
      "Necesitas más seguidores antes de poder vender"
    ],
    correct: 1,
    points: 150,
    timeLimit: 35,
    explanation: "El alcance sin conversión casi siempre indica ausencia de CTA (llamado a la acción). Las redes llevan tráfico, pero el contenido debe decirle al usuario exactamente qué hacer después."
  },
  {
    type: "sort",
    text: "Ordenen los pasos para crear un video de TikTok que realmente funcione",
    items: [
      "Publicar y responder comentarios en las primeras horas",
      "Elegir el hook (gancho) para los primeros 3 segundos",
      "Definir qué problema o emoción quieres despertar",
      "Grabar el video con buena luz",
      "Agregar texto, música y subtítulos",
      "Escribir el caption con 3-5 hashtags relevantes"
    ],
    correctOrder: [2, 1, 3, 4, 5, 0],
    points: 200,
    timeLimit: 45,
    explanation: "Primero defines el objetivo → luego el gancho → grabas → editas → caption → publicas y alimentas el algoritmo respondiendo comentarios rápido."
  },
  {
    type: "strategy",
    text: "Ahora tienen una marca de ropa sostenible para jóvenes. Construyan su estrategia.",
    blocks: [
      {
        label: "🎯 Mensaje central",
        options: [
          "Somos los más baratos del mercado",
          "Moda que cuida el planeta sin sacrificar estilo",
          "Ropa de todo tipo para todas las edades",
          "Envíos internacionales en 24 horas"
        ],
        correct: 1,
        hint: "El mensaje debe conectar con los valores del público objetivo"
      },
      {
        label: "📱 Formato estrella",
        options: [
          "Fotos de catálogo estáticas en fondo blanco",
          "Reels mostrando la ropa en contextos reales",
          "Artículos de blog sobre sostenibilidad",
          "Podcasts sobre moda"
        ],
        correct: 1,
        hint: "Los jóvenes quieren verse usando la ropa, no verla como un catálogo"
      },
      {
        label: "🤝 Estrategia de comunidad",
        options: [
          "Ignorar comentarios para parecer exclusivo",
          "Comprar seguidores para crecer rápido",
          "Repostear contenido de clientes usando la ropa (UGC)",
          "Solo publicar en días festivos"
        ],
        correct: 2,
        hint: "El contenido generado por usuarios (UGC) es la forma más auténtica y barata de publicidad"
      },
      {
        label: "📊 Métrica de éxito",
        options: [
          "Número total de seguidores acumulados",
          "Cuántos likes por publicación",
          "Tasa de conversión: visitas que se convierten en compras",
          "Cantidad de comentarios negativos recibidos"
        ],
        correct: 2,
        hint: "Las métricas de vanidad no pagan las facturas; la conversión sí"
      }
    ],
    points: 300,
    timeLimit: 60,
    explanation: "Ropa sostenible joven: mensaje con valores + video en contexto real + comunidad de clientes reales + medir conversión. Esta combinación transforma seguidores en compradores."
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// ESTADO GLOBAL
// La estructura de teams ahora incluye `members` para rastrear votos individuales
// en las rondas de tipo "vote"
// ─────────────────────────────────────────────────────────────────────────────
function freshState() {
  return {
    status: "waiting",
    currentRound: -1,
    teams: {},        // teamId → { id, name, score, members: { memberId → { id, name, vote } } }
    submissions: {},  // teamId → { answer, correct, earned }
    roundStartTime: null,
    roundTimer: null,
  };
}
let game = freshState();

const conns = new Map(); // ws → { role, teamId?, memberId? }

// ─── Broadcast helpers ────────────────────────────────────────────────────────
function bcast(data, filter) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(ws => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (filter && !filter(conns.get(ws))) return;
    ws.send(msg);
  });
}
const toAll  = d => bcast(d);
const toHost = d => bcast(d, c => c?.role === "host");
const toTeam = (tid, d) => bcast(d, c => c?.teamId === tid);

// ─── Scoreboard ───────────────────────────────────────────────────────────────
function scoreboard() {
  return Object.values(game.teams)
    .sort((a, b) => b.score - a.score)
    .map((t, i) => ({ rank: i + 1, name: t.name, score: t.score }));
}

function allSubmitted() {
  const ids = Object.keys(game.teams);
  return ids.length > 0 && ids.every(id => game.submissions[id]);
}

// ─── Consenso de votación interna del equipo ─────────────────────────────────
// Devuelve el índice con mayoría simple, o null si todavía no hay mayoría
function teamConsensus(teamId) {
  const members = Object.values(game.teams[teamId]?.members || {});
  if (!members.length) return null;
  const votes = members.map(m => m.vote).filter(v => v !== null && v !== undefined);
  if (!votes.length) return null;
  const tally = {};
  votes.forEach(v => { tally[v] = (tally[v] || 0) + 1; });
  const majority = Math.ceil(members.length / 2);
  const winner = Object.entries(tally).find(([, c]) => c >= majority);
  return winner ? parseInt(winner[0]) : null;
}

// ─── Evaluar respuesta según tipo de ronda ────────────────────────────────────
function evaluate(round, answer) {
  switch (round.type) {
    case "mcq":
    case "vote":
      // answer es un número entero
      return answer === round.correct;

    case "sort":
      // answer es un array de índices que debe coincidir con correctOrder
      if (!Array.isArray(answer) || answer.length !== round.correctOrder.length) return false;
      return answer.every((v, i) => v === round.correctOrder[i]);

    case "match":
      // answer es { "0": rightIdx, "1": rightIdx, ... } — cada left conectado al right correcto
      // El right correcto de cada par i es simplemente i (los pares están en orden)
      if (typeof answer !== "object" || answer === null) return false;
      return round.pairs.every((_, i) => parseInt(answer[String(i)]) === i);

    case "strategy":
      // answer es un array de índices seleccionados, uno por bloque
      if (!Array.isArray(answer) || answer.length !== round.blocks.length) return false;
      return round.blocks.every((b, i) => answer[i] === b.correct);

    default:
      return false;
  }
}

// ─── Puntuación parcial para "strategy" (puntos por bloque correcto) ──────────
function partialScore(round, answer, basePoints) {
  if (round.type !== "strategy") return evaluate(round, answer) ? basePoints : 0;
  if (!Array.isArray(answer)) return 0;
  const correct = round.blocks.filter((b, i) => answer[i] === b.correct).length;
  // Puntaje proporcional: total / bloques × aciertos
  return Math.round((basePoints / round.blocks.length) * correct);
}

// ─── Revelar ronda ────────────────────────────────────────────────────────────
function revealRound() {
  if (game.roundTimer) clearTimeout(game.roundTimer);
  if (game.status !== "round") return;
  game.status = "reveal";
  const round = ROUNDS[game.currentRound];
  toAll({
    type: "reveal",
    round,   // ahora sí enviamos la ronda completa con correctOrder, etc.
    explanation: round.explanation,
    scoreboard: scoreboard(),
    submissions: game.submissions,
    isLast: game.currentRound === ROUNDS.length - 1,
  });
}

function startRoundTimer(secs) {
  if (game.roundTimer) clearTimeout(game.roundTimer);
  game.roundTimer = setTimeout(revealRound, secs * 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBSOCKET
// ─────────────────────────────────────────────────────────────────────────────
wss.on("connection", ws => {
  conns.set(ws, { role: null });

  ws.on("message", raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const conn = conns.get(ws);

    switch (msg.type) {

      case "host_connect": {
        conns.set(ws, { role: "host" });
        ws.send(JSON.stringify({
          type: "host_init",
          teams: Object.values(game.teams).map(t => ({ id: t.id, name: t.name, score: t.score, memberCount: Object.keys(t.members).length })),
          status: game.status,
          totalRounds: ROUNDS.length,
          currentRound: game.currentRound,
        }));
        break;
      }

      // Un equipo crea su "sala" — el primer miembro hace esto
      case "join_team": {
        if (game.status !== "waiting") { ws.send(JSON.stringify({ type: "error", message: "El juego ya comenzó." })); return; }
        const teamName = (msg.name || "").trim().slice(0, 30);
        if (!teamName) { ws.send(JSON.stringify({ type: "error", message: "Escribe el nombre del equipo." })); return; }
        if (Object.values(game.teams).some(t => t.name.toLowerCase() === teamName.toLowerCase())) {
          ws.send(JSON.stringify({ type: "error", message: "Ese nombre ya existe. Elige otro." })); return;
        }
        const teamId = uuidv4();
        const memberName = (msg.memberName || "Capitán").trim().slice(0, 20);
        const memberId = uuidv4();
        game.teams[teamId] = { id: teamId, name: teamName, score: 0, members: { [memberId]: { id: memberId, name: memberName, vote: null } } };
        conns.set(ws, { role: "member", teamId, memberId });
        ws.send(JSON.stringify({ type: "team_created", teamId, teamName, memberId, memberName }));
        toAll({ type: "teams_update", teams: Object.values(game.teams).map(t => ({ name: t.name, score: t.score, memberCount: Object.keys(t.members).length })) });
        break;
      }

      // Otro miembro se une a un equipo ya creado, por nombre
      case "join_member": {
        if (game.status !== "waiting") { ws.send(JSON.stringify({ type: "error", message: "El juego ya comenzó." })); return; }
        const team = Object.values(game.teams).find(t => t.name.toLowerCase() === (msg.teamName || "").trim().toLowerCase());
        if (!team) { ws.send(JSON.stringify({ type: "error", message: "Equipo no encontrado. Verifica el nombre exacto." })); return; }
        const memberName = (msg.memberName || "Miembro").trim().slice(0, 20);
        const memberId = uuidv4();
        team.members[memberId] = { id: memberId, name: memberName, vote: null };
        conns.set(ws, { role: "member", teamId: team.id, memberId });
        ws.send(JSON.stringify({ type: "member_joined", teamId: team.id, teamName: team.name, memberId, memberName }));
        toTeam(team.id, { type: "members_update", members: Object.values(team.members).map(m => m.name) });
        toAll({ type: "teams_update", teams: Object.values(game.teams).map(t => ({ name: t.name, score: t.score, memberCount: Object.keys(t.members).length })) });
        break;
      }

      case "start_game": {
        if (conn?.role !== "host") return;
        if (!Object.keys(game.teams).length) { ws.send(JSON.stringify({ type: "error", message: "Necesitas al menos 1 equipo." })); return; }
        game.status = "round";
        game.currentRound = 0;
        game.submissions = {};
        Object.values(game.teams).forEach(t => Object.values(t.members).forEach(m => { m.vote = null; }));
        const r = ROUNDS[0];
        game.roundStartTime = Date.now();
        // Enviamos la ronda sin revelar la respuesta correcta todavía
        toAll({ type: "round_start", index: 0, total: ROUNDS.length, round: { ...r, correctOrder: undefined, correct: undefined, blocks: r.blocks?.map(b => ({ ...b, correct: undefined })) } });
        startRoundTimer(r.timeLimit);
        break;
      }

      case "next_round": {
        if (conn?.role !== "host") return;
        game.currentRound++;
        if (game.currentRound >= ROUNDS.length) {
          game.status = "finished";
          toAll({ type: "game_over", scoreboard: scoreboard() });
          return;
        }
        game.status = "round";
        game.submissions = {};
        Object.values(game.teams).forEach(t => Object.values(t.members).forEach(m => { m.vote = null; }));
        const r = ROUNDS[game.currentRound];
        game.roundStartTime = Date.now();
        toAll({ type: "round_start", index: game.currentRound, total: ROUNDS.length, round: { ...r, correctOrder: undefined, correct: undefined, blocks: r.blocks?.map(b => ({ ...b, correct: undefined })) } });
        startRoundTimer(r.timeLimit);
        break;
      }

      case "reveal_now": {
        if (conn?.role !== "host") return;
        revealRound();
        break;
      }

      case "reset_game": {
        if (conn?.role !== "host") return;
        if (game.roundTimer) clearTimeout(game.roundTimer);
        game = freshState();
        toAll({ type: "game_reset" });
        break;
      }

      // Respuesta final del equipo (mcq, sort, match, strategy)
      case "submit_answer": {
        if (!conn?.teamId || game.status !== "round") return;
        if (game.submissions[conn.teamId]) return;
        const round = ROUNDS[game.currentRound];
        const elapsed = (Date.now() - game.roundStartTime) / 1000;
        const earned = partialScore(round, msg.answer, round.points) +
          (evaluate(round, msg.answer) ? Math.max(0, Math.floor((1 - elapsed / round.timeLimit) * 60)) : 0);
        game.teams[conn.teamId].score += earned;
        game.submissions[conn.teamId] = { answer: msg.answer, correct: evaluate(round, msg.answer), earned };
        toTeam(conn.teamId, { type: "answer_received", correct: evaluate(round, msg.answer), earned, score: game.teams[conn.teamId].score });
        toHost({ type: "progress", answered: Object.keys(game.submissions).length, total: Object.keys(game.teams).length });
        if (allSubmitted()) revealRound();
        break;
      }

      // Voto individual de un miembro (solo en rondas tipo "vote")
      case "cast_vote": {
        if (conn?.role !== "member" || game.status !== "round") return;
        const round = ROUNDS[game.currentRound];
        if (round.type !== "vote") return;
        const team = game.teams[conn.teamId];
        if (!team?.members[conn.memberId]) return;
        team.members[conn.memberId].vote = msg.option;
        // Enviar conteo de votos al equipo (sin revelar quién votó qué)
        const members = Object.values(team.members);
        const tally = {};
        members.forEach(m => { if (m.vote !== null) tally[m.vote] = (tally[m.vote] || 0) + 1; });
        toTeam(conn.teamId, { type: "vote_update", tally, voted: members.filter(m => m.vote !== null).length, total: members.length });
        // Si hay consenso, enviar la respuesta del equipo automáticamente
        const consensus = teamConsensus(conn.teamId);
        if (consensus !== null && !game.submissions[conn.teamId]) {
          const elapsed = (Date.now() - game.roundStartTime) / 1000;
          const isCorrect = evaluate(round, consensus);
          const earned = isCorrect ? round.points + Math.max(0, Math.floor((1 - elapsed / round.timeLimit) * 60)) : 0;
          game.teams[conn.teamId].score += earned;
          game.submissions[conn.teamId] = { answer: consensus, correct: isCorrect, earned };
          toTeam(conn.teamId, { type: "answer_received", correct: isCorrect, earned, score: game.teams[conn.teamId].score, consensus: true });
          toHost({ type: "progress", answered: Object.keys(game.submissions).length, total: Object.keys(game.teams).length });
          if (allSubmitted()) revealRound();
        }
        break;
      }
    }
  });

  ws.on("close", () => {
    const conn = conns.get(ws);
    if (conn?.role === "member" && game.status === "waiting" && conn.teamId) {
      const team = game.teams[conn.teamId];
      if (team) {
        delete team.members[conn.memberId];
        // Si el equipo queda sin miembros, eliminarlo
        if (!Object.keys(team.members).length) delete game.teams[conn.teamId];
        toAll({ type: "teams_update", teams: Object.values(game.teams).map(t => ({ name: t.name, score: t.score, memberCount: Object.keys(t.members).length })) });
      }
    }
    conns.delete(ws);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Quiz server on port ${PORT}`));
