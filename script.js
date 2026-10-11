(() => {
  "use strict";
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const frame = document.getElementById("gameFrame");
  const $ = id => document.getElementById(id);
  const ui = {
    start: $("startOverlay"), end: $("endOverlay"), startBtn: $("startBtn"),
    retryBtn: $("retryBtn"), restartBtn: $("restartBtn"), action: $("mobileAction"),
    sound: $("soundBtn"), level: $("levelLabel"), progress: $("progressLabel"),
    coins: $("coinLabel"), best: $("bestLabel"), sideBest: $("sideBest"),
    sideLevel: $("sideLevel"), sideStatus: $("sideStatus"), sideProgress: $("sideProgress"),
    track: document.querySelector(".track-line span"), toast: $("toast"),
    tip: $("tipText"), resultIcon: $("resultIcon"), resultKicker: $("resultKicker"),
    resultTitle: $("resultTitle"), resultCopy: $("resultCopy"), resultDistance: $("resultDistance"),
    resultCoins: $("resultCoins")
  };

  let W = 900, H = 560, dpr = 1, lastTime = 0, raf = 0;
  let state = "menu", soundOn = true, audioCtx = null, level = 1, runCoins = 0;
  let cameraX = 0, distance = 0, best = Number(localStorage.getItem("ss-best") || 0);
  let player, anchors = [], platforms = [], coins = [], particles = [], buildings = [];
  let worldEnd = 3800, toastTimer = 0, frameCount = 0;
  const GRAVITY = 1450;
  const rand = (a,b) => a + Math.random() * (b-a);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

  function resize() {
    const rect = frame.getBoundingClientRect();
    W = Math.max(320, rect.width); H = Math.max(340, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if (state === "menu") draw();
  }
  window.addEventListener("resize", resize);

  function makeLevel(n) {
    const gap = Math.max(220, 320 - Math.min(n*7, 75));
    worldEnd = 3450 + Math.min(n,10)*230;
    anchors = []; platforms = []; coins = []; particles = []; buildings = [];
    platforms.push({x:0,y:H*.79,w:390,h:220});
    let x = 245;
    let idx = 0;
    while (x < worldEnd - 100) {
      const ay = H * rand(.24,.45);
      anchors.push({x:x+rand(10,80),y:ay,r:12,phase:rand(0,Math.PI*2),used:0});
      if (idx%2===0) platforms.push({x:x+rand(70,150),y:H*rand(.73,.83),w:rand(95,170),h:220});
      const coinCount = 2 + (idx%3);
      for(let j=0;j<coinCount;j++) coins.push({x:x+70+j*22,y:ay+rand(50,110),r:6,taken:false,phase:rand(0,6)});
      x += gap + rand(-28,45); idx++;
    }
    platforms.push({x:worldEnd-50,y:H*.78,w:300,h:230,finish:true});
    for(let i=0;i<95;i++) buildings.push({x:i*90+rand(-20,20),w:rand(28,82),h:rand(H*.1,H*.43),tone:Math.floor(rand(0,3)),seed:rand(0,100)});
  }

  function resetGame() {
    makeLevel(level);
    cameraX = 0; distance = 0; runCoins = 0; frameCount = 0;
    player = {x:80,y:H*.66,vx:190,vy:0,r:13,rope:null,grounded:true,angle:0,trail:[],alive:true,invuln:0};
    state = "playing"; ui.start.classList.add("hidden"); ui.end.classList.add("hidden");
    ui.sideStatus.textContent = "En movimiento"; ui.sideStatus.style.color = "var(--green)";
    ui.action.innerHTML = 'ENGANCHAR <span>↗</span>';
    updateHUD(); toast("¡Vamos! Busca un anclaje brillante"); playTone(480,.08);
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function begin() { if(state==="playing") return; resetGame(); }
  function finish(won) {
    if (state !== "playing") return;
    state = won ? "won" : "fallen";
    player.rope = null;
    if (won) { level = Math.min(level+1,99); ui.resultIcon.textContent="🏁"; ui.resultKicker.textContent="NIVEL COMPLETADO"; ui.resultTitle.textContent="¡LO LOGRASTE!"; ui.resultCopy.textContent="¡Balanceo perfecto! Prepárate para el siguiente nivel."; playTone(780,.13); setTimeout(()=>playTone(980,.16),100); }
    else { ui.resultIcon.textContent="💫"; ui.resultKicker.textContent="INTÉNTALO OTRA VEZ"; ui.resultTitle.textContent="¡CASI LO TENÍAS!"; ui.resultCopy.textContent="Prueba a engancharte más pronto y suelta cuando lleves impulso."; playTone(160,.22); }
    if (Math.floor(distance)>best) { best=Math.floor(distance); localStorage.setItem("ss-best",String(best)); }
    ui.resultDistance.textContent=Math.floor(distance)+" m"; ui.resultCoins.textContent=runCoins;
    ui.end.classList.remove("hidden"); ui.sideStatus.textContent=won?"¡Nivel superado!":"Caíste"; ui.sideStatus.style.color=won?"var(--green)":"var(--pink)";
    ui.retryBtn.innerHTML=won?'SIGUIENTE NIVEL <span>→</span>':'VOLVER A INTENTAR <span>↻</span>';
    updateHUD(); draw();
  }

  function screenWorldX(x) { return x-cameraX; }
  function nearestAnchor() {
    let target=null, bestDist=Infinity;
    for (const a of anchors) {
      const dx=a.x-player.x, dy=a.y-player.y, d=Math.hypot(dx,dy);
      if (dx < -35 || dx > W*.85 || d>285) continue;
      if(d<bestDist){bestDist=d;target=a;}
    }
    return target;
  }
  function action() {
    if(state!=="playing") { if(state==="menu" || state==="fallen" || state==="won") begin(); return; }
    if(player.rope) {
      // Soltar la cuerda sin añadir velocidad artificial.
      player.rope=null;
      burst(player.x,player.y,8,"#61f5ff"); toast("Cuerda suelta"); playTone(520,.07);
      ui.action.innerHTML='ENGANCHAR <span>↗</span>';
    } else {
      const a=nearestAnchor();
      if(a) {
        player.rope={anchor:a,length:clamp(Math.hypot(a.x-player.x,a.y-player.y),105,245)};
        player.grounded=false; a.used=1;
        player.vx=Math.max(player.vx,190);
        burst(a.x,a.y,13,"#9b7cff"); toast("¡ENGANCHADO! Balancéate y suelta"); playTone(520,.08);
        ui.action.innerHTML='SOLTAR <span>↗</span>';
      } else { toast("Acércate a un anclaje brillante ✦"); playTone(220,.06); }
    }
  }
  // Only the left mouse click is a gameplay control.
  canvas.addEventListener("pointerdown",e=>{if(e.pointerType!=="mouse"||e.button!==0)return;e.preventDefault();canvas.focus();action();});
  ui.startBtn.addEventListener("click",begin);
  ui.retryBtn.addEventListener("click",resetGame);
  ui.restartBtn.addEventListener("click",resetGame);
  ui.sound.addEventListener("click",()=>{soundOn=!soundOn;ui.sound.textContent=soundOn?"♫":"♩";ui.sound.style.opacity=soundOn?"1":".5";if(soundOn)playTone(520,.06);});
  // Keyboard, right-click and touch gestures do not control the character.

  function playTone(freq,duration) {
    if(!soundOn)return;
    try { audioCtx ||= new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==="suspended")audioCtx.resume(); const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type="sine";o.frequency.value=freq;g.gain.setValueAtTime(.055,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration); } catch(_){}
  }
  function toast(text) { ui.toast.textContent=text;ui.toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.remove("show"),1350); }
  function burst(x,y,count,color) { for(let i=0;i<count;i++)particles.push({x,y,vx:rand(-180,180),vy:rand(-190,90),life:rand(.3,.8),max:.8,color,r:rand(1.5,3.8)}); }
  function updateHUD() {
    const p=clamp(distance/worldEnd*100,0,100);
    ui.progress.textContent=Math.floor(p)+"%";ui.coins.textContent=runCoins;
    ui.best.textContent=best+" m";ui.sideBest.textContent=best+" m";
    ui.level.textContent=String(level).padStart(2,"0");ui.sideLevel.textContent=String(level).padStart(2,"0");
    ui.track.style.width=p+"%";ui.sideProgress.style.width=p+"%";
    ui.action.innerHTML=player&&player.rope?'SOLTAR <span>↗</span>':'ENGANCHAR <span>↗</span>';
  }

  function loop(now) {
    raf=0;const dt=lastTime?Math.min((now-lastTime)/1000,.032):.016;lastTime=now;
    if(state==="playing") update(dt);
    draw();
    if(state==="playing")raf=requestAnimationFrame(loop);else lastTime=0;
  }
  function update(dt) {
    frameCount++;const p=player;
    if(!p.alive)return;
    if(p.invuln>0)p.invuln-=dt;
    p.vy+=GRAVITY*dt;
    if(!p.rope) {
      p.vx += (190-p.vx)*Math.min(1,dt*.75);
      p.x += p.vx*dt;p.y += p.vy*dt;
      p.grounded=false;
      for(const pl of platforms) {
        if(p.x+p.r>pl.x&&p.x-p.r<pl.x+pl.w&&p.y+p.r>=pl.y&&p.y+p.r<=pl.y+Math.max(25,Math.abs(p.vy*dt)+9)&&p.vy>=0) {
          p.y=pl.y-p.r;p.vy=0;p.grounded=true;p.vx=Math.max(p.vx,190);
          if(pl.finish&&p.x>worldEnd+20){finish(true);return;}
        }
      }
      if(p.grounded){p.vy=0;if(p.y<H*.7&&p.vx<200)p.vx+=10*dt;}
    } else {
      const a=p.rope.anchor, dx=p.x-a.x,dy=p.y-a.y;
      const len=Math.hypot(dx,dy)||1, nx=dx/len,ny=dy/len;
      const radial=p.vx*nx+p.vy*ny;
      p.vx-=radial*nx;p.vy-=radial*ny;
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      const ndx=p.x-a.x,ndy=p.y-a.y,nlen=Math.hypot(ndx,ndy)||1;
      if(nlen>p.rope.length){p.x=a.x+ndx/nlen*p.rope.length;p.y=a.y+ndy/nlen*p.rope.length;const outward=(p.vx*ndx+p.vy*ndy)/nlen;p.vx-=outward*ndx/nlen;p.vy-=outward*ndy/nlen;}
      p.vx+=95*dt;
      p.angle=Math.atan2(p.y-a.y,p.x-a.x)+Math.PI/2;
      if(p.x>a.x+30&&p.vx>90){} 
    }
    // Catch a platform on a downward crossing.
    if(!p.rope&&!p.grounded)for(const pl of platforms){if(p.x+p.r>pl.x&&p.x-p.r<pl.x+pl.w&&p.y+p.r>=pl.y&&p.y+p.r<pl.y+30&&p.vy>0){p.y=pl.y-p.r;p.vy=0;p.grounded=true;if(pl.finish&&p.x>worldEnd+10){finish(true);return;}}}
    if(p.grounded&&p.x>worldEnd-65){finish(true);return;}
    // Collect floating coins.
    for(const c of coins){if(c.taken)continue;if(Math.hypot(c.x-p.x,c.y-p.y)<p.r+c.r+5){c.taken=true;runCoins++;burst(c.x,c.y,7,"#ffd66b");playTone(880,.045);}}
    distance=Math.max(distance,p.x-80);cameraX=clamp(p.x-W*.32,0,Math.max(0,worldEnd-W*.55));
    p.trail.push({x:p.x,y:p.y,life:.24});p.trail=p.trail.filter(t=>(t.life-=dt)>0);
    particles=particles.filter(q=>{q.life-=dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.vy+=260*dt;return q.life>0;});
    if(p.y>H+150||p.x<cameraX-80){finish(false);return;}
    updateHUD();
  }

  function draw() {
    if(!ctx||!W||!H)return;
    ctx.clearRect(0,0,W,H);
    const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,"#0b1029");sky.addColorStop(.52,"#171a3b");sky.addColorStop(1,"#271c48");ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    drawStars();drawMoon();drawBuildings();
    // Ambient glow in the distance.
    const glow=ctx.createRadialGradient(W*.68,H*.39,2,W*.68,H*.39,H*.58);glow.addColorStop(0,"rgba(87,95,230,.13)");glow.addColorStop(1,"rgba(10,12,34,0)");ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
    drawPlatforms();drawAnchors();drawCoins();drawFinish();
    if(player){drawTrail();drawRope();drawStickman(player.x-cameraX,player.y,player);}
    drawParticles();
    // subtle foreground shade
    const shade=ctx.createLinearGradient(0,H*.72,0,H);shade.addColorStop(0,"rgba(8,10,25,0)");shade.addColorStop(1,"rgba(5,7,18,.38)");ctx.fillStyle=shade;ctx.fillRect(0,H*.72,W,H*.28);
  }
  function drawStars(){for(let i=0;i<70;i++){const x=((i*137.5-cameraX*.06)% (W+30)+W+30)%(W+30),y=(i*71.3)% (H*.72);ctx.globalAlpha=.2+(Math.sin(frameCount*.02+i)*.5+.5)*.45;ctx.fillStyle=i%7===0?"#61f5ff":"#d9e3ff";ctx.fillRect(x,y,i%7===0?2:1.3,i%7===0?2:1.3);}ctx.globalAlpha=1;}
  function drawMoon(){const x=W*.78,y=H*.18;ctx.save();ctx.shadowColor="#9b7cff";ctx.shadowBlur=35;ctx.fillStyle="#9b7cff12";ctx.beginPath();ctx.arc(x,y,43,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle="#9b7cff42";ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,31,0,Math.PI*2);ctx.stroke();ctx.fillStyle="#b8b1ff";ctx.globalAlpha=.75;ctx.beginPath();ctx.arc(x,y,21,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.22;ctx.fillStyle="#6e66bf";ctx.beginPath();ctx.arc(x+7,y-5,17,0,Math.PI*2);ctx.fill();ctx.restore();}
  function drawBuildings(){for(const b of buildings){const x=((b.x-cameraX*.19)%(W+180)+W+180)%(W+180)-50;const y=H*.69-b.h;ctx.fillStyle=["#111630","#151833","#191b3b"][b.tone];ctx.fillRect(x,y,b.w,b.h);ctx.fillStyle="#6c70ad22";ctx.fillRect(x+4,y+5,Math.max(2,b.w-8),2);for(let wy=y+13;wy<H*.68;wy+=15)for(let wx=x+7;wx<x+b.w-4;wx+=12){ctx.fillStyle=((Math.floor(wx+wy+b.seed)%5)<2)?"#61f5ff35":"#9b7cff20";ctx.fillRect(wx,wy,3,5);}}}
  function drawPlatforms(){for(const pl of platforms){const x=screenWorldX(pl.x);if(x+pl.w<-20||x>W+20)continue;ctx.save();ctx.shadowColor=pl.finish?"#6bffbd":"#61f5ff";ctx.shadowBlur=14;const g=ctx.createLinearGradient(x,pl.y,x,pl.y+pl.h);g.addColorStop(0,pl.finish?"#3d8c8c":"#303b70");g.addColorStop(.14,"#171e3e");g.addColorStop(1,"#0c1126");ctx.fillStyle=g;ctx.fillRect(x,pl.y,pl.w,pl.h);ctx.shadowBlur=0;ctx.fillStyle=pl.finish?"#6bffbd":"#61f5ff";ctx.fillRect(x,pl.y,pl.w,3);ctx.fillStyle="#ffffff09";for(let i=8;i<pl.w;i+=18)ctx.fillRect(x+i,pl.y+13,2,pl.h-18);ctx.restore();}}
  function drawAnchors(){for(const a of anchors){const x=screenWorldX(a.x);if(x<-40||x>W+40)continue;const pulse=1+Math.sin(frameCount*.07+a.phase)*.14;ctx.save();ctx.translate(x,a.y);ctx.shadowColor="#9b7cff";ctx.shadowBlur=22;ctx.strokeStyle="#9b7cff55";ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,20*pulse,0,Math.PI*2);ctx.stroke();ctx.fillStyle="#9b7cff18";ctx.beginPath();ctx.arc(0,0,13*pulse,0,Math.PI*2);ctx.fill();ctx.shadowColor="#61f5ff";ctx.shadowBlur=15;ctx.fillStyle="#c9fcff";ctx.beginPath();ctx.arc(0,0,5.3,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#61f5ff";ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.stroke();ctx.restore();}}
  function drawCoins(){for(const c of coins){if(c.taken)continue;const x=screenWorldX(c.x);if(x<-15||x>W+15)continue;const bob=Math.sin(frameCount*.08+c.phase)*3;ctx.save();ctx.translate(x,c.y+bob);ctx.shadowColor="#ffd66b";ctx.shadowBlur=14;ctx.strokeStyle="#ffd66b";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,c.r,0,Math.PI*2);ctx.stroke();ctx.fillStyle="#ffd66b55";ctx.beginPath();ctx.arc(0,0,c.r*.55,0,Math.PI*2);ctx.fill();ctx.restore();}}
  function drawFinish(){const x=screenWorldX(worldEnd+70);if(x<-40||x>W+80)return;const base=H*.78;ctx.save();ctx.strokeStyle="#6bffbd";ctx.shadowColor="#6bffbd";ctx.shadowBlur=15;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,base);ctx.lineTo(x,base-125);ctx.stroke();ctx.shadowBlur=0;const cell=10;for(let r=0;r<4;r++)for(let c=0;c<4;c++){ctx.fillStyle=(r+c)%2===0?"#f3f5ff":"#6bffbd";ctx.fillRect(x+2+c*cell,base-123+r*cell,cell,cell);}ctx.fillStyle="#6bffbd";ctx.font="800 9px Orbitron";ctx.textAlign="center";ctx.fillText("META",x+22,base-72);ctx.restore();}
  function drawTrail(){for(const t of player.trail){const x=screenWorldX(t.x);ctx.globalAlpha=t.life/.24*.22;ctx.fillStyle="#61f5ff";ctx.beginPath();ctx.arc(x,t.y,3,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
  function drawRope(){if(!player.rope)return;const a=player.rope.anchor,ax=screenWorldX(a.x),px=screenWorldX(player.x);ctx.save();ctx.shadowColor="#61f5ff";ctx.shadowBlur=10;ctx.strokeStyle="#b3fbff";ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(ax,a.y);ctx.lineTo(px,player.y-8);ctx.stroke();ctx.strokeStyle="#9b7cff";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(ax+2,a.y);ctx.lineTo(px+2,player.y-8);ctx.stroke();ctx.restore();}
  function drawStickman(x,y,p){ctx.save();ctx.translate(x,y);const swinging=!!p.rope;ctx.rotate(swinging?Math.sin(frameCount*.06)*.12:clamp(p.vx/900,-.2,.25));ctx.lineCap="round";ctx.lineJoin="round";ctx.shadowColor="#61f5ff";ctx.shadowBlur=13;ctx.strokeStyle="#f3f7ff";ctx.lineWidth=3.5;
    // Head and face.
    ctx.beginPath();ctx.arc(0,-18,7.2,0,Math.PI*2);ctx.stroke();ctx.fillStyle="#f3f7ff";ctx.beginPath();ctx.arc(2,-19,1.3,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(0,9);ctx.stroke();
    const legSwing=swinging?Math.sin(frameCount*.1)*.5:Math.sin(frameCount*.2)*.35;
    ctx.beginPath();ctx.moveTo(0,8);ctx.lineTo(-6+legSwing*7,20);ctx.lineTo(-10+legSwing*9,28);ctx.moveTo(0,8);ctx.lineTo(7-legSwing*6,19);ctx.lineTo(12-legSwing*8,26);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(-9,1+legSwing*4);ctx.lineTo(-12,7+legSwing*4);ctx.moveTo(0,-5);ctx.lineTo(8,-12+(swinging?-3:0));ctx.lineTo(11,-18);ctx.stroke();
    ctx.restore();}
  function drawParticles(){for(const q of particles){ctx.globalAlpha=clamp(q.life/q.max,0,1);ctx.fillStyle=q.color;ctx.shadowColor=q.color;ctx.shadowBlur=9;ctx.beginPath();ctx.arc(screenWorldX(q.x),q.y,q.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;ctx.shadowBlur=0;}

  // Keep the title screen animated, without running the physics until Play is pressed.
  function idleDraw(){if(state==="menu"){frameCount++;draw();requestAnimationFrame(idleDraw);}}
  // Initial title-scene actor and world.
  resize();
  makeLevel(level);
  player={x:80,y:H*.66,vx:0,vy:0,r:13,rope:null,grounded:true,angle:0,trail:[],alive:true,invuln:0};
  ui.best.textContent=best+" m";ui.sideBest.textContent=best+" m";
  ui.level.textContent=String(level).padStart(2,"0");ui.sideLevel.textContent=String(level).padStart(2,"0");
  updateHUD();
  requestAnimationFrame(idleDraw);
})();