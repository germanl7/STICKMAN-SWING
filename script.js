(() => {
  "use strict";
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayText = document.getElementById("overlayText");
  const mainBtn = document.getElementById("mainBtn");
  const levelValue = document.getElementById("levelValue");
  const scoreValue = document.getElementById("scoreValue");
  const progressFill = document.getElementById("progressFill");
  const toast = document.getElementById("toast");
  const pauseBadge = document.getElementById("pauseBadge");
  const pauseBtn = document.getElementById("pauseBtn");
  const soundBtn = document.getElementById("soundBtn");
  const tipText = document.getElementById("tipText");

  let W = 900, H = 560, dpr = 1, running = false, paused = false, won = false;
  let cameraX = 0, lastTime = 0, elapsed = 0, level = 1, score = 0, soundOn = false;
  let audioCtx = null, anchors = [], platforms = [], particles = [], rope = null, lastAnchor = -1;
  const keys = { held: false };
  const player = { x: 95, y: 0, vx: 2.7, vy: 0, r: 13, grounded: false, alive: true, angle: 0, trail: [] };
  let worldEnd = 2300, goal = { x: 0, y: 0, r: 25 };
  const rand = (a,b) => a + Math.random()*(b-a);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(320, rect.width); H = Math.max(300, rect.height);
    canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if (!running) draw();
  }
  window.addEventListener("resize", resize);

  function makeLevel(n) {
    anchors = []; platforms = []; particles = []; rope = null; lastAnchor = -1;
    cameraX = 0; worldEnd = 2200 + Math.min(n-1,12)*230;
    const floorY = H * .88;
    platforms.push({x:0,y:floorY,w:Math.max(125, W*.21),h:H*.25,start:true});
    let x = Math.max(250,W*.34);
    while (x < worldEnd - 260) {
      const ay = rand(H*.19,H*.47);
      anchors.push({x,y:ay,r:10,used:false});
      if (Math.random() < .72) {
        const px = x + rand(80,155);
        platforms.push({x:px,y:rand(H*.68,H*.82),w:rand(65,115),h:H*.22});
      }
      x += rand(245,335);
    }
    platforms.push({x:worldEnd-160,y:floorY-12,w:220,h:H*.25,finish:true});
    goal = {x:worldEnd-105,y:floorY-52,r:25};
    player.x = 80; player.y = floorY - player.r; player.vx = 2.6 + Math.min(n*.08,1.5); player.vy=0;
    player.grounded=true; player.alive=true; player.angle=0; player.trail=[];
    levelValue.textContent=String(n).padStart(2,"0");
    progressFill.style.width="0%";
    updateScore();
  }
  function updateScore(){ scoreValue.textContent=String(score).padStart(4,"0"); }
  function toastMsg(msg){ toast.textContent=msg; toast.classList.add("show"); clearTimeout(toastMsg.t); toastMsg.t=setTimeout(()=>toast.classList.remove("show"),1100); }
  function beep(freq=520,duration=.08) {
    if(!soundOn) return;
    try { audioCtx ||= new (window.AudioContext||window.webkitAudioContext)(); const o=audioCtx.createOscillator(),g=audioCtx.createGain(); o.frequency.value=freq;o.type="sine";g.gain.value=.045;o.connect(g);g.connect(audioCtx.destination);o.start();g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.stop(audioCtx.currentTime+duration); } catch(e) {}
  }
  function startGame() {
    if(won){level=1;score=0;won=false;}
    makeLevel(level); running=true;paused=false;overlay.classList.add("hidden");pauseBadge.hidden=true;
    pauseBtn.textContent="Ⅱ"; lastTime=performance.now(); elapsed=0; requestAnimationFrame(loop);
  }
  function showOverlay(title,text,button="JUGAR DE NUEVO") {
    running=false; overlayTitle.textContent=title;overlayText.textContent=text;mainBtn.innerHTML=button+' <span>→</span>';overlay.classList.remove("hidden");
  }
  function attach() {
    if(!running||paused||!player.alive||won)return;
    const px=player.x, py=player.y;
    let best=-1, bestD=Infinity;
    for(let i=0;i<anchors.length;i++){
      const a=anchors[i]; if(a.used||(rope&&i===rope.index))continue;
      const dx=a.x-px,dy=a.y-py,d=Math.hypot(dx,dy);
      if(d<Math.min(330,W*.62)&&d<bestD&&a.x>px-35){best=i;bestD=d;}
    }
    if(best<0){toastMsg("Acércate a un punto ✦");return;}
    const a=anchors[best]; rope={anchor:a,length:clamp(bestD,72,Math.min(310,H*.72)),index:best};
    rope.length=Math.max(65,Math.hypot(player.x-a.x,player.y-a.y));
    player.grounded=false;lastAnchor=best;beep(650,.07);
    toastMsg("¡ENGANCHADO!");
  }
  function release() {
    if(!rope)return;
    rope.anchor.used=true; rope=null;player.vx*=1.04;player.vy*=1.04;beep(790,.06);
    burst(player.x,player.y,"#c8ff55",6);
  }
  function burst(x,y,color,count) {for(let i=0;i<count;i++)particles.push({x,y,vx:rand(-2.8,2.8),vy:rand(-3.4,1),life:rand(15,29),color,size:rand(2,4)});}
  function die() {
    if(!player.alive)return;player.alive=false;running=false;beep(170,.15);
    showOverlay("¡Otra vez!","No pasa nada: inténtalo de nuevo y suelta la cuerda en el momento justo.","REINTENTAR");
  }
  function winLevel() {
    if(won)return;won=true;running=false;score+=100+level*25;updateScore();burst(goal.x,goal.y,"#c8ff55",24);beep(900,.12);
    overlayTitle.textContent="¡Nivel superado!";
    overlayText.textContent="¡Buen balanceo! Ganaste "+(100+level*25)+" puntos. ¿Listo para el siguiente nivel?";
    mainBtn.innerHTML='SIGUIENTE NIVEL <span>→</span>';overlay.classList.remove("hidden");
  }
  function loop(now) {
    if(!running)return;
    const dt=clamp((now-lastTime)/16.67,.45,1.8);lastTime=now;elapsed+=dt;
    if(!paused) update(dt);
    draw();
    if(running)requestAnimationFrame(loop);
  }
  function update(dt) {
    const prevX=player.x,prevY=player.y;
    player.vy += .29*dt; // gravity
    player.vx *= Math.pow(.999,dt);
    player.x += player.vx*dt;player.y+=player.vy*dt;
    if(rope){
      const a=rope.anchor,dx=player.x-a.x,dy=player.y-a.y,dist=Math.hypot(dx,dy)||1;
      const nx=dx/dist,ny=dy/dist;
      if(dist>rope.length){
        player.x=a.x+nx*rope.length;player.y=a.y+ny*rope.length;
        const radial=player.vx*nx+player.vy*ny;
        player.vx-=radial*nx;player.vy-=radial*ny;
        // A small tangential boost keeps the swing responsive but predictable.
        player.vx += (-ny)*.012*dt;player.vy += nx*.012*dt;
      }
    }
    player.angle=Math.atan2(player.vy,player.vx);
    player.grounded=false;
    for(const p of platforms){
      if(player.x+player.r>p.x&&player.x-player.r<p.x+p.w&&prevY+player.r<=p.y&&player.y+player.r>=p.y&&player.vy>=0){
        player.y=p.y-player.r;player.vy=0;player.vx*=.91;player.grounded=true;rope=null;
        if(p.finish&&player.x>goal.x-80){winLevel();return;}
      }
    }
    // Landing on the goal area also completes the level.
    if(player.x>goal.x-40&&player.x<goal.x+70&&player.y>goal.y-55&&player.y<goal.y+75&&player.vy>0){winLevel();return;}
    if(player.y>H+220||player.x<cameraX-100||player.x>worldEnd+120){die();return;}
    if(player.x>worldEnd+40){winLevel();return;}
    player.trail.push({x:player.x,y:player.y,life:10});if(player.trail.length>10)player.trail.shift();
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=.08*dt;p.life-=dt;});particles=particles.filter(p=>p.life>0);
    cameraX=clamp(player.x-W*.34,0,Math.max(0,worldEnd-W+80));
    progressFill.style.width=clamp(player.x/worldEnd*100,0,100)+"%";
    if(Math.abs(player.x-prevX)>2.3&&Math.random()<.18)score+=1;
    updateScore();
    if(player.grounded&&keys.held&&Math.abs(player.vx)<.7)player.vx=1.5;
  }

  function roundRect(c,x,y,w,h,r) {
    c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();
  }
  function draw() {
    ctx.clearRect(0,0,W,H);
    const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,"#18264a");bg.addColorStop(.58,"#18213e");bg.addColorStop(1,"#11172c");ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    // Subtle stars and distant geometry.
    for(let i=0;i<52;i++){const sx=((i*137+30-cameraX*.12)%(W+20)+W+20)%(W+20),sy=(i*71+17)%(H*.65);ctx.fillStyle=i%4===0?"#c8ff5570":"#cce2ff35";ctx.beginPath();ctx.arc(sx,sy,i%5===0?1.7:1,0,Math.PI*2);ctx.fill();}
    ctx.save();ctx.translate(-cameraX,0);
    // Background silhouettes
    ctx.fillStyle="#253257";for(let i=0;i<15;i++){let x=i*190-20;let bh=65+(i*47%110);ctx.beginPath();ctx.moveTo(x,H*.88);ctx.lineTo(x,H*.88-bh);ctx.lineTo(x+65,H*.88-bh-22);ctx.lineTo(x+120,H*.88);ctx.closePath();ctx.fill();}
    // Anchor guide lines
    ctx.strokeStyle="#c8ff5510";ctx.lineWidth=1;ctx.setLineDash([4,10]);
    for(const a of anchors){ctx.beginPath();ctx.moveTo(a.x,0);ctx.lineTo(a.x,H);ctx.stroke();}ctx.setLineDash([]);
    // platforms
    for(const p of platforms){
      const grad=ctx.createLinearGradient(0,p.y,0,p.y+p.h);grad.addColorStop(0,p.finish?"#c8ff55":"#6de7ce");grad.addColorStop(1,p.finish?"#73ce85":"#253d58");
      ctx.fillStyle=grad;roundRect(ctx,p.x,p.y,p.w,p.h,8);ctx.fill();
      ctx.fillStyle="#ffffff30";ctx.fillRect(p.x+8,p.y+5,Math.max(0,p.w-16),2);
    }
    // Finish gate
    ctx.save();ctx.translate(goal.x,goal.y);
    ctx.shadowColor="#c8ff55";ctx.shadowBlur=22;ctx.strokeStyle="#c8ff55";ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,goal.r,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
    ctx.fillStyle="#c8ff5520";ctx.beginPath();ctx.arc(0,0,goal.r-4,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#e7ffad";ctx.font="bold 11px DM Sans";ctx.textAlign="center";ctx.fillText("META",0,goal.r+20);ctx.restore();
    // Anchors
    for(const a of anchors){
      if(a.used)continue;
      ctx.fillStyle="#c8ff5520";ctx.beginPath();ctx.arc(a.x,a.y,19,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#c8ff55";ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(a.x,a.y,8,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle="#f3ffce";ctx.beginPath();ctx.arc(a.x,a.y,3,0,Math.PI*2);ctx.fill();
    }
    // Rope
    if(rope){ctx.strokeStyle="#c8ff55";ctx.lineWidth=2.5;ctx.shadowColor="#c8ff55";ctx.shadowBlur=9;ctx.beginPath();ctx.moveTo(rope.anchor.x,rope.anchor.y);ctx.lineTo(player.x,player.y);ctx.stroke();ctx.shadowBlur=0;}
    // Player trail
    for(const t of player.trail){ctx.globalAlpha=t.life/15;ctx.fillStyle="#c8ff55";ctx.beginPath();ctx.arc(t.x,t.y,3*t.life/10,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    particles.forEach(p=>{ctx.globalAlpha=clamp(p.life/25,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;
    drawStickman(player.x,player.y,player.angle);
    ctx.restore();
    // bottom line
    ctx.fillStyle="#ffffff0c";ctx.fillRect(0,H-2,W,2);
    if(running&&!rope&&!paused){ctx.fillStyle="#dce5ffb0";ctx.font="600 11px DM Sans";ctx.textAlign="center";ctx.fillText("TOCA / CLIC PARA ENGANCHARTE",W/2,H-18);}
  }
  function drawStickman(x,y,angle) {
    ctx.save();ctx.translate(x,y);ctx.rotate(clamp(angle*.45,-.65,.65));
    ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle="#f6f7ff";ctx.lineWidth=4;
    // Head
    ctx.fillStyle="#f6f7ff";ctx.beginPath();ctx.arc(0,-17,7,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#f6f7ff";ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(0,8);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,-3);ctx.lineTo(-10,3);ctx.moveTo(0,-3);ctx.lineTo(10,1);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,8);ctx.lineTo(-8,19);ctx.moveTo(0,8);ctx.lineTo(9,18);ctx.stroke();
    ctx.restore();
  }
  function pointerDown(e) {
    if(e.target.closest("button")||!running||paused)return;
    e.preventDefault();
    if(e.button===2) {
      // Clic derecho: cambiar al siguiente punto sin soltar la cuerda primero.
      attach();
      return;
    }
    // Clic izquierdo solo engancha; no suelta accidentalmente la cuerda.
    keys.held=true;
    if(!rope)attach();
  }
  canvas.addEventListener("pointerdown",pointerDown,{passive:false});
  canvas.addEventListener("contextmenu",e=>e.preventDefault());
  window.addEventListener("keydown",e=>{
    if(e.code==="Space"||e.code==="ArrowUp"){e.preventDefault();if(!keys.held){keys.held=true;if(rope)release();else attach();}}
    if(e.code==="KeyR"){if(running||!overlay.classList.contains("hidden")){if(won){level++;won=false;}startGame();}}
    if(e.code==="Escape"&&running)togglePause();
  });
  window.addEventListener("keyup",e=>{if(e.code==="Space"||e.code==="ArrowUp")keys.held=false;});
  window.addEventListener("pointerup",()=>keys.held=false);
  function togglePause(){
    if(!running&&!paused)return;
    paused=!paused;pauseBadge.hidden=!paused;pauseBtn.textContent=paused?"▶":"Ⅱ";
    if(paused){running=false;overlayTitle.textContent="Juego en pausa";overlayText.textContent="Tómate tu tiempo. Cuando quieras, continúa el balanceo.";mainBtn.innerHTML='CONTINUAR <span>→</span>';overlay.classList.remove("hidden");}
    else{overlay.classList.add("hidden");running=true;lastTime=performance.now();requestAnimationFrame(loop);}
  }
  mainBtn.addEventListener("click",()=>{
    if(paused){paused=false;overlay.classList.add("hidden");pauseBadge.hidden=true;running=true;lastTime=performance.now();requestAnimationFrame(loop);return;}
    if(won){level++;won=false;startGame();return;}
    startGame();
  });
  document.getElementById("restartBtn").addEventListener("click",()=>{if(won)won=false;makeLevel(level);startGame();});
  pauseBtn.addEventListener("click",togglePause);
  soundBtn.addEventListener("click",()=>{soundOn=!soundOn;soundBtn.textContent=soundOn?"♫":"♪";soundBtn.style.color=soundOn?"#c8ff55":"#dfe6ff";if(soundOn)beep(600,.07);});
  // Fit initial level to the real canvas size.
  resize();makeLevel(level);draw();
})();