// worker.js - Cloudflare Worker with embedded frontend

const CHAR_WIDTHS = { f:6,i:4,j:4,l:4,r:5,t:5,I:5,' ':4, default:7 };
function textWidth(str) {
  let w = 0;
  for (const ch of str) w += CHAR_WIDTHS[ch] ?? CHAR_WIDTHS.default;
  return w;
}

function generateBadge(label, value, color = 'gold') {
  const colors = { gold:'#FFD700', blue:'#3498db', green:'#2ecc71', red:'#e74c3c', purple:'#9b59b6', orange:'#ff6b35', cyan:'#00b4d8', pink:'#ff69b4' };
  const fill = colors[color] || (color.startsWith('#') ? color : '#' + color);
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const labelU = esc(label).toUpperCase(), valueU = esc(value).toUpperCase();
  const labelPx = textWidth(labelU) + 20, valuePx = textWidth(valueU) + 20;
  const tw = labelPx + valuePx, lx = labelPx / 2, vx = labelPx + valuePx / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="28">
  <rect width="${labelPx}" height="28" fill="#555"/>
  <rect x="${labelPx}" width="${valuePx}" height="28" fill="${fill}"/>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,sans-serif" font-size="10" font-weight="bold" letter-spacing="1">
    <text x="${lx}" y="19">${labelU}</text>
    <text x="${vx}" y="19">${valueU}</text>
  </g>
</svg>`;
}

function formatCount(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

async function githubRequest(path, token) {
  const headers = { 'User-Agent': 'Stargazer/1.0' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (res.status === 404) throw new Error('User not found');
  if (res.status === 403) throw new Error('Rate limited');
  if (!res.ok) throw new Error('GitHub error');
  return res.json();
}

async function getStars(username, token) {
  const user = await githubRequest(`/users/${username}`, token);
  if (!user.public_repos) return { stars: 0, user };
  const pages = Math.ceil(user.public_repos / 100);
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      githubRequest(`/users/${username}/repos?per_page=100&page=${i + 1}`, token)
    )
  );
  const stars = results.flat().reduce((sum, r) => sum + r.stargazers_count, 0);
  return { stars, user };
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stargazer</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0c10;color:#e8eaf0;font-family:system-ui,sans-serif;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}
#particles{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0}
.box{background:rgba(17,19,24,0.95);border:1px solid #252830;border-radius:12px;padding:20px 28px;width:340px;text-align:center;position:relative;z-index:1;backdrop-filter:blur(10px)}
h1{font-size:18px;margin-bottom:14px}h1 span{color:#f0c040}
.row{display:flex;gap:8px;margin-bottom:12px}
input{flex:1;background:#1a1d24;border:1px solid #252830;border-radius:6px;color:#e8eaf0;font-size:13px;padding:8px 10px;outline:none}
input:focus{border-color:#f0c040}
button{background:#f0c040;color:#0a0c10;border:none;border-radius:6px;font-size:13px;font-weight:600;padding:8px 14px;cursor:pointer}
button:hover{opacity:.9}button:disabled{opacity:.4}
.colors{display:flex;gap:6px;justify-content:center;margin-bottom:12px}
.c{width:24px;height:24px;border-radius:5px;cursor:pointer;border:2px solid transparent}
.c:hover{transform:scale(1.1)}.c.on{border-color:#fff}
.stars{font-size:48px;font-weight:700;color:#f0c040;margin:16px 0 6px}
.sub{font-size:12px;color:#6b7080;margin-bottom:14px}
.badge{margin:12px 0}.badge img{height:26px}
.copy{background:#1a1d24;border:1px solid #252830;border-radius:6px;padding:10px;font-size:10px;color:#40e0c0;word-break:break-all;cursor:pointer}
.copy:hover{border-color:#40e0c0}.copy.ok{border-color:#40c880;color:#40c880}
.err{color:#f05060;font-size:11px;margin-top:8px}
.hidden{display:none}
</style>
</head>
<body>
<canvas id="particles"></canvas>
<div class="box">
  <h1>Star<span>gazer</span></h1>
  <div class="row">
    <input id="user" placeholder="GitHub username" autocomplete="off"/>
    <button id="btn" onclick="go()">Go</button>
  </div>
  <div class="colors" id="colors"></div>
  <div id="result" class="hidden">
    <div class="stars" id="count">0</div>
    <div class="sub">total stars</div>
    <div class="badge"><img id="img" alt="badge"/></div>
    <div class="copy" id="md" onclick="copy()"></div>
  </div>
  <div id="err" class="err hidden"></div>
</div>
<script>
const API=location.origin;
const COLORS=[['gold','#FFD700'],['blue','#3498db'],['green','#2ecc71'],['red','#e74c3c'],['purple','#9b59b6'],['orange','#ff6b35'],['cyan','#00b4d8'],['pink','#ff69b4']];
let color='gold',user='';
const box=document.getElementById('colors');
COLORS.forEach(([name,hex],i)=>{
  const el=document.createElement('div');
  el.className='c'+(i===0?' on':'');
  el.style.background=hex;
  el.onclick=()=>{
    document.querySelectorAll('.c').forEach(e=>e.classList.remove('on'));
    el.classList.add('on');
    color=name;
    upd();
  };
  box.appendChild(el);
});
async function go(){
  user=document.getElementById('user').value.trim();
  if(!user)return;
  const btn=document.getElementById('btn');
  btn.disabled=true;btn.textContent='...';
  document.getElementById('err').classList.add('hidden');
  document.getElementById('result').classList.add('hidden');
  try{
    const res=await fetch(API+'/api/'+user+'/stars');
    const data=await res.json();
    if(!res.ok)throw new Error(data.error);
    document.getElementById('count').textContent=data.total_stars.toLocaleString();
    document.getElementById('result').classList.remove('hidden');
    upd();
  }catch(e){
    document.getElementById('err').textContent=e.message;
    document.getElementById('err').classList.remove('hidden');
  }
  btn.disabled=false;btn.textContent='Go';
}
function upd(){
  if(!user)return;
  const url=API+'/badge/'+user+'?color='+color;
  document.getElementById('img').src=url;
  document.getElementById('md').textContent='![Stars]('+url+')';
}
function copy(){
  const el=document.getElementById('md');
  navigator.clipboard.writeText(el.textContent);
  el.classList.add('ok');
  setTimeout(()=>el.classList.remove('ok'),1500);
}
document.getElementById('user').addEventListener('keydown',e=>{if(e.key==='Enter')go()});

// Particles
const canvas=document.getElementById('particles');
const ctx=canvas.getContext('2d');
let particles=[];
function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
resize();window.addEventListener('resize',resize);
for(let i=0;i<80;i++){
  particles.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*2+1,dx:(Math.random()-0.5)*0.5,dy:(Math.random()-0.5)*0.5,a:Math.random()*0.5+0.2});
}
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  particles.forEach(p=>{
    p.x+=p.dx;p.y+=p.dy;
    if(p.x<0||p.x>canvas.width)p.dx*=-1;
    if(p.y<0||p.y>canvas.height)p.dy*=-1;
    ctx.beginPath();
    ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
    ctx.fillStyle='rgba(240,192,64,'+p.a+')';
    ctx.fill();
  });
  particles.forEach((p,i)=>{
    for(let j=i+1;j<particles.length;j++){
      const p2=particles[j];
      const dist=Math.hypot(p.x-p2.x,p.y-p2.y);
      if(dist<120){
        ctx.beginPath();
        ctx.moveTo(p.x,p.y);
        ctx.lineTo(p2.x,p2.y);
        ctx.strokeStyle='rgba(240,192,64,'+(0.15*(1-dist/120))+')';
        ctx.stroke();
      }
    }
  });
  requestAnimationFrame(draw);
}
draw();
</script>
</body>
</html>`;

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const token = env.GITHUB_TOKEN;
  const cors = { 'Access-Control-Allow-Origin': '*' };

  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

  if (path === '/' || path === '/index.html') {
    return new Response(HTML, { headers: { 'Content-Type': 'text/html', ...cors } });
  }

  if (path === '/health') {
    return Response.json({ ok: true }, { headers: cors });
  }

  const badgeMatch = path.match(/^\/badge\/([^/]+)$/);
  if (badgeMatch) {
    const username = badgeMatch[1];
    const color = url.searchParams.get('color') || 'gold';
    try {
      const { stars } = await getStars(username, token);
      const svg = generateBadge('Stars', formatCount(stars), color);
      return new Response(svg, {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300', ...cors }
      });
    } catch (err) {
      const svg = generateBadge('Stars', 'Error', 'red');
      return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', ...cors } });
    }
  }

  const apiMatch = path.match(/^\/api\/([^/]+)\/stars$/);
  if (apiMatch) {
    const username = apiMatch[1];
    try {
      const { stars, user } = await getStars(username, token);
      return Response.json({ username: user.login, total_stars: stars, public_repos: user.public_repos }, { headers: cors });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 404, headers: cors });
    }
  }

  return new Response('Not found', { status: 404, headers: cors });
}

export default { fetch: handleRequest };
