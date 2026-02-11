(() => {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const GROUND = HEIGHT - 70;

  // UI
  const alSlider = document.getElementById("alSlider");
  const o2Slider = document.getElementById("o2Slider");
  const tSlider  = document.getElementById("tSlider");
  const alVal = document.getElementById("alVal");
  const o2Val = document.getElementById("o2Val");
  const tVal  = document.getElementById("tVal");
  const symbolsBtn = document.getElementById("symbolsBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const resetBtn = document.getElementById("resetBtn");

  let showSymbols = false;
  let paused = false;

  // Particules
  let aluminium = []; // atomes Al(s) (tas immobile)
  let dioxygen = [];  // molécules O2(g) (mobiles)
  let alumina   = []; // grains Al2O3(s) (solide, immobile)

  // --- Température (1..10) : vitesse + agitation + proba de réaction
  function tempFactor(){
    return Number(tSlider.value); // 1..10
  }

  // --- Dessin 3D
  function drawSphere(x, y, r, light, dark){
    const g = ctx.createRadialGradient(x - r*0.35, y - r*0.35, r*0.15, x, y, r);
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle = g;
    ctx.fill();
  }
  function drawLabel(text, x, y){
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#111";
    ctx.fillText(text, x, y);
  }

  // --- Tas d'aluminium : empilement triangulaire compact (pas d'atome flottant)
  function generateAlPile(count){
    aluminium = [];
    const r = 13;
    const spacing = r*2.05;

    // largeur de base approx
    let base = Math.ceil((Math.sqrt(8*count + 1) - 1)/2) + 2;
    base = Math.max(10, Math.min(22, base));

    let widths = [];
    let remaining = count;

    for(let w=base; w>=2 && remaining>0; w--){
      const n = Math.min(w, remaining);
      widths.push(n);
      remaining -= n;
    }

    const rows = widths.length;
    const pileTop = GROUND - (spacing*0.95) * (rows + 1);

    for(let i=0;i<rows;i++){
      const n = widths[i];
      const y = GROUND - i*(spacing*0.95) + (Math.random()-0.5)*2;
      const startX = WIDTH*0.35 - (n-1)*spacing/2;

      for(let j=0;j<n;j++){
        aluminium.push({
          x: startX + j*spacing + (Math.random()-0.5)*2.2,
          y: y + (Math.random()-0.5)*2.2,
          r,
          used:false
        });
      }
    }

    // Bornes : tout dans la zone du tas
    aluminium.forEach(a => {
      a.x = Math.max(a.r+6, Math.min(WIDTH - a.r - 6, a.x));
      a.y = Math.max(pileTop, Math.min(GROUND - a.r - 2, a.y));
    });
  }

  function generateO2(count){
    dioxygen = [];
    const r = 10;
    for(let i=0;i<count;i++){
      const ang = Math.random()*Math.PI*2;
      const tf = tempFactor();
      const speedBase = 1.1 * tf; // vitesse très dépendante de T
      const sp = speedBase * (0.55 + Math.random()*0.55);
      dioxygen.push({
        x: Math.random()*(WIDTH-120) + 60,
        y: Math.random()*220 + 30,
        vx: Math.cos(ang)*sp,
        vy: Math.sin(ang)*sp,
        r,
        used:false
      });
    }
  }

  // Produit Al2O3 : modèle moléculaire (2 Al + 3 O) en grain solide
  function spawnAlumina(){
    const baseX = WIDTH*0.68;
    const idx = alumina.length;
    const cols = 6;
    const row = Math.floor(idx / cols);
    const col = idx % cols;

    const r = 14;
    const px = baseX + (col - (cols-1)/2) * (r*3.1) + (Math.random()-0.5)*3.0;
    const py = GROUND - row*(r*2.7) + (Math.random()-0.5)*2.2;

    alumina.push({ x:px, y:py, r });
  }

  function resetAll(){
    alumina = [];
    generateAlPile(Number(alSlider.value));
    generateO2(Number(o2Slider.value));
    paused = false;
    pauseBtn.textContent = "Pause";
    updateUIReadouts();
  }

  // --- Aide : voisins et "exposition" (extérieur du tas)
  function findNearbyAl(x, y, radius){
    const list = [];
    for(const a of aluminium){
      if(a.used) continue;
      const d = Math.hypot(a.x-x, a.y-y);
      if(d < radius) list.push({a, d});
    }
    list.sort((p,q)=>p.d-q.d);
    return list.map(p=>p.a);
  }

  function exposureScore(alAtom){
    // Moins de voisins => plus externe
    let n = 0;
    const rr = alAtom.r * 2.2;
    for(const other of aluminium){
      if(other.used || other === alAtom) continue;
      const d = Math.hypot(other.x - alAtom.x, other.y - alAtom.y);
      if(d < rr) n++;
    }
    return n;
  }

  function takeNearestUnusedO2(x, y, k){
    const list = [];
    for(const o of dioxygen){
      if(o.used) continue;
      list.push({o, d: Math.hypot(o.x-x, o.y-y)});
    }
    list.sort((a,b)=>a.d-b.d);
    return list.slice(0,k).map(p=>p.o);
  }

  // --- Barrière "surface" : O2 ne passe pas sous le solide
  function surfaceYAt(x){
    const BIN = 12;
    const xi = Math.max(0, Math.min(WIDTH-1, x));
    const b = Math.floor(xi / BIN);
    let best = Infinity;

    for(const a of aluminium){
      if(a.used) continue;
      const bb = Math.floor(a.x / BIN);
      if(Math.abs(bb - b) <= 2){
        const top = a.y - a.r;
        if(top < best) best = top;
      }
    }
    for(const p of alumina){
      const bb = Math.floor(p.x / BIN);
      if(Math.abs(bb - b) <= 2){
        const top = p.y - p.r*2.0; // molécule plus haute qu'une sphère
        if(top < best) best = top;
      }
    }
    return best;
  }

  // --- Réaction : accélérée par T, et boost en fin pour garantir < 2 min quand T max
  function reactionProbability(){
    const tf = tempFactor(); // 1..10
    const alLeft = aluminium.filter(a=>!a.used).length;
    const o2Left = dioxygen.filter(o=>!o.used).length;
    const al0 = Number(alSlider.value);
    const o20 = Number(o2Slider.value);

    const frac = Math.min(alLeft/Math.max(1,al0), o2Left/Math.max(1,o20)); // 1 -> 0

    const base = 0.10 + 0.06*tf;        // 0.16..0.70
    const endBoost = (frac < 0.30) ? (0.35*(0.30-frac)/0.30) : 0; // 0..0.35
    return Math.min(0.98, base + endBoost);
  }

  function tryReactionAt(x, y){
    // besoin 4 Al proches ; consomme 3 O2 "les plus proches disponibles"
    const nearAl = findNearbyAl(x, y, 56);
    if(nearAl.length < 4) return;

    const o2Avail = dioxygen.filter(o=>!o.used).length;
    if(o2Avail < 1) return;

    if(Math.random() < reactionProbability()){
      // consommer Al externes
      nearAl.sort((p,q)=>exposureScore(p)-exposureScore(q));
      for(let i=0;i<4;i++) nearAl[i].used = true;

      // consommer jusqu'à 3 O2
      const picked = takeNearestUnusedO2(x, y, Math.min(3, o2Avail));
      for(const mol of picked) mol.used = true;

      // produire (2 pour 3 O2, sinon 1 minimum)
      const nO2 = picked.length;
      const nProducts = (nO2 >= 3) ? 2 : 1;
      for(let k=0;k<nProducts;k++) spawnAlumina();
    }
  }

  // --- Gaz
  function updateO2(){
    const tf = tempFactor();
    const jitter = 0.12 * tf;
    const vmax = 3.8 * tf;

    // fréquence des tentatives : augmente fortement quand la réaction approche de la fin
    const alLeft = aluminium.filter(a=>!a.used).length;
    const o2Left = dioxygen.filter(o=>!o.used).length;
    const al0 = Number(alSlider.value);
    const o20 = Number(o2Slider.value);
    const frac = Math.min(alLeft/Math.max(1,al0), o2Left/Math.max(1,o20));
    const pTry = (frac < 0.35) ? 1.0 : 0.70;

    for(const o2 of dioxygen){
      if(o2.used) continue;

      // agitation thermique
      o2.vx += (Math.random()-0.5) * jitter;
      o2.vy += (Math.random()-0.5) * jitter;

      // limite vitesse
      const v = Math.hypot(o2.vx, o2.vy);
      if(v > vmax){
        o2.vx *= vmax / v;
        o2.vy *= vmax / v;
      }

      o2.x += o2.vx;
      o2.y += o2.vy;

      // rebonds
      if(o2.x < 20 || o2.x > WIDTH-20) o2.vx *= -1;
      if(o2.y < 20 || o2.y > GROUND-30) o2.vy *= -1;

      // barrière surface
      const sY = surfaceYAt(o2.x);
      if(sY !== Infinity){
        const limitY = sY - (o2.r + 3);
        if(o2.y > limitY){
          o2.y = limitY;
          if(o2.vy > 0) o2.vy *= -0.85;
        }
      }

      // tentatives réaction
      if(Math.random() < pTry){
        tryReactionAt(o2.x, o2.y);
      }
    }
  }

  // --- HUD
  function counts(){
    return {
      alLeft: aluminium.filter(a=>!a.used).length,
      o2Left: dioxygen.filter(o=>!o.used).length,
      al2o3: alumina.length
    };
  }

  function drawHUD(){
    const c = counts();
    const x = 16, y = 16;
    const w = 260, h = 78;

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#cfcfcf";
    ctx.lineWidth = 1;
    if(ctx.roundRect){
      ctx.beginPath();
      ctx.roundRect(x,y,w,h,10);
      ctx.fill();
      ctx.stroke();
    }else{
      ctx.fillRect(x,y,w,h);
      ctx.strokeRect(x,y,w,h);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#111";
    ctx.font = "14px Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Comptage", x+12, y+10);

    ctx.font = "13px Arial";
    ctx.fillText(`Al(s) : ${c.alLeft}`, x+12, y+30);
    ctx.fillText(`O₂(g) : ${c.o2Left}`, x+12, y+48);
    ctx.fillText(`Al₂O₃(s) : ${c.al2o3}`, x+12, y+66);

    ctx.restore();
  }

  // --- Dessin scène
  function draw(){
    ctx.clearRect(0,0,WIDTH,HEIGHT);

    // sol
    ctx.strokeStyle = "#d0d0d0";
    ctx.beginPath();
    ctx.moveTo(0, GROUND+18);
    ctx.lineTo(WIDTH, GROUND+18);
    ctx.stroke();

    // Al(s)
    for(const a of aluminium){
      if(a.used) continue;
      drawSphere(a.x, a.y, a.r, "#ffffff", "#8c8c8c");
      if(showSymbols) drawLabel("Al", a.x, a.y);
    }

    // Al2O3(s) : modèle moléculaire
    for(const p of alumina){
      const r = p.r;
      const pts = [
        {dx:-r*0.9, dy: 0,       kind:"Al"},
        {dx: r*0.9, dy: 0,       kind:"Al"},
        {dx: 0,     dy:-r*0.95,  kind:"O"},
        {dx:-r*0.55,dy: r*0.95,  kind:"O"},
        {dx: r*0.55,dy: r*0.95,  kind:"O"},
      ];
      for(const q of pts){
        if(q.kind === "Al"){
          drawSphere(p.x+q.dx, p.y+q.dy, r*0.95, "#ffffff", "#b0b0b0");
          if(showSymbols) drawLabel("Al", p.x+q.dx, p.y+q.dy);
        }else{
          drawSphere(p.x+q.dx, p.y+q.dy, r*0.85, "#ffb5b5", "#c40000");
          if(showSymbols) drawLabel("O", p.x+q.dx, p.y+q.dy);
        }
      }
      if(showSymbols) drawLabel("Al₂O₃", p.x, p.y - r*2.0);
    }

    // O2(g)
    for(const o2 of dioxygen){
      if(o2.used) continue;
      const dx = 10;
      drawSphere(o2.x - dx, o2.y, o2.r, "#ffb5b5", "#c40000");
      drawSphere(o2.x + dx, o2.y, o2.r, "#ffb5b5", "#c40000");
      if(showSymbols){
        drawLabel("O", o2.x - dx, o2.y);
        drawLabel("O", o2.x + dx, o2.y);
      }
    }

    drawHUD();
  }

  // --- Loop
  function tick(){
    if(!paused){
      updateO2();
    }
    draw();
    requestAnimationFrame(tick);
  }

  // --- UI
  function updateUIReadouts(){
    alVal.textContent = alSlider.value;
    o2Val.textContent = o2Slider.value;
    tVal.textContent  = "×" + tSlider.value;
  }

  alSlider.addEventListener("input", updateUIReadouts);
  o2Slider.addEventListener("input", updateUIReadouts);
  tSlider.addEventListener("input", updateUIReadouts);

  symbolsBtn.addEventListener("click", () => {
    showSymbols = !showSymbols;
    symbolsBtn.textContent = "Symboles : " + (showSymbols ? "ON" : "OFF");
  });

  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.textContent = paused ? "Reprendre" : "Pause";
  });

  resetBtn.addEventListener("click", resetAll);

  // Polyfill roundRect
  if(!CanvasRenderingContext2D.prototype.roundRect){
    CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
      const rr = Math.min(r, w/2, h/2);
      this.beginPath();
      this.moveTo(x+rr, y);
      this.arcTo(x+w, y, x+w, y+h, rr);
      this.arcTo(x+w, y+h, x, y+h, rr);
      this.arcTo(x, y+h, x, y, rr);
      this.arcTo(x, y, x+w, y, rr);
      this.closePath();
      return this;
    };
  }

  // Init
  updateUIReadouts();
  resetAll();
  tick();
})();