(() => {
"use strict";
const canvas=document.getElementById("gameCanvas"),ctx=canvas.getContext("2d");
const $=id=>document.getElementById(id);
const overlay=$("overlay"),title=$("overlayTitle"),desc=$("overlayText"),mainBtn=$("mainBtn");
const levelValue=$("levelValue"),scoreValue=$("scoreValue"),progressFill=$("progressFill"),toast=$("toast");
let W=900,H=560,dpr=1,raf=0,running=false,paused=false,finished=false,level=1,score=0,camera=0,last=0;
let world=2600,anchors=[],platforms=[],particles=[],rope=null,toastTimer=0;
const player={x:95,y:0,vx:2.8,vy:0,r:12,angle:0,trail:[],grounded:true};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>a+Math.random()*(b-a);
function resize(){const r=canvas.getBoundingClientRect();dpr=Math.min(devicePixelRatio||1,2);W=Math.max(320,r.width);H=Math.max(300,r.height);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);if(!running)draw();}
addEventListener("resize",resize);
function message(s){toast.textContent=s;toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove("show"),900);}
function levelSetup(){
  world=2400+Math.min(level-1,10)*260;anchors=[];platforms=[];particles=[];rope=null;camera=0;
  const floor=H*.86;
  platforms.push({x:0,y:floor,w:W*.24,h:H*.25,start:true});
  let x=Math.max(W*.35,260),i=0;
  while(x<world-250){
    const y=H*rand(.22,.43);
    anchors.push({x,y,used:false,phase:rand(0,6)});
    if(i%2===0||Math.random()<.3)platforms.push({x:x+rand(65,105),y:rand(H*.69,H*.79),w:rand(90,145),h:H*.25});
    x+=rand(265,310);i++;
  }
  platforms.push({x:world-205,y:floor-8,w:250,h:H*.3,finish:true});
  player.x=85;player.y=floor-player.r;player.vx=2.8;player.vy=0;player.angle=0;player.grounded=true;player.trail=[];
  levelValue.textContent=String(level).padStart(2,"0");progressFill.style.width="0%";updateScore();
}
function updateScore(){scoreValue.textContent=String(score).padStart(4,"0");}
function start(){if(finished){level=1;score=0;finished=false;}levelSetup();running=true;paused=false;overlay.classList.add("hidden");$("pauseBadge").hidden=true;$("pauseBtn").textContent="Ⅱ";last=performance.now();cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);}
function show(titleText,descText,btn="VOLVER A INTENTAR"){running=false;title.textContent=titleText;desc.textContent=descText;mainBtn.innerHTML=btn+' <span>→</span>';overlay.classList.remove("hidden");}
function attach(){
 if(!running||paused)return;
 // Buscar primero un punto por delante; no requiere acertar un píxel exacto.
 let best=null,bestD=Infinity;
 for(let i=0;i<anchors.length;i++){const a=anchors[i];if(a.used||(rope&&rope.i===i)||a.x<player.x+35)continue;const d=Math.hypot(a.x-player.x,a.y-(player.y-8));if(d<510&&d<bestD){best=a;bestD=d;best.i=i;}}
 if(!best){message("Acércate al siguiente aro");return;}
 rope={a:best,i:best.i,len:Math.max(90,Math.min(bestD,Math.max(200,H*.66)))};
 player.grounded=false;message("¡CUERDA ENGANCHADA!");
}
function release(){
 if(!rope)return;
 const a=rope.a;
 // Convertir el movimiento angular en impulso sin velocidad artificial constante.
 const dx=player.x-a.x,dy=player.y-a.y,d=Math.hypot(dx,dy)||1;
 const tx=-dy/d,ty=dx/d,dir=player.vx*tx+player.vy*ty>=0?1:-1;
 player.vx+=tx*dir*.75;player.vy+=ty*dir*.75;
 a.used=true;rope=null;burst(player.x,player.y,"#72f7ff",12);message("¡VUELA!");
}
function burst(x,y,color,n){for(let i=0;i<n;i++)particles.push({x,y,vx:rand(-3,3),vy:rand(-3,2),life:rand(15,28),color,size:rand(1.5,3.5)});}
function lose(){running=false;rope=null;show("¡Casi lo logras!","Caíste antes de llegar. Reintenta y suelta la cuerda cuando vayas avanzando hacia la meta.","REINTENTAR");}
function win(){if(finished)return;finished=true;running=false;score+=150;updateScore();burst(player.x,player.y,"#d9ff72",30);show("¡NIVEL COMPLETADO!","Llegaste a la bandera. ¡Ganaste 150 puntos! Sigue con el próximo recorrido.","SIGUIENTE NIVEL");}
function loop(t){if(!running)return;const dt=clamp((t-last)/16.67,.5,1.6);last=t;update(dt);draw();if(running)raf=requestAnimationFrame(loop);}
function update(dt){
 const oldY=player.y,oldX=player.x;
 // Carrera continua, a velocidad normal.
 if(player.grounded&&player.vx<2.7)player.vx=2.7;
 player.vy+=.27*dt;player.vx*=Math.pow(.9995,dt);
 player.x+=player.vx*dt;player.y+=player.vy*dt;
 if(rope){
   const dx=player.x-rope.a.x,dy=player.y-rope.a.y,d=Math.hypot(dx,dy)||1;
   if(d>rope.len){
     const nx=dx/d,ny=dy/d;player.x=rope.a.x+nx*rope.len;player.y=rope.a.y+ny*rope.len;
     const radial=player.vx*nx+player.vy*ny;player.vx-=radial*nx;player.vy-=radial*ny;
   }
 }
 player.grounded=false;
 for(const p of platforms){
   if(player.x+player.r>p.x&&player.x-player.r<p.x+p.w&&oldY+player.r<=p.y&&player.y+player.r>=p.y&&player.vy>=0){
     player.y=p.y-player.r;player.vy=0;player.grounded=true;rope=null;
     if(p.finish&&player.x>world-230){win();return;}
   }
 }
 if(player.x>world-115&&player.y>H*.35&&player.y<H+20){win();return;}
 if(player.y>H+125){lose();return;}
 player.angle=Math.atan2(player.vy,player.vx);
 player.trail.push({x:player.x,y:player.y});if(player.trail.length>13)player.trail.shift();
 particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=.07*dt;p.life-=dt;});particles=particles.filter(p=>p.life>0);
 camera=clamp(player.x-W*.32,0,world-W+100);
 progressFill.style.width=clamp(player.x/world*100,0,100)+"%";
 if(player.x-oldX>2.7&&Math.random()<.12){score++;updateScore();}
}
function rr(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function draw(){
 ctx.clearRect(0,0,W,H);
 const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,"#15102f");bg.addColorStop(.48,"#17234a");bg.addColorStop(1,"#071625");ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 // Glow moon and stars
 const glow=ctx.createRadialGradient(W*.77,H*.18,2,W*.77,H*.18,H*.32);glow.addColorStop(0,"#bca6ff36");glow.addColorStop(1,"#bca6ff00");ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
 for(let i=0;i<75;i++){const sx=((i*137-camera*.13)%(W+30)+W+30)%(W+30),sy=(i*71+15)%(H*.7);ctx.fillStyle=i%5===0?"#b8faff":"#c5c7ff66";ctx.globalAlpha=.35+(i%4)*.15;ctx.beginPath();ctx.arc(sx,sy,i%6===0?1.5:.8,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
 ctx.save();ctx.translate(-camera,0);
 // Layered distant hills
 for(let layer=0;layer<3;layer++){ctx.fillStyle=["#24285a","#1b3152","#153349"][layer];ctx.beginPath();ctx.moveTo(camera-20,H);for(let x=camera-20;x<camera+W+80;x+=65){const y=H*(.58+layer*.09)+Math.sin(x*.006+layer*2)*22+Math.sin(x*.014)*11;ctx.lineTo(x,y);}ctx.lineTo(camera+W+80,H);ctx.closePath();ctx.fill();}
 // Platforms with cyan top rim
 for(const p of platforms){
   ctx.shadowColor=p.finish?"#d9ff72":"#55eaff";ctx.shadowBlur=p.finish?22:12;
   const g=ctx.createLinearGradient(0,p.y,0,p.y+p.h);g.addColorStop(0,p.finish?"#d9ff72":"#50eaff");g.addColorStop(.13,p.finish?"#8fcd68":"#267caa");g.addColorStop(1,"#101e3d");
   ctx.fillStyle=g;rr(p.x,p.y,p.w,p.h,10);ctx.fill();ctx.shadowBlur=0;
   ctx.fillStyle="#ffffff32";rr(p.x+8,p.y+7,p.w-16,2,2);ctx.fill();
   for(let k=15;k<p.w-10;k+=28){ctx.fillStyle="#a9faff20";ctx.fillRect(p.x+k,p.y+16,2,Math.max(10,p.h-28));}
 }
 // Rings for hook points
 for(const a of anchors){if(a.used)continue;const pulse=1+Math.sin(performance.now()*.004+a.phase)*.12;ctx.save();ctx.shadowColor="#73f7ff";ctx.shadowBlur=20;ctx.strokeStyle="#73f7ff";ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(a.x,a.y,9*pulse,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle="#d5ffff";ctx.beginPath();ctx.arc(a.x,a.y,2.8,0,Math.PI*2);ctx.fill();ctx.restore();}
 // Finish flag
 const fx=world-135,fy=H*.66;ctx.save();ctx.shadowColor="#d9ff72";ctx.shadowBlur=12;ctx.strokeStyle="#d9ff72";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(fx,fy-55);ctx.lineTo(fx,fy+38);ctx.stroke();ctx.shadowBlur=0;const cell=9;for(let row=0;row<5;row++)for(let col=0;col<6;col++){ctx.fillStyle=(row+col)%2?"#12192f":"#f6f8ff";ctx.fillRect(fx+col*cell,fy-55+row*cell,cell,cell);}ctx.restore();
 // Rope
 if(rope){ctx.save();ctx.shadowColor="#75faff";ctx.shadowBlur=13;ctx.strokeStyle="#a2ffff";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(rope.a.x,rope.a.y);ctx.lineTo(player.x,player.y-5);ctx.stroke();ctx.restore();}
 // Motion trail
 player.trail.forEach((p,i)=>{ctx.globalAlpha=(i+1)/player.trail.length*.24;ctx.fillStyle="#70f7ff";ctx.beginPath();ctx.arc(p.x,p.y,2+(i/player.trail.length)*3,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;
 particles.forEach(p=>{ctx.globalAlpha=clamp(p.life/28,0,1);ctx.fillStyle=p.color;ctx.shadowColor=p.color;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;ctx.shadowBlur=0;
 drawPlayer(player.x,player.y,player.angle);
 ctx.restore();
 if(running){ctx.fillStyle="#e9f5ffb8";ctx.font="700 11px sans-serif";ctx.textAlign="center";ctx.fillText(rope?"CLIC PARA SOLTAR Y VOLAR":"CLIC PARA ENGANCHARTE",W/2,H-17);}
}
function drawPlayer(x,y,a){
 ctx.save();ctx.translate(x,y);ctx.rotate(clamp(a*.42,-.7,.7));ctx.lineCap="round";ctx.lineJoin="round";
 ctx.shadowColor="#9afaff";ctx.shadowBlur=9;ctx.strokeStyle="#f5fbff";ctx.lineWidth=4;
 ctx.beginPath();ctx.arc(0,-17,7,0,Math.PI*2);ctx.fillStyle="#f5fbff";ctx.fill();
 ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(0,7);ctx.moveTo(0,-4);ctx.lineTo(-10,1);ctx.moveTo(0,-4);ctx.lineTo(10,0);ctx.moveTo(0,7);ctx.lineTo(-8,18);ctx.moveTo(0,7);ctx.lineTo(9,17);ctx.stroke();ctx.restore();
}
function clickCanvas(e){if(!running||paused)return;e.preventDefault();if(rope)release();else attach();}
canvas.addEventListener("pointerdown",clickCanvas,{passive:false});canvas.addEventListener("contextmenu",e=>e.preventDefault());
mainBtn.addEventListener("click",()=>{if(finished){level++;finished=false;}start();});
$("restartBtn").addEventListener("click",()=>{finished=false;start();});
$("pauseBtn").addEventListener("click",()=>{if(!running&&!paused)return;paused=!paused;if(paused){running=false;$("pauseBadge").hidden=false;show("PAUSA","El recorrido está detenido. Continúa cuando estés listo.","CONTINUAR");}else{overlay.classList.add("hidden");$("pauseBadge").hidden=true;running=true;last=performance.now();raf=requestAnimationFrame(loop);}});
addEventListener("keydown",e=>{if(e.code==="Space"||e.code==="ArrowUp"){e.preventDefault();if(!e.repeat&&running){if(rope)release();else attach();}}if(e.code==="KeyR")start();if(e.code==="Escape"&&running)$("pauseBtn").click();});
resize();levelSetup();draw();
})();