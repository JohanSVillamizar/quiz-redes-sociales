const express = require("express");
const { WebSocketServer, WebSocket } = require("ws");
const { createServer } = require("http");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, "public")));

// ─── PREGUNTAS DEL QUIZ ───────────────────────────────────────────────────────
// Cada pregunta tiene: texto, 4 opciones, índice de la correcta (0-3) y puntos
const QUESTIONS = [
  {
    text: "¿Cuántos segundos tienes para capturar la atención antes de que el algoritmo deje de mostrar tu video?",
    options: ["10 segundos", "5 segundos", "3 segundos", "1 segundo"],
    correct: 2,
    points: 100,
    explanation: "La regla de los 3 segundos: si el usuario no se queda, el algoritmo reduce la distribución del video."
  },
  {
    text: "¿Qué plataforma es mejor si quieres construir autoridad profunda con tutoriales largos?",
    options: ["TikTok", "Instagram", "YouTube", "Facebook"],
    correct: 2,
    points: 100,
    explanation: "YouTube construye autoridad a largo plazo. Un buen tutorial puede traerte clientes años después de publicarlo."
  },
  {
    text: "Tienes un negocio nuevo. ¿Cuántas redes sociales deberías dominar primero?",
    options: ["Todas las posibles", "3 redes", "2 redes máximo", "1 o 2 redes"],
    correct: 3,
    points: 100,
    explanation: "Enfocarse en 1 o 2 redes primero permite construir una comunidad sólida antes de expandirse."
  },
  {
    text: "¿Cuál es la fórmula de contenido recomendada para crecer de forma orgánica?",
    options: ["100% contenido de valor", "70% orgánico + 30% pagado", "50% ventas + 50% valor", "80% pagado + 20% orgánico"],
    correct: 1,
    points: 150,
    explanation: "70% esfuerzo orgánico + 30% inversión pagada en contenidos que ya demostraron su valor funcionan mejor."
  },
  {
    text: "¿Qué herramienta gratuita sirve para diseñar publicaciones sin ser diseñador?",
    options: ["Photoshop", "Canva", "Figma", "Illustrator"],
    correct: 1,
    points: 100,
    explanation: "Canva es la herramienta de diseño más accesible para crear contenido visual profesional sin experiencia previa."
  },
  {
    text: "Un negocio que SOLO publica para vender, sin dar valor, comete un error clásico. ¿Cuál es la regla correcta?",
    options: ["100% ventas siempre", "80% ventas, 20% valor", "80% valor, 20% ventas", "50% y 50%"],
    correct: 2,
    points: 150,
    explanation: "La regla 80/20: 80% contenido útil para la audiencia y solo 20% de venta directa. Primero dar, luego pedir."
  },
  {
    text: "¿Cuál de estas acciones genera MÁS confianza con tu audiencia en redes?",
    options: ["Publicar muchas fotos de productos", "Ignorar comentarios negativos", "Mostrar el proceso real y detrás de cámara", "Comprar seguidores para parecer popular"],
    correct: 2,
    points: 200,
    explanation: "Mostrar el proceso real genera autenticidad. La gente compra de quien le parece genuino, no de quien parece perfecto."
  }
];

// ─── ESTADO GLOBAL DEL JUEGO ──────────────────────────────────────────────────
// Este objeto centraliza todo lo que pasa en la partida
let gameState = {
  status: "waiting",      // waiting | question | reveal | finished
  currentQuestion: -1,
  teams: {},              // { teamId: { name, score, answered, lastAnswer } }
  questionStartTime: null,
  timeLimit: 20,          // segundos por pregunta
  questionTimer: null,
};

// ─── MAPA DE CONEXIONES WebSocket ─────────────────────────────────────────────
// Guardamos cada conexión con su rol (host o team)
const connections = new Map(); // ws → { role: 'host'|'team', teamId? }

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function broadcast(data, filter = null) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState !== WebSocket.OPEN) return;
    if (filter && !filter(connections.get(client))) return;
    client.send(msg);
  });
}

function broadcastToAll(data) { broadcast(data); }
function broadcastToHost(data) { broadcast(data, c => c?.role === "host"); }
function broadcastToTeams(data) { broadcast(data, c => c?.role === "team"); }

function getScoreboard() {
  return Object.values(gameState.teams)
    .sort((a, b) => b.score - a.score)
    .map((t, i) => ({ rank: i + 1, name: t.name, score: t.score }));
}

function allTeamsAnswered() {
  const teams = Object.values(gameState.teams);
  if (teams.length === 0) return false;
  return teams.every(t => t.answered);
}

function startQuestionTimer() {
  // Limpia timer anterior si existe
  if (gameState.questionTimer) clearTimeout(gameState.questionTimer);
  gameState.questionTimer = setTimeout(() => {
    // Tiempo agotado — revelar respuesta automáticamente
    revealAnswer();
  }, gameState.timeLimit * 1000);
}

function revealAnswer() {
  if (gameState.questionTimer) clearTimeout(gameState.questionTimer);
  if (gameState.status !== "question") return;

  gameState.status = "reveal";
  const q = QUESTIONS[gameState.currentQuestion];

  // Calcular cuántos acertaron
  const results = Object.values(gameState.teams).map(t => ({
    name: t.name,
    correct: t.lastAnswer === q.correct,
    answer: t.lastAnswer,
    score: t.score,
  }));

  broadcastToAll({
    type: "reveal",
    correctIndex: q.correct,
    explanation: q.explanation,
    scoreboard: getScoreboard(),
    results,
    isLast: gameState.currentQuestion === QUESTIONS.length - 1,
  });
}

