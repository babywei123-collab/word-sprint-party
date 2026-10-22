import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import englishWords from 'an-array-of-english-words';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = process.env.PORT || 3000;
const rooms = new Map();
// A 2,000-word deck. Each room consumes a word only once, so a game never
// repeats a word (and ends cleanly after the whole deck has been used).
const WORDS = [...new Set(englishWords.filter(word =>
  /^[a-z]{4,10}$/.test(word) && new Set(word).size >= 3
))].slice(0, 2000);

app.use(express.static('.'));
app.get('/health', (_, res) => res.send('ok'));
const clean = v => String(v || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16).toUpperCase();
function state(room) {
  return { room: room.id, phase: room.phase, round: room.round, question: room.question,
    players: [...room.players.values()].map(({id, ...p}) => p).sort((a,b) => b.score-a.score), host: room.host };
}
function broadcast(room) { io.to(room.id).emit('state', state(room)); }
function scramble(word) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const mixed = [...word].sort(() => Math.random() - 0.5).join('');
    if (mixed !== word) return mixed;
  }
  return [...word].reverse().join('');
}
function nextQuestion(room) {
  const pool = WORDS.filter(word => !room.usedWords.has(word));
  if (!pool.length) { room.phase = 'complete'; room.question = null; broadcast(room); return; }
  const word = pool[Math.floor(Math.random() * pool.length)];
  room.usedWords.add(word);
  room.question = { word, scramble: scramble(word), startedAt: Date.now(), duration: 12000 }; room.phase = 'playing'; room.round++;
  room.answered = new Set(); broadcast(room);
  clearTimeout(room.timer); room.timer = setTimeout(() => { if (room.phase === 'playing') { room.phase = 'reveal'; broadcast(room); } }, 12000);
}
io.on('connection', socket => {
  socket.on('join', ({room: rawRoom, name}) => {
    const id = clean(rawRoom) || Math.random().toString(36).slice(2,8).toUpperCase();
    const playerName = String(name || '玩家').trim().slice(0, 12) || '玩家';
    let room = rooms.get(id);
    if (!room) { room = { id, host: socket.id, players: new Map(), phase: 'lobby', round: 0, question: null, answered: new Set(), usedWords: new Set() }; rooms.set(id, room); }
    socket.join(id); socket.data.room = id;
    room.players.set(socket.id, { id: socket.id, name: playerName, score: 0 });
    socket.emit('joined', { room: id, isHost: room.host === socket.id }); broadcast(room);
  });
  socket.on('start', () => { const room = rooms.get(socket.data.room); if (room && room.host === socket.id) nextQuestion(room); });
  socket.on('answer', value => {
    const room = rooms.get(socket.data.room); if (!room || room.phase !== 'playing' || room.answered.has(socket.id)) return;
    room.answered.add(socket.id); const p = room.players.get(socket.id);
    const correct = String(value).trim().toLowerCase() === room.question.word.toLowerCase();
    if (correct && p) p.score += Math.max(100, 1000 - Math.floor((Date.now()-room.question.startedAt)/12));
    socket.emit('answer-result', { correct, word: room.question.word }); broadcast(room);
  });
  socket.on('next', () => { const room = rooms.get(socket.data.room); if (room && room.host === socket.id) nextQuestion(room); });
  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.room); if (!room) return;
    room.players.delete(socket.id); if (room.host === socket.id) room.host = room.players.keys().next().value;
    if (!room.players.size) { clearTimeout(room.timer); rooms.delete(room.id); } else broadcast(room);
  });
});
httpServer.listen(PORT, () => console.log(`Word Sprint running on ${PORT}`));
