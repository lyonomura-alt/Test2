/* global Editor */
window.Renderer = (() => {
  const dash = [4, 40];
  function drawBoundary(ctx, layer, selected) {
    const b = layer.boundary;
    if (!b || b.points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = '#ffe600'; ctx.lineWidth = 3 / layer.scale; ctx.setLineDash(dash.map(x => x / layer.scale));
    ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(b.points[0].x, b.points[0].y);
    for (let i=1;i<b.points.length;i++) {
      const p=b.points[i], prev=b.points[i-1];
      if (b.segments[i-1] === 'curve' && i < b.points.length-1) {
        const n=b.points[i+1]; ctx.quadraticCurveTo(p.x,p.y,(p.x+n.x)/2,(p.y+n.y)/2);
      } else ctx.lineTo(p.x,p.y);
    }
    ctx.stroke(); ctx.setLineDash([]);
    if (selected && Editor.mode === 'boundary') {
      ctx.fillStyle='#ffe600';
      b.points.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,7/layer.scale,0,Math.PI*2);ctx.fill();});
    }
    ctx.restore();
  }
  function drawLayer(ctx, layer, selected) {
    if (!layer.image) return;
    ctx.save(); ctx.translate(layer.x,layer.y); ctx.rotate(layer.rotation); ctx.scale(layer.scale,layer.scale); ctx.globalAlpha=layer.opacity;
    const w=layer.image.naturalWidth,h=layer.image.naturalHeight;
    if (layer.mask) { const tmp=document.createElement('canvas'); tmp.width=w;tmp.height=h; const t=tmp.getContext('2d');t.drawImage(layer.image,0,0);t.globalCompositeOperation='destination-out';t.drawImage(layer.mask,0,0);ctx.drawImage(tmp,-w/2,-h/2); }
    else ctx.drawImage(layer.image,-w/2,-h/2);
    ctx.globalAlpha=1; drawBoundary(ctx,layer,selected);
    if(selected){ctx.strokeStyle='#ffe600';ctx.lineWidth=2/layer.scale;ctx.setLineDash([7/layer.scale,5/layer.scale]);ctx.strokeRect(-w/2,-h/2,w,h);ctx.setLineDash([])}
    ctx.restore();
  }
  function render() {
    const c=Editor.canvas, ctx=c.getContext('2d'), d=devicePixelRatio;
    ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,c.width/d,c.height/d);
    Editor.layers.forEach((l,i)=>drawLayer(ctx,l,i===Editor.selected));
  }
  function exportPNG() {
    const c=Editor.canvas, out=document.createElement('canvas');out.width=c.width;out.height=c.height;
    const o=out.getContext('2d');o.fillStyle='#fff';o.fillRect(0,0,out.width,out.height);o.drawImage(c,0,0);
    const a=document.createElement('a');a.download='two-image-composite.png';a.href=out.toDataURL('image/png');a.click();
  }
  return {render,exportPNG};
})();