// ─── LÓGICA DE WEBSOCKET ──────────────────────────────────────────────────────
wss.on("connection", (ws) => {
  connections.set(ws, { role: null });

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const conn = connections.get(ws);

    switch (msg.type) {

      // El host se conecta (pantalla del profesor)
      case "host_connect": {
        connections.set(ws, { role: "host" });
        ws.send(JSON.stringify({
          type: "host_init",
          teams: Object.values(gameState.teams).map(t => ({ id: t.id, name: t.name, score: t.score })),
          status: gameState.status,
          totalQuestions: QUESTIONS.length,
          currentQuestion: gameState.currentQuestion,
        }));
        break;
      }

      // Un equipo se une al juego
      case "join": {
        if (gameState.status !== "waiting") {
          ws.send(JSON.stringify({ type: "error", message: "El juego ya comenzó. Espera la próxima ronda." }));
          return;
        }
        const teamName = (msg.name || "").trim().slice(0, 30);
        if (!teamName) {
          ws.send(JSON.stringify({ type: "error", message: "Escribe un nombre para tu equipo." }));
          return;
        }
        // Verificar nombre duplicado
        const exists = Object.values(gameState.teams).some(t => t.name.toLowerCase() === teamName.toLowerCase());
        if (exists) {
          ws.send(JSON.stringify({ type: "error", message: "Ese nombre ya está en uso. Elige otro." }));
          return;
        }

        const teamId = uuidv4();
        gameState.teams[teamId] = { id: teamId, name: teamName, score: 0, answered: false, lastAnswer: null };
        connections.set(ws, { role: "team", teamId });

        ws.send(JSON.stringify({ type: "joined", teamId, name: teamName }));

        // Notificar a todos que llegó un nuevo equipo
        broadcastToAll({ type: "team_joined", teams: Object.values(gameState.teams).map(t => ({ name: t.name, score: t.score })) });
        break;
      }

      // El host inicia el juego
      case "start_game": {
        if (conn?.role !== "host") return;
        if (Object.keys(gameState.teams).length < 1) {
          ws.send(JSON.stringify({ type: "error", message: "Necesitas al menos 1 equipo para comenzar." }));
          return;
        }
        gameState.status = "question";
        gameState.currentQuestion = 0;
        // Resetear respuestas
        Object.values(gameState.teams).forEach(t => { t.answered = false; t.lastAnswer = null; });

        const q = QUESTIONS[0];
        gameState.questionStartTime = Date.now();
        broadcastToAll({
          type: "question",
          index: 0,
          total: QUESTIONS.length,
          text: q.text,
          options: q.options,
          timeLimit: gameState.timeLimit,
          points: q.points,
        });
        startQuestionTimer();
        break;
      }

      // El host avanza a la siguiente pregunta
      case "next_question": {
        if (conn?.role !== "host") return;
        gameState.currentQuestion++;

        if (gameState.currentQuestion >= QUESTIONS.length) {
          // Juego terminado
          gameState.status = "finished";
          broadcastToAll({ type: "game_over", scoreboard: getScoreboard() });
          return;
        }

        gameState.status = "question";
        Object.values(gameState.teams).forEach(t => { t.answered = false; t.lastAnswer = null; });

        const q = QUESTIONS[gameState.currentQuestion];
        gameState.questionStartTime = Date.now();
        broadcastToAll({
          type: "question",
          index: gameState.currentQuestion,
          total: QUESTIONS.length,
          text: q.text,
          options: q.options,
          timeLimit: gameState.timeLimit,
          points: q.points,
        });
        startQuestionTimer();
        break;
      }

      // El host revela la respuesta manualmente
      case "reveal_now": {
        if (conn?.role !== "host") return;
        revealAnswer();
        break;
      }

      // Un equipo envía su respuesta
      case "answer": {
        if (conn?.role !== "team") return;
        if (gameState.status !== "question") return;

        const team = gameState.teams[conn.teamId];
        if (!team || team.answered) return; // Ya respondió, ignorar

        const elapsed = (Date.now() - gameState.questionStartTime) / 1000;
        const q = QUESTIONS[gameState.currentQuestion];
        const isCorrect = msg.answer === q.correct;

        // Puntos con bonus de velocidad: más rápido = más puntos extra
        let earned = 0;
        if (isCorrect) {
          const speedBonus = Math.max(0, Math.floor((1 - elapsed / gameState.timeLimit) * 50));
          earned = q.points + speedBonus;
          team.score += earned;
        }

        team.answered = true;
        team.lastAnswer = msg.answer;

        // Confirmar al equipo
        ws.send(JSON.stringify({ type: "answer_received", correct: isCorrect, earned, score: team.score }));

        // Notificar al host cuántos han respondido
        const answered = Object.values(gameState.teams).filter(t => t.answered).length;
        const total = Object.keys(gameState.teams).length;
        broadcastToHost({ type: "progress", answered, total });

        // Si todos respondieron, revelar automáticamente
        if (allTeamsAnswered()) revealAnswer();
        break;
      }

      // El host reinicia el juego
      case "reset_game": {
        if (conn?.role !== "host") return;
        if (gameState.questionTimer) clearTimeout(gameState.questionTimer);
        gameState = {
          status: "waiting",
          currentQuestion: -1,
          teams: {},
          questionStartTime: null,
          timeLimit: 20,
          questionTimer: null,
        };
        broadcastToAll({ type: "game_reset" });
        break;
      }
    }
  });

  ws.on("close", () => {
    const conn = connections.get(ws);
    if (conn?.role === "team" && conn.teamId) {
      // Si el juego no empezó, sacar al equipo
      if (gameState.status === "waiting") {
        delete gameState.teams[conn.teamId];
        broadcastToAll({ type: "team_joined", teams: Object.values(gameState.teams).map(t => ({ name: t.name, score: t.score })) });
      }
    }
    connections.delete(ws);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Quiz server running on port ${PORT}`));
