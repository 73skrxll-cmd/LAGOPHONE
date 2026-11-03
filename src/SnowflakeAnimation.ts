type Point={x:number;y:number};
type SnowMaterial={crystal:HTMLCanvasElement;particle:HTMLCanvasElement;halo:HTMLCanvasElement};
const TAU=Math.PI*2;
// Rasterise the crystalline branches once; each frame only rotates the sprite.
export function createSnowflakeMaterial():SnowMaterial{
 const crystal=document.createElement('canvas');crystal.width=crystal.height=512;
 const ctx=crystal.getContext('2d')!;ctx.translate(256,256);ctx.lineCap='round';ctx.lineJoin='round';
 const path=new Path2D(),r=112;
 for(let arm=0;arm<6;arm++){
  const a=arm*TAU/6-Math.PI/2,point=(distance:number,side=0)=>({x:Math.cos(a)*distance-Math.sin(a)*side,y:Math.sin(a)*distance+Math.cos(a)*side});
  const line=(u:Point,v:Point)=>{path.moveTo(u.x,u.y);path.lineTo(v.x,v.y)};
  line(point(r*.78),point(r*1.62));
  for(const [distance,length] of [[.98,.22],[1.23,.30],[1.46,.19]])for(const sign of [-1,1]){
   const start=point(r*distance),end=point(r*(distance-length*.5),sign*r*length*.866);line(start,end);
   const branch=point(r*(distance-length*.23),sign*r*length*.4);line(branch,point(r*(distance-length*.48),sign*r*length*.38));
  }
  const tip=point(r*1.62);path.moveTo(tip.x,tip.y);for(let j=1;j<=4;j++){const p=point(r*(1.62+(j===2?-.14:j===4?0:-.07)),j===1?r*.045:j===3?-r*.045:0);path.lineTo(p.x,p.y)}
 }
 path.moveTo(0,-r*.82);for(let i=1;i<=6;i++)path.lineTo(Math.cos(i*TAU/6-Math.PI/2)*r*.82,Math.sin(i*TAU/6-Math.PI/2)*r*.82);
 ctx.shadowColor='#9ac9ed';ctx.shadowBlur=12;ctx.strokeStyle='#8ab6d4';ctx.lineWidth=5;ctx.stroke(path);ctx.shadowBlur=0;
 ctx.strokeStyle='#5d88a9';ctx.lineWidth=3.4;ctx.stroke(path);ctx.strokeStyle='#f1fbff';ctx.lineWidth=1.5;ctx.stroke(path);
 const particle=document.createElement('canvas');particle.width=particle.height=48;const p=particle.getContext('2d')!;p.translate(24,24);p.strokeStyle='#93b7cf';p.lineWidth=2;p.lineCap='round';
 for(let i=0;i<6;i++){p.save();p.rotate(i*TAU/6);p.beginPath();p.moveTo(0,0);p.lineTo(0,-17);p.moveTo(0,-10);p.lineTo(-5,-14);p.moveTo(0,-10);p.lineTo(5,-14);p.strokeStyle='#7198b4';p.lineWidth=2.5;p.stroke();p.strokeStyle='#eaf8ff';p.lineWidth=.9;p.stroke();p.restore()}
 const halo=document.createElement('canvas');halo.width=halo.height=400;const h=halo.getContext('2d')!,glow=h.createRadialGradient(200,200,70,200,200,200);glow.addColorStop(0,'#badff000');glow.addColorStop(.4,'#8bbbd220');glow.addColorStop(.7,'#d2eafb14');glow.addColorStop(1,'#bce5f000');h.fillStyle=glow;h.fillRect(0,0,400,400);
 return {crystal,particle,halo};
}
export function paintSnowflake(paint:CanvasRenderingContext2D,material:SnowMaterial,center:Point,radius:number,time:number,angle:number,formation:number,completed:number){
 if(formation<=0)return;
 paint.save();paint.translate(center.x,center.y);paint.globalAlpha=formation;
 paint.drawImage(material.halo,-radius*2,-radius*2,radius*4,radius*4);
 paint.save();paint.rotate(angle*.22);paint.beginPath();paint.arc(0,0,radius*(.8+.9*Math.min(1,formation)),0,TAU);paint.clip();const size=radius*512/112;paint.drawImage(material.crystal,-size/2,-size/2,size,size);paint.restore();
 for(let i=0;i<6;i++){
  const a=i*TAU/6-Math.PI/2+angle*.22,x=Math.cos(a)*radius*1.62,y=Math.sin(a)*radius*1.62,glint=.35+.5*Math.max(0,Math.sin(time*1.8+i));paint.globalAlpha=formation*glint;paint.strokeStyle='#709cbd';paint.lineWidth=1;paint.beginPath();paint.moveTo(x-3,y);paint.lineTo(x+3,y);paint.moveTo(x,y-3);paint.lineTo(x,y+3);paint.stroke();
 }
 if(completed>=0&&completed<1.1){const t=completed/1.1;paint.globalAlpha=(1-t)*formation;for(let i=0;i<12;i++){const a=i*TAU/12,spread=radius*(.95+t*.8),size=9+5*(i%3);paint.save();paint.translate(Math.cos(a)*spread,Math.sin(a)*spread);paint.rotate(a+t);paint.drawImage(material.particle,-size/2,-size/2,size,size);paint.restore()}}
 // The emblem has its own still centre; only the six crystalline arms rotate.
 paint.globalAlpha=formation;const core=paint.createRadialGradient(-radius*.2,-radius*.23,0,0,0,radius*.73);core.addColorStop(0,'#354c60');core.addColorStop(.72,'#1e3041');core.addColorStop(1,'#4c6a83');paint.fillStyle=core;paint.beginPath();paint.arc(0,0,radius*.73,0,TAU);paint.fill();paint.restore();
}
