// Reproducible original vector animation, rendered to an actual H.264 video.
// Requires sharp (workspace dependency) and ffmpeg on PATH.
const sharp = require('sharp');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const out = path.resolve(__dirname, '../public/media');
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x=clamp(x); return x*x*(3-2*x); };
const mix = (a,b,t) => a+(b-a)*t;
function person(x, woman, t) {
 const reach = woman ? ease((t-6.2)/.8)*(1-ease((t-8)/1)) : ease((t-3.5)/.8)*(1-ease((t-5)/1));
 const work = woman ? ease((t-7.6)/1) : 1-ease((t-3.5)/.6);
 const hX = woman ? mix(-65,-170,reach) : mix(130,215,reach);
 const hY = woman ? mix(180,112,reach) : mix(165,80,reach);
 const arm = woman ? `M-65 95 Q-112 166 ${hX} ${hY}` : `M68 95 Q118 170 ${hX} ${hY}`;
 return `<g transform="translate(${x} 385)">
 <ellipse cx="5" cy="432" rx="123" ry="13" fill="#19283c" opacity=".09"/>
 ${woman?'<path d="M-62-70Q-90-20-65 93L80 90Q104-70 37-92Z" fill="#302940"/>':''}
 <path d="M-43 230L-52 391M44 230L69 391" fill="none" stroke="${woman?'#697580':'#273c57'}" stroke-width="53"/>
 <path d="M-52 389L-81 416H-22L-22 391M69 389L99 416H39L39 391" fill="${woman?'#fcfcfa':'#e3cda8'}" stroke="#273c57" stroke-width="3" stroke-linejoin="round"/>
 <path d="M-23 36L-26 61H28L23 32" fill="#d99571"/>
 <path d="M-30 52Q-66 52-88 102L-61 120L-61 239Q0 260 65 237L62 119L90 102Q75 59 29 51Q2 73-30 52Z" fill="${woman?'#d3c2f0':'#e5b83d'}" stroke="#25364b" stroke-width="3"/>
 <path d="M-57 123L-61 236M59 125L63 233" stroke="${woman?'#aa90d4':'#c59924'}" stroke-width="2"/>
 <text x="0" y="124" text-anchor="middle" font-family="Arial,sans-serif" font-size="${woman?25:23}" font-weight="700" fill="#26344a">${woman?'macOS':'Windows'}</text>
 <path d="${arm}" fill="none" stroke="#edb08c" stroke-width="27" stroke-linecap="round"/>
 <path d="${woman?'M64 105Q114 187 10 190':'M-67 105Q-105 190 66 194'}" fill="none" stroke="#edb08c" stroke-width="26" stroke-linecap="round"/>
 <circle cx="${hX}" cy="${hY}" r="15" fill="#edb08c"/>
 <g transform="rotate(${woman?-5:7} 0 -25)">
 <ellipse cx="0" cy="-23" rx="53" ry="65" fill="#efb590" stroke="#28364b" stroke-width="2"/>
 <ellipse cx="${woman?-51:51}" cy="-20" rx="10" ry="15" fill="#edb08c"/>
 ${woman?'<path d="M-55-20Q-20-31-12-74Q7-38 58-30Q70-101 1-94Q-63-96-55-20" fill="#302940"/>':'<path d="M-52-30Q-69-56-45-75Q-50-100-21-91Q9-111 26-85Q69-82 52-42Q24-41 10-62Q-21-49-52-30" fill="#29323d"/>'}
 <path d="M-23-26h9M19-26h9" stroke="#25364b" stroke-width="4" stroke-linecap="round"/>
 <path d="M2-21L-3-5H5" stroke="#bd7b59" fill="none" stroke-width="2"/>
 <path d="M-11 12Q3 ${t>8?29:21} 18 10" fill="none" stroke="#864e42" stroke-width="3" stroke-linecap="round"/>
 <ellipse cx="-30" cy="-1" rx="10" ry="5" fill="#dc8a78" opacity=".45"/>
 </g>
 ${!woman && t<2.3?`<g transform="translate(${129+Math.sin(t*16)*10} ${151+Math.sin(t*8)*5}) rotate(25)"><rect x="0" y="-52" width="7" height="62" rx="2" fill="#555083"/><path d="M0 10L3.5 20 7 10" fill="#26344a"/></g>`:''}
 </g>`;
}
function sheet(x,y,w,h,words,rotation=0){return `<g transform="translate(${x} ${y}) rotate(${rotation})"><rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="3" fill="#fffefb" stroke="#334558" stroke-width="2"/><path d="M${-w*.3} ${h*.16}H${w*.3}M${-w*.3} ${h*.28}H${w*.1}" stroke="#c4cada" stroke-width="3"/><text x="0" y="0" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.min(19,w*.19)}" font-weight="bold" fill="#5b51bb">${words}</text></g>`;}
function plane(x,y,scale=1,angle=0){return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})"><path d="M-65-30L72 0-62 37-34 2Z" fill="#fffefa" stroke="#333e64" stroke-width="2"/><path d="M-34 2L72 0-18 18Z" fill="#beb5e7"/><path d="M-34 2L-18 18-27 32Z" fill="#7263b8"/></g>`;}
function frame(t){
 let paper='';
 if(t<2.2) paper=sheet(507,562,132,94,'HELLO!'.slice(0,Math.floor(t*4)),-9);
 else if(t<3.6){const f=ease((t-2.2)/1.4);paper=sheet(507,555,132*(1-f*.72),94*(1-f*.4),'',mix(-9,-26,f));paper+=`<g opacity="${f}">${plane(507,555,.85,0)}</g>`;}
 else if(t<4.4){const f=ease((t-3.6)/.8);paper=plane(mix(507,595,f),mix(555,465,f),.85,-15*f);}
 else if(t<7.3){const f=(t-4.4)/2.9;const x=mix(595,1020,f);const y=465+95*Math.sin(f*Math.PI)+25*f;paper=`<path d="M590 473 Q800 650 ${x} ${y}" fill="none" stroke="#bbb0da" stroke-width="2" stroke-dasharray="5 12" opacity=".5"/>`+plane(x,y,.85+Math.sin(f*Math.PI)*.25,-25*Math.cos(f*Math.PI));}
 else if(t<8.4){const f=ease((t-7.3)/1.1);paper=plane(mix(1020,1112,f),mix(490,557,f),.85,mix(25,0,f));}
 else {const f=ease((t-8.4)/1.2);paper=sheet(1112,557,mix(36,144,f),mix(48,103,f),f>.7?'HELLO!':'',mix(12,-6,f));}
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1600 900"><defs><radialGradient id="glow"><stop stop-color="#e2dbf6"/><stop offset="1" stop-color="#f5f2eb"/></radialGradient></defs><rect width="1600" height="900" fill="#f5f2eb"/><ellipse cx="810" cy="540" rx="580" ry="360" fill="url(#glow)"/><path d="M120 820H1480" stroke="#dedbd4"/><circle cx="220" cy="290" r="5" fill="#c5b8db"/><circle cx="1385" cy="490" r="7" fill="#dfbd57"/><path d="M1350 260h18m-9-9v18M160 660h14m-7-7v14" stroke="#b2a4cd" stroke-width="2"/>${person(375,false,t)}${person(1205,true,t)}${paper}<text x="800" y="850" font-family="Arial,sans-serif" font-size="13" text-anchor="middle" letter-spacing="5" fill="#79748b">COPY. FLY. PASTE.</text></svg>`;
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 await sharp(Buffer.from(frame(5.9))).webp({quality:86}).toFile(path.join(out,'clipboard-story-poster.webp'));
 const ff=spawn('ffmpeg',['-y','-f','image2pipe','-framerate','24','-i','pipe:0','-an','-c:v','libx264','-preset','slow','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'clipboard-story.mp4')],{stdio:['pipe','ignore','pipe']});
 let errors='';ff.stderr.on('data',d=>errors+=d);const completed=once(ff,'close');
 for(let i=0;i<276;i++){const png=await sharp(Buffer.from(frame(i/24))).png().toBuffer();if(!ff.stdin.write(png))await once(ff.stdin,'drain');}
 ff.stdin.end();const [code]=await completed;if(code)throw new Error(errors);console.log('Rendered 11.5s H.264 video and poster');
})().catch(e=>{console.error(e);process.exit(1)});
