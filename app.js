// Render's free service can take a moment to wake up. Keep retrying so that a
// player who taps Join while it wakes up is taken into the room automatically.
const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 60000,
});
const $ = id => document.getElementById(id); let isHost=false, state, timer;
const roomFromUrl = new URLSearchParams(location.search).get('room'); if(roomFromUrl) $('room').value=roomFromUrl;
$('join').onclick=()=>{const name=$('name').value.trim();if(!name){toast('請先輸入暱稱');$('name').focus();return}toast(socket.connected?'正在加入房間…':'正在喚醒遊戲伺服器，請稍候…');socket.emit('join',{name,room:$('room').value});};
socket.on('joined',d=>{isHost=d.isHost;$('room-code').textContent=d.room;history.replaceState({},'',`?room=${d.room}`);$('join-screen').classList.add('hidden');$('game-screen').classList.remove('hidden');});
socket.on('connect_error',()=>toast('遊戲伺服器正在連線，會自動重試…'));
socket.on('state',s=>{state=s;render();});
function render(){if(!state)return;$('scores').innerHTML=state.players.map(p=>`<li>${escapeHtml(p.name)} <b>${p.score}</b></li>`).join('');$('status').textContent=`${state.players.length} 位玩家`;
 const lobby=state.phase==='lobby';$('lobby').classList.toggle('hidden',!lobby);$('quiz').classList.toggle('hidden',lobby);$('start').classList.toggle('hidden',!isHost);if(lobby)return;
 $('round').textContent=state.round;$('meaning').textContent=state.question.meaning;$('answer').disabled=state.phase!=='playing';$('submit').classList.toggle('hidden',state.phase!=='playing');$('next').classList.toggle('hidden',!(state.phase==='reveal'&&isHost));if(state.phase==='playing'){ $('answer').value='';$('feedback').textContent='';$('feedback').className='feedback';$('answer').focus();startTimer();}else{clearInterval(timer);$('feedback').textContent=`答案是 ${state.question.word}`;$('feedback').className='feedback';}}
function startTimer(){clearInterval(timer);timer=setInterval(()=>{const left=Math.max(0,1-(Date.now()-state.question.startedAt)/state.question.duration);$('timerbar').style.transform=`scaleX(${left})`;if(!left)clearInterval(timer)},50)}
function submit(){if(!$('answer').value.trim())return;socket.emit('answer',$('answer').value);$('submit').classList.add('hidden');}
$('submit').onclick=submit;$('answer').onkeydown=e=>{if(e.key==='Enter')submit()};$('start').onclick=()=>socket.emit('start');$('next').onclick=()=>socket.emit('next');
socket.on('answer-result',r=>{clearInterval(timer);$('feedback').textContent=r.correct?'答對了！太厲害！':'再想想！';$('feedback').className='feedback '+(r.correct?'good':'bad');});
$('share').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('邀請連結已複製，傳給朋友吧！')}catch{toast('請從瀏覽器網址列複製連結') }};
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2600)}function escapeHtml(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
