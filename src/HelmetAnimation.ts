type Point={x:number;y:number};

// Keep the reference helmet's dense face plate fixed. Its original needle
// silhouette rotates around the same measured logo center on a second layer.
export function paintHelmet(paint:CanvasRenderingContext2D,image:HTMLImageElement,center:Point,radius:number,angle:number,opacity:number){
 if(opacity<=0||!image.complete||!image.naturalWidth)return;
 const width=radius*4.6,height=width*image.naturalHeight/image.naturalWidth;
 const core=radius*.76;
 const draw=()=>paint.drawImage(image,-width/2,-height*.6,width,height);
 paint.save();
 paint.globalAlpha=opacity;
 paint.translate(center.x,center.y);
 paint.save();
 // The face plate is 60% down the cutout. Both layers share this pivot;
 // a small overlap hides the split between static metal and moving needles.
 paint.beginPath();paint.rect(-width,-width,width*2,width*2);
 paint.moveTo(core,0);paint.arc(0,0,core,0,Math.PI*2);paint.clip('evenodd');
 paint.rotate(angle);draw();paint.restore();
 paint.beginPath();paint.arc(0,0,core+2,0,Math.PI*2);paint.clip();draw();
 paint.restore();
}
