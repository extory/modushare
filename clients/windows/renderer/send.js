const targets = document.getElementById('targets');
const send = document.getElementById('send');
const status = document.getElementById('status');
let devices = [];
async function load() {
  const result = await window.sharing.targets();
  if (!result.ok) { status.textContent = result.error; return; }
  document.getElementById('preview').textContent = result.preview;
  devices = result.devices;
  if (!devices.length) status.textContent = '공유 가능한 기기가 없습니다. 상대 기기에서 새 버전으로 로그인하고 공유 관계를 설정하세요.';
  devices.forEach((device, index) => {
    const label = document.createElement('label'); label.className = 'target';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = index;
    checkbox.onchange = () => { send.disabled = !targets.querySelector(':checked'); };
    label.append(checkbox, document.createTextNode(`${device.name} · ${device.email}`)); targets.append(label);
  });
}
send.onclick = async () => {
  send.disabled = true; status.textContent = '보내는 중…';
  const selected = [...targets.querySelectorAll(':checked')].map(c => ({userId:devices[c.value].userId, deviceId:devices[c.value].deviceId}));
  const result = await window.sharing.send(selected);
  status.textContent = result.ok ? `${result.count}개 기기에 보냈습니다.` : result.error;
  if(result.ok) setTimeout(() => window.close(), 900); else send.disabled = false;
};
load();
