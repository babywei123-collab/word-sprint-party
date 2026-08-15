import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = process.env.PORT || 3000;
const rooms = new Map();
const WORDS = [
  ['adventure','冒險'],['brilliant','聰明絕頂的'],['curious','好奇的'],['delicious','美味的'],
  ['discover','發現'],['enormous','巨大的'],['friendly','友善的'],['grateful','感激的'],
  ['imagine','想像'],['journey','旅程'],['knowledge','知識'],['laughter','笑聲'],
  ['mystery','謎團'],['nervous','緊張的'],['opportunity','機會'],['peaceful','平靜的'],
  ['quality','品質'],['rainbow','彩虹'],['surprise','驚喜'],['thoughtful','體貼的']
];

app.use(express.static('.'));
app.get('/health', (_, res) => res.send('ok'));
const clean = v => String(v || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16).toUpperCase();
function state(room) {
  return { room: room.id, phase: room.phase, round: room.round, question: room.question,
    players: [...room.players.values()].map(({id, ...p}) => p).sort((a,b) => b.score-a.score), host: room.host };
}
function broadcast(room) { io.to(room.id).emit('state', state(room)); }
function nextQuestion(room) {
  const pool = WORDS.filter(([word]) => word !== room.lastWord);
  const [word, meaning] = pool[Math.floor(Math.random() * pool.length)]; room.lastWord = word;
  room.question = { word, meaning, startedAt: Date.now(), duration: 12000 }; room.phase = 'playing'; room.round++;
  room.answered = new Set(); broadcast(room);
  clearTimeout(room.timer); room.timer = setTimeout(() => { if (room.phase === 'playing') { room.phase = 'reveal'; broadcast(room); } }, 12000);
}
io.on('connection', socket => {
  socket.on('join', ({room: rawRoom, name}) => {
    const id = clean(rawRoom) || Math.random().toString(36).slice(2,8).toUpperCase();
    const playerName = String(name || '玩家').trim().slice(0, 12) || '玩家';
    let room = rooms.get(id);
    if (!room) { room = { id, host: socket.id, players: new Map(), phase: 'lobby', round: 0, question: null, answered: new Set() }; rooms.set(id, room); }
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
    socket.emit('answer-result', { correct, word: room.question.word, meaning: room.question.meaning }); broadcast(room);
  });
  socket.on('next', () => { const room = rooms.get(socket.data.room); if (room && room.host === socket.id) nextQuestion(room); });
  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.room); if (!room) return;
    room.players.delete(socket.id); if (room.host === socket.id) room.host = room.players.keys().next().value;
    if (!room.players.size) { clearTimeout(room.timer); rooms.delete(room.id); } else broadcast(room);
  });
});
httpServer.listen(PORT, () => console.log(`Word Sprint running on ${PORT}`));
