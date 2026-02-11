const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const GROUND = HEIGHT - 80;

// -------------------- PARAMÈTRES --------------------

const AL_COUNT = 40;
const O2_COUNT = 12;

let aluminium = [];
let dioxygen = [];
let alumina = [];

// -------------------- OUTILS 3D --------------------

function drawSphere(x, y, r, color1, color2){
  const grad = ctx.createRadialGradient(
    x - r/3, y - r/3, r/6,
    x, y, r
  );
  grad.addColorStop(0, color1);
  grad.addColorStop(1, color2);

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.fillStyle = grad;
  ctx.fill();
}

// -------------------- INITIALISATION --------------------

function initAluminium(){
  let rows = 5;
  let cols = 10;
  let spacing = 25;

  for(let i=0;i<rows;i++){
    for(let j=0;j<cols;j++){
      aluminium.push({
        x: 200 + j*spacing + Math.random()*5,
        y: GROUND - i*spacing + Math.random()*5,
        r:10,
        used:false
      });
    }
  }
}

function initO2(){
  for(let i=0;i<O2_COUNT;i++){
    dioxygen.push({
      x: Math.random()*WIDTH,
      y: Math.random()*200,
      vx: (Math.random()-0.5)*2,
      vy: (Math.random()-0.5)*2,
      r:8,
      used:false
    });
  }
}

// -------------------- RÉACTION --------------------

function tryReaction(){
  dioxygen.forEach(o2=>{
    if(o2.used) return;

    let nearby = aluminium.filter(a=>{
      return !a.used &&
      Math.hypot(a.x - o2.x, a.y - o2.y) < 30;
    });

    if(nearby.length >= 2){
      nearby.slice(0,2).forEach(a=>a.used=true);
      o2.used=true;

      alumina.push({
        x: nearby[0].x,
        y: nearby[0].y,
        r:14
      });
    }
  });
}

// -------------------- UPDATE --------------------

function update(){
  dioxygen.forEach(o2=>{
    if(o2.used) return;

    o2.x += o2.vx;
    o2.y += o2.vy;

    if(o2.x<0||o2.x>WIDTH) o2.vx*=-1;
    if(o2.y<0||o2.y>GROUND-40) o2.vy*=-1;
  });

  tryReaction();
}

// -------------------- DRAW --------------------

function draw(){
  ctx.clearRect(0,0,WIDTH,HEIGHT);

  // Aluminium solide (gris métallique)
  aluminium.forEach(a=>{
    if(!a.used)
      drawSphere(a.x, a.y, a.r, "#ffffff", "#8c8c8c");
  });

  // Dioxygène mobile (rouge)
  dioxygen.forEach(o2=>{
    if(!o2.used){
      drawSphere(o2.x-8, o2.y, o2.r, "#ffaaaa", "#cc0000");
      drawSphere(o2.x+8, o2.y, o2.r, "#ffaaaa", "#cc0000");
    }
  });

  // Oxyde d'aluminium solide (blanc/gris)
  alumina.forEach(al2o3=>{
    drawSphere(al2o3.x, al2o3.y, al2o3.r, "#ffffff", "#bbbbbb");
  });
}

// -------------------- LOOP --------------------

function animate(){
  update();
  draw();
  requestAnimationFrame(animate);
}

initAluminium();
initO2();
animate();
