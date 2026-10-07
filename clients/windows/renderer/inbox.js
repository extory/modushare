const status = document.getElementById('status');
let generation = 0;
async function load() {
  const current = ++generation;
  const result = await window.sharing.inbox();
  if (current !== generation) return;
  const list = document.getElementById('items'); list.replaceChildren();
  if (!result.ok) { status.textContent = result.error; return; }
  status.textContent = result.items.length ? `${result.items.length} / 10건` : '아직 받은 복사 내용이 없습니다.';
  result.items.forEach(item => {
    const card = document.createElement('article');
    const sender = document.createElement('strong'); sender.textContent = item.senderEmail;
    const date = document.createElement('time'); date.dateTime = new Date(item.createdAt).toISOString();
    date.textContent = new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(item.createdAt);
    const preview = document.createElement('pre'); preview.textContent = item.payload.contentType === 'image' ? '이미지' : item.payload.content;
    const button = document.createElement('button'); button.textContent = '선택하여 붙여넣기 준비';
    button.onclick = async () => { button.disabled = true; const r = await window.sharing.select(item.id); if(!r.ok) status.textContent = r.error; button.disabled = false; };
    card.append(sender,date,preview,button); list.append(card);
  });
}
document.getElementById('refresh').onclick = load;
window.sharing.onChanged(load);
window.addEventListener('focus',load);
load();
