/* global Renderer */
window.Editor = (() => {
  const $ = selector => document.querySelector(selector);
  const canvas = $('#stage'), panel = $('#panel'), picker = $('#picker'), hint = $('#hint');
  const addButton = $('#add'), adjustButton = $('#adjust'), cutButton = $('#cut'), undoCutButton = $('#undoCut'), saveButton = $('#save');
  const boundaryButton = $('#boundary'), boundaryUndoButton = $('#boundaryUndo'), boundaryDeleteButton = $('#boundaryDelete'), segmentButton = $('#segment');
  const scaleSlider = $('#scale'), rotationSlider = $('#rotation'), opacitySlider = $('#opacity');
  const scaleOutput = $('#scaleOut'), rotationOutput = $('#rotationOut'), opacityOutput = $('#opacityOut');
  const lockScaleCheckbox = $('#lockScale'), lockRotationCheckbox = $('#lockRotation');
  const layers = [0, 1].map(() => ({ image:null, mask:null, x:0, y:0, scale:1, rotation:0, opacity:1, lockScale:false, lockRotation:false, cuts:[], boundary:null, boundaryHistory:[] }));
  let selected = null, mode = 'normal', adding = 0, drag = null, gesture = null, stroke = null, boundaryDrag = null, selectedSegment = 0, lastTap = 0;
  const pointers = new Map();

  function render() { Renderer.render(); }
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    requestAnimationFrame(render);
  }
  function current() { return selected === null ? null : layers[selected]; }
  function message(text) {
    hint.textContent = text; hint.classList.remove('hidden');
    clearTimeout(message.timer); message.timer = setTimeout(() => hint.classList.add('hidden'), 1800);
  }
  function local(layer, x, y) {
    const dx=x-layer.x, dy=y-layer.y, c=Math.cos(-layer.rotation), s=Math.sin(-layer.rotation);
    return { x:(dx*c-dy*s)/layer.scale, y:(dx*s+dy*c)/layer.scale };
  }
  function contains(layer, x, y) {
    if (!layer.image) return false;
    const p=local(layer,x,y);
    return Math.abs(p.x)<=layer.image.naturalWidth/2 && Math.abs(p.y)<=layer.image.naturalHeight/2;
  }
  function sync() {
    document.querySelectorAll('[data-layer]').forEach(button => button.classList.toggle('active', Number(button.dataset.layer)===selected));
    const l=current();
    [scaleSlider,rotationSlider,opacitySlider,lockScaleCheckbox,lockRotationCheckbox].forEach(el => el.disabled=!l);
    if (!l) return;
    scaleSlider.value=Math.round(l.scale*100); rotationSlider.value=Math.round(l.rotation*180/Math.PI); opacitySlider.value=Math.round(l.opacity*100);
    scaleOutput.value=scaleSlider.value+'%'; rotationOutput.value=rotationSlider.value+'°'; opacityOutput.value=opacitySlider.value+'%';
    lockScaleCheckbox.checked=l.lockScale; lockRotationCheckbox.checked=l.lockRotation;
  }
  function select(index) { selected=index; mode='normal'; updateMode(); sync(); render(); }
  function updateMode() {
    cutButton.classList.toggle('active',mode==='cut'); boundaryButton.classList.toggle('active',mode==='boundary');
    const b=current()?.boundary;
    if (b?.segments.length) segmentButton.textContent='区間: '+(b.segments[Math.min(selectedSegment,b.segments.length-1)]==='line'?'直線':'曲線');
  }
  function setMode(next) { mode=mode===next?'normal':next; updateMode(); render(); }
  function saveBoundary(l) { l.boundaryHistory.push(l.boundary?JSON.parse(JSON.stringify(l.boundary)):null); }
  function simplify(points) { return points.filter((p,i)=>i===0||i===points.length-1||Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y)>10); }
  function cut(l, points) {
    if (points.length<3) return;
    l.cuts.push(l.mask ? l.mask.getContext('2d').getImageData(0,0,l.mask.width,l.mask.height) : null);
    if (!l.mask) { l.mask=document.createElement('canvas'); l.mask.width=l.image.naturalWidth; l.mask.height=l.image.naturalHeight; }
    const c=l.mask.getContext('2d'), w=l.image.naturalWidth/2, h=l.image.naturalHeight/2;
    c.fillStyle='#000'; c.beginPath(); c.moveTo(points[0].x+w,points[0].y+h); points.slice(1).forEach(p=>c.lineTo(p.x+w,p.y+h)); c.closePath(); c.fill();
    mode='normal'; updateMode(); render();
  }
  function undoCut() {
    const l=current(); if (!l?.cuts.length) return;
    const previous=l.cuts.pop();
    if (!previous) l.mask=null;
    else { if (!l.mask) { l.mask=document.createElement('canvas'); l.mask.width=l.image.naturalWidth; l.mask.height=l.image.naturalHeight; } l.mask.getContext('2d').putImageData(previous,0,0); }
    render();
  }
  function endPointer(event) {
    pointers.delete(event.pointerId); const l=current();
    if (stroke && mode==='cut') { cut(l,stroke); stroke=null; }
    else if (stroke && mode==='boundary') { const points=simplify(stroke); if(points.length>1) l.boundary={points,segments:Array(points.length-1).fill('curve')}; stroke=null; mode='normal'; updateMode(); render(); }
    drag=null; gesture=null; boundaryDrag=null;
  }

  canvas.addEventListener('pointerdown', event => {
    event.preventDefault(); canvas.setPointerCapture(event.pointerId); pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const l=current();
    if (mode==='cut' && l) { stroke=[local(l,event.clientX,event.clientY)]; return; }
    if (mode==='boundary' && l) {
      const p=local(l,event.clientX,event.clientY), b=l.boundary;
      if (b) { const i=b.points.findIndex(q=>Math.hypot(q.x-p.x,q.y-p.y)<18/l.scale); if(i>=0){saveBoundary(l);boundaryDrag=i;return;} }
      saveBoundary(l); stroke=[p]; return;
    }
    if (pointers.size===1) {
      const now=Date.now(); if(now-lastTap<280){selected=null;lastTap=0;sync();render();return;} lastTap=now;
      let found=null; for(let i=layers.length-1;i>=0;i--) if(contains(layers[i],event.clientX,event.clientY)){found=i;break;}
      if(found===null){selected=null;sync();render();return;} select(found); drag={x:event.clientX,y:event.clientY};
    } else if (pointers.size===2 && l) { const p=[...pointers.values()]; gesture={distance:Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y),angle:Math.atan2(p[1].y-p[0].y,p[1].x-p[0].x),scale:l.scale,rotation:l.rotation}; }
  },{passive:false});
  canvas.addEventListener('pointermove', event => {
    if(!pointers.has(event.pointerId)) return; event.preventDefault(); pointers.set(event.pointerId,{x:event.clientX,y:event.clientY}); const l=current(); if(!l)return;
    if(stroke && mode==='cut'){stroke.push(local(l,event.clientX,event.clientY));return;}
    if(boundaryDrag!==null){l.boundary.points[boundaryDrag]=local(l,event.clientX,event.clientY);render();return;}
    if(stroke && mode==='boundary'){stroke.push(local(l,event.clientX,event.clientY));return;}
    if(pointers.size===1 && drag){l.x+=event.clientX-drag.x;l.y+=event.clientY-drag.y;drag.x=event.clientX;drag.y=event.clientY;render();}
    else if(pointers.size===2 && gesture){const p=[...pointers.values()],distance=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y),angle=Math.atan2(p[1].y-p[0].y,p[1].x-p[0].x);if(!l.lockScale)l.scale=Math.max(.1,Math.min(3,gesture.scale*distance/gesture.distance));if(!l.lockRotation)l.rotation=gesture.rotation+angle-gesture.angle;sync();render();}
  },{passive:false});
  canvas.addEventListener('pointerup',endPointer); canvas.addEventListener('pointercancel',endPointer);

  document.querySelectorAll('[data-layer]').forEach(button=>button.addEventListener('click',()=>select(Number(button.dataset.layer))));
  addButton.addEventListener('click',()=>{adding=selected===null?0:selected;picker.click();});
  picker.addEventListener('change',event=>{const file=event.target.files[0];if(!file)return;const image=new Image();image.onload=()=>{const l=layers[adding];Object.assign(l,{image,mask:null,cuts:[],boundary:null,boundaryHistory:[],x:innerWidth/2,y:innerHeight/2,scale:Math.min(1,Math.min(innerWidth*.8/image.naturalWidth,innerHeight*.7/image.naturalHeight)),rotation:0,opacity:1});select(adding);URL.revokeObjectURL(image.src);};image.src=URL.createObjectURL(file);picker.value='';});
  adjustButton.addEventListener('click',()=>panel.classList.toggle('panel-open'));
  cutButton.addEventListener('click',()=>current()?setMode('cut'):message('先に画像を選択'));
  undoCutButton.addEventListener('click',undoCut); saveButton.addEventListener('click',Renderer.exportPNG);
  boundaryButton.addEventListener('click',()=>current()?setMode('boundary'):message('先に画像を選択'));
  boundaryUndoButton.addEventListener('click',()=>{const l=current();if(l?.boundaryHistory.length){l.boundary=l.boundaryHistory.pop();render();}});
  boundaryDeleteButton.addEventListener('click',()=>{const l=current();if(l){saveBoundary(l);l.boundary=null;render();}});
  segmentButton.addEventListener('click',()=>{const b=current()?.boundary;if(!b?.segments.length)return;selectedSegment=Math.min(selectedSegment,b.segments.length-1);b.segments[selectedSegment]=b.segments[selectedSegment]==='curve'?'line':'curve';updateMode();render();});
  scaleSlider.addEventListener('input',()=>{const l=current();if(l){l.scale=Number(scaleSlider.value)/100;scaleOutput.value=scaleSlider.value+'%';render();}});
  rotationSlider.addEventListener('input',()=>{const l=current();if(l){l.rotation=Number(rotationSlider.value)*Math.PI/180;rotationOutput.value=rotationSlider.value+'°';render();}});
  opacitySlider.addEventListener('input',()=>{const l=current();if(l){l.opacity=Number(opacitySlider.value)/100;opacityOutput.value=opacitySlider.value+'%';render();}});
  lockScaleCheckbox.addEventListener('change',()=>{if(current())current().lockScale=lockScaleCheckbox.checked;});
  lockRotationCheckbox.addEventListener('change',()=>{if(current())current().lockRotation=lockRotationCheckbox.checked;});
  window.addEventListener('resize',resize); resize();
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
  return {canvas,layers,get selected(){return selected;},get mode(){return mode;}};
})();