import {useEffect,useRef} from 'react';
import type {RefObject} from 'react';

type Phase='idle'|'working'|'ready'|'error';
type Point={x:number;y:number};
type Particle={born:number;duration:number;seed:number;side:number};
type Simulation={key:string;time:number;angle:number;success:number|null;failed:number|null;emit:number;serial:number;particles:Particle[]};
const clamp=(value:number)=>Math.max(0,Math.min(1,value));
const smooth=(value:number)=>{const t=clamp(value);return t*t*(3-2*t)};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const gold=(t:number,alpha=1)=>`rgba(255,${Math.round(mix(255,193,t))},${Math.round(mix(255,112,t))},${alpha})`;
const point=(a:Point,b:Point,c:Point,d:Point,t:number):Point=>{const u=1-t;return{x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y}};

// This is operation feedback. Its clock deliberately does not use OS motion
// preferences or the application's ambient-effects switch. Hidden views pause it.
export function GameAnimation({game,run,phase,active,launcher,button,emblem}:{game:string;run:number;phase:Phase;active:boolean;launcher:RefObject<HTMLElement>;button:RefObject<HTMLButtonElement>;emblem:RefObject<HTMLDivElement>}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const simulation=useRef<Simulation|null>(null);
 useEffect(()=>{
  const surface=canvas.current,host=launcher.current,target=emblem.current;
  if(!surface||!host||!target)return;
  const ctx=surface.getContext('2d');if(!ctx)return;
  const key=`${game}:${run}`;
  if(simulation.current?.key!==key)simulation.current={key,time:run===0&&phase==='ready'?5:0,angle:0,success:run===0&&phase==='ready'?-10:null,failed:null,emit:0,serial:0,particles:[]};
  const state=simulation.current;
  if(run===0&&phase==='ready'&&state.success===null){state.time=5;state.success=-10}
  let width=0,height=0,dpr=1,origin:Point={x:0,y:0},center:Point={x:0,y:0},radius=96;
  let frame=0,last=0,focused=document.hasFocus(),disposed=false;
  const sparks=Array.from({length:8},(_,i)=>{
   const sprite=document.createElement('canvas');sprite.width=24;sprite.height=24;
   const brush=sprite.getContext('2d')!;const light=brush.createRadialGradient(12,12,0,12,12,12);
   light.addColorStop(0,gold(i/7,.7));light.addColorStop(.18,gold(i/7,.28));light.addColorStop(1,gold(i/7,0));
   brush.fillStyle=light;brush.fillRect(0,0,24,24);return sprite;
  });
  function measure(){
   const bounds=host!.getBoundingClientRect(),logo=target!.getBoundingClientRect(),source=button.current?.getBoundingClientRect();
   width=host!.clientWidth;height=host!.clientHeight;dpr=Math.min(window.devicePixelRatio||1,2);
   surface!.width=Math.round(width*dpr);surface!.height=Math.round(height*dpr);
   center={x:logo.left+logo.width/2-bounds.left-host!.clientLeft,y:logo.top+logo.height/2-bounds.top-host!.clientTop};
   origin=source?{x:source.left+source.width/2-bounds.left-host!.clientLeft,y:source.top+4-bounds.top-host!.clientTop}:{...center};
   radius=Math.max(1,Math.min(98,(width-32)/3.6));
  }
  function ellipse(rx:number,ry:number,rotation:number,start=0,end=Math.PI*2){ctx!.beginPath();ctx!.ellipse(center.x,center.y,rx,ry,rotation,start,end)}
  function ring(rx:number,ry:number,rotation:number,opacity:number,thickness:number,offset:number){
   if(opacity<=0)return;
   // The central horizon stays fixed; only the separate outer disk moves.
   ctx!.lineCap='butt';
   for(let i=0;i<96;i++){
    const a=i*Math.PI*2/96,hot=(Math.cos(a-offset)+1)/2;
    ctx!.strokeStyle=gold(.18+.72*(1-hot),opacity*(.3+.7*hot));ctx!.lineWidth=thickness*(.55+.65*hot);
    ellipse(rx,ry,rotation,a,a+Math.PI*2/96+.001);ctx!.stroke();
   }
  }
  function draw(){
   if(width<=0||height<=0)return false;
   const s=state!;ctx!.setTransform(dpr,0,0,dpr,0,0);ctx!.clearRect(0,0,width,height);
   if(phase==='idle'){surface!.dataset.stage='idle';return false}
   if(phase==='ready'&&s.success===null)s.success=Math.max(s.time,2.9);
   if(phase==='error'&&s.failed===null)s.failed=s.time;
   const fade=s.failed===null?1:1-smooth((s.time-s.failed)/.65);
   const halo=smooth((s.time-.95)/1.35)*fade,horizon=smooth((s.time-1.95)/1.05)*fade;
   const completed=s.success!==null?s.time-s.success:-1;
   const boost=completed<0?0:completed<.22?smooth(completed/.22):1-smooth((completed-.65)/1.1);
   const speed=.28+(s.success===null?0:completed<0?0:1.05)+boost*4.5;
   const yaw=-.8+s.angle*.55,inclination=.3;
   const cosYaw=Math.cos(yaw),sinYaw=Math.sin(yaw),cosInclination=Math.cos(inclination),sinInclination=Math.sin(inclination);
   // Rotate the disk about its vertical axis in 3D, then project it onto the screen.
   // Its apparent slope changes while the central shadow and horizon stay fixed.
   const nearStart=Math.atan2(sinYaw,cosInclination*cosYaw);
   const diskPoint=(t:number,scale:number)=>({x:center.x+radius*scale*(cosYaw*Math.cos(t)+cosInclination*sinYaw*Math.sin(t)),y:center.y+radius*scale*sinInclination*Math.sin(t)});
   surface!.dataset.stage=phase==='error'?'error':completed>=0?(completed<1.7?'boost':'orbit'):horizon>.1?'horizon':halo>.05?'halo':'particles';
   surface!.dataset.speed=speed.toFixed(2);surface!.dataset.angle=s.angle.toFixed(3);
   surface!.dataset.diskYaw=yaw.toFixed(4);surface!.dataset.diskInclination=String(inclination);surface!.dataset.horizonRadius=radius.toFixed(2);
   surface!.dataset.origin=`${origin.x.toFixed(1)},${origin.y.toFixed(1)}`;surface!.dataset.target=`${center.x.toFixed(1)},${center.y.toFixed(1)}`;
   function disk(side:'back'|'front'){
    if(horizon<=0)return;
    ctx!.save();
    if(side==='back'){
     // The far half is occluded by the central shadow, even while it fades in.
     ctx!.beginPath();ctx!.rect(0,0,width,height);ctx!.moveTo(center.x+radius*.94,center.y);ctx!.arc(center.x,center.y,radius*.94,0,Math.PI*2);ctx!.clip('evenodd');
    }
    // z(t) has its front/back crossings at nearStart and nearStart + PI.
    const start=nearStart+(side==='back'?Math.PI:0),step=Math.PI/48;
    ctx!.strokeStyle=gold(.62,horizon*.23);ctx!.lineWidth=9;ctx!.lineCap='round';ctx!.beginPath();
    for(let i=0;i<=48;i++){const p=diskPoint(start+i*step,1.76);if(i===0)ctx!.moveTo(p.x,p.y);else ctx!.lineTo(p.x,p.y)}
    ctx!.stroke();ctx!.lineCap='butt';
    for(const [scale,opacity,thickness,offset] of [[1.76,horizon,4.4,1.2],[1.83,horizon*.25,1,2]]){
     for(let i=0;i<48;i++){
      const t=start+i*step,hot=(Math.cos(t-s.angle-offset)+1)/2;
      const a=diskPoint(t,scale),b=diskPoint(t+step+.001,scale);
      ctx!.strokeStyle=gold(.18+.72*(1-hot),opacity*(.3+.7*hot));ctx!.lineWidth=thickness*(.55+.65*hot);
      ctx!.beginPath();ctx!.moveTo(a.x,a.y);ctx!.lineTo(b.x,b.y);ctx!.stroke();
     }
    }
    ctx!.restore();
   }
   ctx!.save();
   if(halo>0){
    const glow=ctx!.createRadialGradient(center.x,center.y,radius*.65,center.x,center.y,radius*1.9);
    glow.addColorStop(0,'#ffcc7e00');glow.addColorStop(.34,`rgba(255,175,83,${halo*.12})`);glow.addColorStop(.58,`rgba(255,156,63,${halo*.06})`);glow.addColorStop(1,'#ffb96500');
    ctx!.fillStyle=glow;ctx!.fillRect(center.x-radius*2,center.y-radius*2,radius*4,radius*4);
   }
   disk('back');
   if(halo>0){
    ctx!.fillStyle=`rgba(4,6,8,${halo*.88})`;ctx!.beginPath();ctx!.arc(center.x,center.y,radius*.94,0,Math.PI*2);ctx!.fill();
    // A diffuse halo gathers before the narrow, white-hot event horizon appears.
    ctx!.strokeStyle=gold(.7,halo*.19);ctx!.lineWidth=8+halo*5;
    ellipse(radius*1.06,radius*1.06,0);ctx!.stroke();
    ring(radius*1.1,radius*1.1,0,halo*.45,1,-1);
   }
   if(horizon>0){
    ctx!.strokeStyle=gold(.62,horizon*.23);ctx!.lineWidth=9;
    ellipse(radius,radius,0);ctx!.stroke();
    ring(radius,radius,0,horizon,3.1,0);
    ring(radius*.955,radius*.955,0,horizon*.6,.8,.8);
    disk('front');
    for(let i=0;i<18;i++){
     const angle=i*2.39996,rx=radius*(1.13+i%3*.055),ry=rx;
     const x=center.x+Math.cos(angle)*rx,y=center.y+Math.sin(angle)*ry;
     ctx!.fillStyle=gold(.35,horizon*(.4+i%3*.2));ctx!.beginPath();ctx!.arc(x,y,i%3===0?1.7:1,0,Math.PI*2);ctx!.fill();
    }
   }
   // Coordinates are measured from the real button and logo, including after resize.
   for(const particle of s.particles){
    const progress=clamp((s.time-particle.born)/particle.duration),t=progress*progress*(1.35-.35*progress);
    const start={x:origin.x+particle.side*particle.seed*68,y:origin.y+particle.seed*6};
    const finish={x:center.x+(particle.seed-.5)*18,y:center.y+(particle.seed-.5)*12};
    const b={x:origin.x+particle.side*(125+particle.seed*90),y:origin.y-(origin.y-center.y)*.26};
    const c={x:center.x+particle.side*(130+particle.seed*100),y:center.y+85};
    const head=point(start,b,c,finish,t),tail=point(start,b,c,finish,Math.max(0,t-.025-.025*progress));
    const opacity=Math.min(1,progress*12)*(1-smooth((progress-.87)/.13))*fade;
    ctx!.globalAlpha=opacity;ctx!.drawImage(sparks[Math.round(smooth(progress)*7)],head.x-9,head.y-9,18,18);ctx!.globalAlpha=1;
    ctx!.strokeStyle=gold(smooth(progress),opacity);ctx!.lineWidth=1+particle.seed*1.5;
    ctx!.beginPath();ctx!.moveTo(tail.x,tail.y);ctx!.lineTo(head.x,head.y);ctx!.stroke();
    ctx!.fillStyle=gold(smooth(progress)*.8,opacity);ctx!.beginPath();ctx!.arc(head.x,head.y,1+particle.seed,0,Math.PI*2);ctx!.fill();
   }
   ctx!.restore();
   return fade>0;
  }
  function tick(now:number){
   frame=0;if(disposed||!active||!focused||document.hidden)return;
   const dt=last?Math.min((now-last)/1000,.1):0;last=now;
   const s=state!;s.time+=dt;
   const done=s.success!==null?s.time-s.success:-1;
   const acceleration=done<0?0:done<.22?smooth(done/.22):1-smooth((done-.65)/1.1);
   s.angle+=dt*(.28+(done<0?0:1.05)+acceleration*4.5);
   const emitting=phase==='working'||phase==='ready'&&run>0&&(s.success===null||done<.4);
   if(emitting){
    s.emit+=dt*(done>=0?85:42);
    while(s.emit>=1&&s.particles.length<100){
     s.emit--;const serial=s.serial++,seed=(serial*.618034)%1;
     s.particles.push({born:s.time,duration:1.2+seed*.65,seed,side:serial%2?1:-1});
    }
   }
   s.particles=s.particles.filter(p=>s.time-p.born<p.duration);
   const moving=draw();
   if(moving&&phase!=='idle')frame=requestAnimationFrame(tick);
  }
  function stop(){cancelAnimationFrame(frame);frame=0;last=0;surface!.dataset.paused='true'}
  function start(){if(disposed||!active||!focused||document.hidden)return;surface!.dataset.paused='false';if(!frame)frame=requestAnimationFrame(tick)}
  const blur=()=>{focused=false;stop()},focus=()=>{focused=true;start()},visibility=()=>{if(document.hidden)stop();else start()};
  const observer=new ResizeObserver(()=>{measure();if(!frame)draw()});observer.observe(host);observer.observe(target);if(button.current)observer.observe(button.current);
  measure();draw();start();
  window.addEventListener('blur',blur);window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visibility);
  return()=>{disposed=true;stop();observer.disconnect();window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visibility)};
 },[game,run,phase,active,launcher,button,emblem]);
 return <canvas ref={canvas} className="game-animation" aria-hidden="true"/>;
}
