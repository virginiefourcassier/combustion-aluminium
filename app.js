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

  // --- SYSTÈME ---
  let aluminium = []; // atomes Al(s) immobiles
  let dioxygen = [];  // molécules O2(g) mobiles
  let alumina   = []; // "grains" Al2O3(s) immobiles

  // Température : agit sur agitation + probabilité
  function tempFactor(){
    return Number(tSlider.value); // 1..5
  }

  // ---- DESSIN 3D ----
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

  // ---- GÉNÉRATION DES TAS ----
  function generateAlPile(count){
    aluminium = [];
    const r = 13;
    const spacing = r*2.05;

    // On fabrique un tas compact : base large, sommet étroit.
    // Nombre de "lignes" ~ sqrt(n)
    const rows = Math.max(4, Math.min(10, Math.round(Math.sqrt(count))));
    let remaining = count;

    // largeur de base (en atomes)
    const base = Math.max(8, Math.min(16, Math.round(Math.sqrt(count) * 1.8)));

    for(let i=0;i<rows && remaining>0;i++){
      // chaque rangée a moins d'atomes en montant
      const rowCount = Math.max(2, Math.min(base, Math.round(base - i*(base/rows))));
      const n = Math.min(rowCount, remaining);
      remaining -= n;

      const y = GROUND - i*(spacing*0.95) + (Math.random()-0.5)*2;

      // centrage horizontal
      const startX = WIDTH*0.35 - (n-1)*spacing/2;
      for(let j=0;j<n;j++){
        aluminium.push({
          x: startX + j*spacing + (Math.random()-0.5)*3,
          y: y + (Math.random()-0.5)*3,
          r,
          used:false
        });
      }
    }

    // si on n'a pas assez rempli (cas count grand), on ajoute au-dessus en petits paquets
    while(remaining>0){
      const i = Math.min(rows + 3, rows + Math.floor(Math.random()*3));
      const y = GROUND - i*(spacing*0.95);
      const n = Math.min(4, remaining);
      remaining -= n;
      const startX = WIDTH*0.35 - (n-1)*spacing/2;
      for(let j=0;j<n;j++){
        aluminium.push({
          x: startX + j*spacing + (Math.random()-0.5)*10,
          y: y + (Math.random()-0.5)*6,
          r,
          used:false
        });
      }
    }

    // sécurité : tout visible ET aucun atome ne "flotte" trop haut
    // On impose une hauteur maximale du tas (pileTop).
    const pileTop = GROUND - (spacing*0.95) * (rows + 6);

    aluminium.forEach(a => {
      a.x = Math.max(a.r+6, Math.min(WIDTH - a.r - 6, a.x));
      // bornes verticales : entre pileTop et le sol du tas
      a.y = Math.max(pileTop, Math.min(GROUND - a.r - 2, a.y));
    });
  }

  function generateO2(count){
    dioxygen = [];
    const r = 10;
    for(let i=0;i<count;i++){
      const speedBase = 1.1;
      const ang = Math.random()*Math.PI*2;
      const sp = speedBase * (0.7 + Math.random()*0.7) * tempFactor();
      dioxygen.push({
        x: Math.random()*(WIDTH-100) + 50,
        y: Math.random()*220 + 30,
        vx: Math.cos(ang)*sp,
        vy: Math.sin(ang)*sp,
        r,
        used:false
      });
    }
  }

  function resetAll(){
    alumina = [];
    const alCount = Number(alSlider.value);
    const o2Count = Number(o2Slider.value);

    generateAlPile(alCount);
    generateO2(o2Count);

    paused = false;
    pauseBtn.textContent = "Pause";
    updateUIReadouts();
  }

  // ---- RÉACTION : 4 Al + 3 O2 -> 2 Al2O3 ----
  function reactionProbability(){
    // valeur de base, renforcée par la température
    const tf = tempFactor(); // 1..5
    return Math.min(0.85, 0.05 * tf); // 0.08..0.40 (cap à 0.70)
  }

  function findNearbyAl(x, y, radius){
    const list = [];
    for(const a of aluminium){
      if(a.used) continue;
      const d = Math.hypot(a.x-x, a.y-y);
      if(d < radius) list.push({a, d});
    }
    list.sort((p,q)=>p.d - q.d);
    return list.map(p=>p.a);
  }

  
  function exposureScore(alAtom){
    // Moins de voisins => plus "externe"
    let n = 0;
    const rr = alAtom.r * 2.2;
    for(const other of aluminium){
      if(other.used || other === alAtom) continue;
      const d = Math.hypot(other.x - alAtom.x, other.y - alAtom.y);
      if(d < rr) n++;
    }
    return n;
  }

