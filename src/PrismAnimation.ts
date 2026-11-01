type Point={x:number;y:number};
type PrismMaterial={beam:HTMLCanvasElement;halo:HTMLCanvasElement};

// Build the soft optical material once. Animation only transforms these small
// sprites; there are no cropped moving parts or per-frame blur filters.
export function createPrismMaterial():PrismMaterial{
 const beam=document.createElement('canvas');beam.width=512;beam.height=160;
 const brush=beam.getContext('2d')!;
 const colours=['123,181,255','175,224,255','255,255,255','255,220,187','213,174,255'];
 for(let i=0;i<colours.length;i++){
  const y=80+(i-2)*5,gradient=brush.createLinearGradient(0,0,512,0);
  gradient.addColorStop(0,`rgba(${colours[i]},0)`);gradient.addColorStop(.16,`rgba(${colours[i]},${i===2?.95:.55})`);
  gradient.addColorStop(.55,`rgba(${colours[i]},${i===2?.45:.23})`);gradient.addColorStop(1,`rgba(${colours[i]},0)`);
  brush.fillStyle=gradient;brush.shadowColor=`rgba(${colours[i]},.5)`;brush.shadowBlur=22;
  brush.beginPath();brush.moveTo(0,y);brush.bezierCurveTo(90,y-34,210,y-18,512,y);brush.bezierCurveTo(210,y+18,90,y+34,0,y);brush.fill();
 }
 brush.shadowBlur=0;
 brush.filter='blur(3px)';
 for(let i=0;i<7;i++){
  const y=80+(i-3)*6,gradient=brush.createLinearGradient(20,0,410,0);
  gradient.addColorStop(0,'#ffffff00');gradient.addColorStop(.17,'#ffffffcc');gradient.addColorStop(.42,'#ffffff44');gradient.addColorStop(1,'#ffffff00');
  brush.fillStyle=gradient;brush.beginPath();brush.ellipse(145,y,135,5,0,0,Math.PI*2);brush.fill();
 }
 const halo=document.createElement('canvas');halo.width=halo.height=400;
 const paint=halo.getContext('2d')!,glow=paint.createRadialGradient(200,200,40,200,200,200);
 glow.addColorStop(0,'#1c294a00');glow.addColorStop(.32,'#25375c1f');glow.addColorStop(.5,'#93bce82a');glow.addColorStop(.67,'#c7ade516');glow.addColorStop(1,'#c5dfff00');
 paint.fillStyle=glow;paint.fillRect(0,0,400,400);
 return {beam,halo};
}

export function paintPrism(paint:CanvasRenderingContext2D,material:PrismMaterial,center:Point,radius:number,time:number,angle:number,formation:number,completed:number){
 if(formation<=0)return;
 const bloom=completed<0?0:Math.sin(Math.min(1,completed/1.2)*Math.PI),rotation=angle*.2;
 paint.save();paint.translate(center.x,center.y);paint.globalAlpha=formation;
 paint.drawImage(material.halo,-radius*2.05,-radius*2.05,radius*4.1,radius*4.1);
 // A continuous refractive ring joins all the light streaks around the logo.
 for(let i=0;i<96;i++){
  const a=i*Math.PI/48,hue=(i*360/96+time*9)%360;
  paint.strokeStyle=`hsla(${hue},65%,77%,.38)`;paint.lineWidth=radius*.075;
  paint.beginPath();paint.arc(0,0,radius*.87,a,a+Math.PI/48+.004);paint.stroke();
 }
 for(let i=0;i<30;i++){
  const principal=i%5===0,a=rotation+i*Math.PI/15;
  const shimmer=.82+.18*Math.sin(time*.75+i*1.9);
  const length=radius*(principal?1.25+bloom*.08:.64+(i%4)*.11),height=radius*(principal?.68+bloom*.15:.29);
  paint.save();paint.rotate(a);paint.globalAlpha=formation*shimmer*(principal?.9:.5);
  paint.drawImage(material.beam,radius*.66,-height/2,length,height);paint.restore();
 }
 // The centre is still and opaque so the game logo remains crisp throughout
 // the rotating diffraction pattern, including on a light page.
 paint.globalAlpha=formation;
 const core=paint.createRadialGradient(-radius*.2,-radius*.23,0,0,0,radius*.73);
 core.addColorStop(0,'#354354');core.addColorStop(.65,'#202c3b');core.addColorStop(.92,'#25364a');core.addColorStop(1,'#637b96');
 paint.fillStyle=core;paint.beginPath();paint.arc(0,0,radius*.73,0,Math.PI*2);paint.fill();
 paint.strokeStyle='#deefffa0';paint.lineWidth=1;
 paint.beginPath();paint.arc(0,0,radius*.745,Math.PI*1.05,Math.PI*1.65);paint.stroke();
 paint.restore();
}
