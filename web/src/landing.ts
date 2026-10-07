const video = document.querySelector<HTMLVideoElement>('#story-video');
const toggle = document.querySelector<HTMLButtonElement>('#story-toggle');
const replay = document.querySelector<HTMLButtonElement>('#story-replay');
const progress = document.querySelector<HTMLElement>('#story-progress');
const caption = document.querySelector<HTMLElement>('#story-caption');
const step = document.querySelector<HTMLElement>('#story-step');
const overview = document.querySelector<HTMLElement>('#overview');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let interacted = Boolean(location.hash);
const captions = [
  [0, '생각을 종이에 적고.'], [1.05, '전하고 싶은 마음을 접어.'],
  [3.85, '기기의 경계를 넘어.'], [6.85, '당신에게 도착하면.'], [8.2, '같은 생각이, 그대로 펼쳐져요.'],
] as const;
function markInteraction() { interacted = true; }
window.addEventListener('wheel', markInteraction, { passive: true });
window.addEventListener('touchstart', markInteraction, { passive: true });
window.addEventListener('keydown', markInteraction);
document.querySelectorAll('a').forEach(a => a.addEventListener('click', markInteraction));
if (video && toggle && replay && overview) {
  const sync = () => {
    video.closest('.cinema')?.classList.toggle('is-playing', !video.paused && !video.ended);
    toggle.textContent = video.paused ? '재생 ▷' : '일시정지 Ⅱ';
    toggle.setAttribute('aria-label', video.paused ? '영상 재생' : '영상 일시정지');
  };
  const play = () => video.play().catch(() => { sync(); });
  toggle.addEventListener('click', () => { interacted = true; if (video.paused) void play(); else video.pause(); });
  replay.addEventListener('click', () => { interacted = true; video.currentTime = 0; void play(); });
  document.querySelector('#story-skip')?.addEventListener('click', () => video.pause());
  video.addEventListener('play', sync); video.addEventListener('pause', sync);
  video.addEventListener('timeupdate', () => {
    let index = 0; captions.forEach(([time], i) => { if (video.currentTime >= time) index = i; });
    if (caption) caption.textContent = captions[index]![1];
    if (step) step.textContent = `0${index + 1} / 05`;
    if (progress) progress.style.transform = `scaleX(${video.duration ? Math.min(1, video.currentTime / video.duration) : 0})`;
  });
  video.addEventListener('ended', () => {
    sync();
    if (!interacted && !reduced.matches && document.visibilityState === 'visible' && window.scrollY < 100) overview.scrollIntoView({ behavior: 'smooth' });
  });
  video.addEventListener('error', () => { if (caption) caption.textContent = '복사한 생각을, 다른 기기에 그대로.'; toggle.hidden = true; replay.hidden = true; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });
  reduced.addEventListener('change', () => { if (reduced.matches) video.pause(); });
  if (!reduced.matches && !location.hash) void play();
}
