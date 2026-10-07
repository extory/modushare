const params = new URLSearchParams(location.search);
const sending = params.get('direction') === 'send';
const paper = document.querySelector('.paper');
const x = Number(params.get('x')), y = Number(params.get('y'));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const start = sending ? [innerWidth * .4, innerHeight * .48] : [-100, innerHeight * .25];
const finish = sending ? [innerWidth + 100, innerHeight * .3] : [x - 43, y - 32];
paper.animate(reduced ? [{opacity:0},{opacity:1},{opacity:0}] : [
  {transform:`translate(${start[0]}px,${start[1]}px) scale(1)`,opacity:0},
  {transform:`translate(${start[0]}px,${start[1]}px) scale(1)`,opacity:1,offset:.28},
  {transform:`translate(${(start[0]+finish[0])*.55}px,${innerHeight*.2}px) rotate(-12deg) scale(.9)`,opacity:1,offset:.65},
  {transform:`translate(${finish[0]}px,${finish[1]}px) rotate(15deg) scale(${sending?'.65':'.08'})`,opacity:0}
],{duration:1800,fill:'forwards',easing:'ease-in-out'});
if(reduced){paper.style.left=`${x-43}px`;paper.style.top=`${y-80}px`;}