function findNearbyO2(x, y, radius){
    const list = [];
    for(const o of dioxygen){
      if(o.used) continue;
      const d = Math.hypot(o.x-x, o.y-y);
      if(d < radius) list.push({o, d});
    }
    list.sort((p,q)=>p.d - q.d);
    return list.map(p=>p.o);
  }

  function spawnAluminaAt(x){
    // produit solide en bas : on empile dans une zone à droite du tas d'Al
    const baseX = WIDTH*0.68;
    const r = 16;

    // on calcule une position de "tas" simple (grille compacte)
    const idx = alumina.length;
    const cols = 8;
    const row = Math.floor(idx / cols);
    const col = idx % cols;

    const px = baseX + (col - (cols-1)/2) * (r*2.1) + (Math.random()-0.5)*4;
    const py = GROUND - row*(r*2.0) + (Math.random()-0.5)*3;

    alumina.push({ x: px, y: py, r });
  }

  function tryReactionAt(o2){
    // Essaye une réaction au voisinage de l'impact o2-al
    if(o2.used) return;

    // petites collisions plus probables à T élevée
    const nearAl = findNearbyAl(o2.x, o2.y, 34);
    if(nearAl.length < 1) return;

    // Réaction si on dispose de 4 Al ET 3 O2 proches
    const nearO2 = findNearbyO2(o2.x, o2.y, 48);
    if(nearAl.length >= 4 && nearO2.length >= 3){
      if(Math.random() < reactionProbability()){
        // consommer 4 Al : on privilégie les atomes "externes" (peu de voisins) pour éviter les trous
        nearAl.sort((p,q)=>exposureScore(p)-exposureScore(q));
        for(let i=0;i<4;i++) nearAl[i].used = true;
        // consommer 3 O2
        for(let i=0;i<3;i++) nearO2[i].used = true;

        // produire 2 unités solides Al2O3
        spawnAluminaAt(o2.x);
        spawnAluminaAt(o2.x);
      }
    }
  }

  // ---- PHYSIQUE DU GAZ ----
  function updateO2(){
    const tf = tempFactor();
    // amortissement doux + agitation dépendant de T
    const jitter = 0.08 * tf;

    for(const o2 of dioxygen){
      if(o2.used) continue;

      // légère agitation aléatoire (température)
      o2.vx += (Math.random()-0.5) * jitter;
      o2.vy += (Math.random()-0.5) * jitter;

      // limiter la vitesse
      const vmax = 3.2 * tf;
      const v = Math.hypot(o2.vx, o2.vy);
      if(v > vmax){
        o2.vx *= vmax / v;
        o2.vy *= vmax / v;
      }

      o2.x += o2.vx;
      o2.y += o2.vy;

      // rebonds parois
      if(o2.x < 20 || o2.x > WIDTH-20) o2.vx *= -1;
      if(o2.y < 20 || o2.y > GROUND-30) o2.vy *= -1;

      // barrière "surface" : empêche O2 de passer sous le solide
      const sY = surfaceYAt(o2.x);
      if(sY !== Infinity){
        const limitY = sY - (o2.r + 3);
        if(o2.y > limitY){
          o2.y = limitY;
          if(o2.vy > 0) o2.vy *= -0.85;
        }
      }

      // "collision" avec le tas : si proche d'un atome Al, rebond + tentative réaction
      for(const a of aluminium){
        if(a.used) continue;
        const d = Math.hypot(o2.x - a.x, o2.y - a.y);
        if(d < (o2.r + a.r + 2)){
          // rebond simple : inverser composante dominante
          if(Math.abs(o2.x - a.x) > Math.abs(o2.y - a.y)) o2.vx *= -1;
          else o2.vy *= -1;

          // éloigner un peu
          o2.x += o2.vx*2;
          o2.y += o2.vy*2;

          tryReactionAt(o2);
          break;
        }
      }
    }
  }

  // ---- HUD ----
  function counts(){
    const alLeft = aluminium.filter(a=>!a.used).length;
    const o2Left = dioxygen.filter(o=>!o.used).length;
    const al2o3 = alumina.length;
    return {alLeft, o2Left, al2o3};
  }

  
  function surfaceYAt(x){
    // Surface du solide (Al non consommé + Al2O3) : empêche O2 de passer dessous
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
        const top = p.y - p.r;
        if(top < best) best = top;
      }
    }
    return best; // Infinity si aucun solide à cet x
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
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
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

  // ---- DESSIN ----
  function draw(){
    ctx.clearRect(0,0,WIDTH,HEIGHT);

    // ligne sol (discrète)
    ctx.strokeStyle = "#d0d0d0";
    ctx.beginPath();
    ctx.moveTo(0, GROUND+18);
    ctx.lineTo(WIDTH, GROUND+18);
    ctx.stroke();

    // Aluminium solide (gris métallique)
    for(const a of aluminium){
      if(a.used) continue;
      drawSphere(a.x, a.y, a.r, "#ffffff", "#8c8c8c");
      if(showSymbols) drawLabel("Al", a.x, a.y);
    }

    // Produit solide (blanc/gris)
    for(const p of alumina){
      drawSphere(p.x, p.y, p.r, "#ffffff", "#bdbdbd");
      if(showSymbols) drawLabel("Al₂O₃", p.x, p.y);
    }

    // Dioxygène (2 sphères rouges)
    for(const o2 of dioxygen){
      if(o2.used) continue;
      const dx = 9, r = o2.r;
      drawSphere(o2.x - dx, o2.y, r, "#ffb5b5", "#c40000");
      drawSphere(o2.x + dx, o2.y, r, "#ffb5b5", "#c40000");
      if(showSymbols){
        drawLabel("O", o2.x - dx, o2.y);
        drawLabel("O", o2.x + dx, o2.y);
      }
    }

    drawHUD();
  }

  // ---- LOOP ----
  function tick(){
    if(!paused){
      updateO2();
      draw();
    }else{
      // redraw léger (HUD stable)
      draw();
    }
    requestAnimationFrame(tick);
  }

  // ---- UI EVENTS ----
  function updateUIReadouts(){
    alVal.textContent = alSlider.value;
    o2Val.textContent = o2Slider.value;
    tVal.textContent = "×" + tSlider.value;
  }

  alSlider.addEventListener("input", updateUIReadouts);
  o2Slider.addEventListener("input", updateUIReadouts);
  tSlider.addEventListener("input", () => {
    updateUIReadouts();
    // la température modifie vitesse : on ré-étalonne doucement les vitesses
    const tf = tempFactor();
    for(const o2 of dioxygen){
      if(o2.used) continue;
      const v = Math.hypot(o2.vx, o2.vy);
      const target = Math.max(0.2, Math.min(2.2*tf, v));
      if(v > 0){
        o2.vx *= target / v;
        o2.vy *= target / v;
      }
    }
  });

  symbolsBtn.addEventListener("click", () => {
    showSymbols = !showSymbols;
    symbolsBtn.textContent = "Symboles : " + (showSymbols ? "ON" : "OFF");
  });

  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.textContent = paused ? "Reprendre" : "Pause";
  });

  resetBtn.addEventListener("click", resetAll);

  // Polyfill roundRect minimal (pour vieux navigateurs)
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

  // INIT
  updateUIReadouts();
  resetAll();
  tick();
})();