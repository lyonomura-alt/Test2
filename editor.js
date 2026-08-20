/* global Renderer */
window.Editor = (() => {
  const canvas = document.querySelector('#stage');
  const panel = document.querySelector('#panel');
  const picker = document.querySelector('#picker');
  const hint = document.querySelector('#hint');
  const addButton = document.querySelector('#add');
  const adjustButton = document.querySelector('#adjust');
  const cutButton = document.querySelector('#cut');
  const undoCutButton = document.querySelector('#undoCut');
  const saveButton = document.querySelector('#save');
  const boundaryButton = document.querySelector('#boundary');
  const boundaryUndoButton = document.querySelector('#boundaryUndo');
  const boundaryDeleteButton = document.querySelector('#boundaryDelete');
  const segmentButton = document.querySelector('#segment');
  const scaleSlider = document.querySelector('#scale');
  const rotationSlider = document.querySelector('#rotation');
  const opacitySlider = document.querySelector('#opacity');
  const scaleOutput = document.querySelector('#scaleOut');
  const rotationOutput = document.querySelector('#rotationOut');
  const opacityOutput = document.querySelector('#opacityOut');
  const lockScaleCheckbox = document.querySelector('#lockScale');
  const lockRotationCheckbox = document.querySelector('#lockRotation');

  const layers = [0, 1].map(() => ({
    image: null, mask: null, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1,
    lockScale: false, lockRotation: false, cuts: [], boundary: null, boundaryHistory: []
  }));

  let selected = null;
  let mode = 'normal';
  let adding = null;
  let pointers = new Map();
  let gesture = null;
  let drag = null;
  let stroke = null;
  let boundaryDrag = null;
  let selectedSegment = 0;
  let lastTap = 0;

  function resize() {
    const d = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * d);
    canvas.height = Math.round(window.innerHeight * d);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    // Editor の代入完了後に描画する。初期化時の停止を防ぐ。
    requestAnimationFrame(() => Renderer.render());
  }
  window.addEventListener('resize', resize);
  resize();

  function currentLayer() { return selected === null ? null : layers[selected]; }
  function say(text) {
    hint.textContent = text;
    hint.classList.remove('hidden');
    clearTimeout(say.timer);
    say.timer = setTimeout(() => hint.classList.add('hidden'), 1800);
  }
  function screenToLocal(layer, x, y) {
    const dx = x - layer.x, dy = y - layer.y;
    const c = Math.cos(-layer.rotation), s = Math.sin(-layer.rotation);
    return { x: (dx * c - dy * s) / layer.scale, y: (dx * s + dy * c) / layer.scale };
  }
  function hit(layer, x, y) {
    if (!layer.image) return false;
    const p = screenToLocal(layer, x, y);
    return Math.abs(p.x) <= layer.image.naturalWidth / 2 && Math.abs(p.y) <= layer.image.naturalHeight / 2;
  }
  function select(index) {
    selected = index;
    mode = 'normal';
    syncControls();
    Renderer.render();
  }
  function syncControls() {
    document.querySelectorAll('[data-layer]').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.layer) === selected);
    });
    const l = currentLayer();
    [scaleSlider, rotationSlider, opacitySlider, lockScaleCheckbox, lockRotationCheckbox].forEach(el => el.disabled = !l);
    if (!l) return;
    scaleSlider.value = Math.round(l.scale * 100);
    rotationSlider.value = Math.round(l.rotation * 180 / Math.PI);
    opacitySlider.value = Math.round(l.opacity * 100);
    lockScaleCheckbox.checked = l.lockScale;
    lockRotationCheckbox.checked = l.lockRotation;
    scaleOutput.value = scaleSlider.value + '%';
    rotationOutput.value = rotationSlider.value + '°';
    opacityOutput.value = opacitySlider.value + '%';
  }
  function updateModeButtons() {
    cutButton.classList.toggle('active', mode === 'cut');
    boundaryButton.classList.toggle('active', mode === 'boundary');
    const b = currentLayer()?.boundary;
    if (b && b.segments.length) {
      const type = b.segments[Math.min(selectedSegment, b.segments.length - 1)];
      segmentButton.textContent = '区間: ' + (type === 'line' ? '直線' : '曲線');
    } else segmentButton.textContent = '区間: 曲線';
  }
  function setMode(next) {
    mode = mode === next ? 'normal' : next;
    updateModeButtons();
    say(mode === 'cut' ? '閉じた線を描くと内側を消去' : mode === 'boundary' ? '境界線を描くか、編集点をドラッグ' : 'モードを解除');
    Renderer.render();
  }
  function saveBoundaryHistory(l) {
    l.boundaryHistory.push(l.boundary ? JSON.parse(JSON.stringify(l.boundary)) : null);
  }
  function simplify(points) {
    return points.filter((p, i) => i === 0 || i === points.length - 1 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 10);
  }
  function distanceToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.y-a.y)*dy) / ((dx*dx + dy*dy) || 1)));
    return Math.hypot(p.x - (a.x + t*dx), p.y - (a.y + t*dy));
  }
  function cutInside(l, points) {
    if (points.length < 3) return;
    const before = l.mask ? l.mask.getContext('2d').getImageData(0, 0, l.mask.width, l.mask.height) : null;
    l.cuts.push(before);
    if (!l.mask) {
      l.mask = document.createElement('canvas');
      l.mask.width = l.image.naturalWidth;
      l.mask.height = l.image.naturalHeight;
    }
    const ctx = l.mask.getContext('2d');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(points[0].x + l.image.naturalWidth / 2, points[0].y + l.image.naturalHeight / 2);
    points.slice(1).forEach(p => ctx.lineTo(p.x + l.image.naturalWidth / 2, p.y + l.image.naturalHeight / 2));
    ctx.closePath();
    ctx.fill();
    mode = 'normal';
    updateModeButtons();
    Renderer.render();
  }
  function undoCut() {
    const l = currentLayer();
    if (!l || !l.cuts.length) return;
    const previous = l.cuts.pop();
    if (!previous) l.mask = null;
    else {
      if (!l.mask) {
        l.mask = document.createElement('canvas');
        l.mask.width = l.image.naturalWidth;
        l.mask.height = l.image.naturalHeight;
      }
      l.mask.getContext('2d').putImageData(previous, 0, 0);
    }
    Renderer.render();
  }

  canvas.addEventListener('pointerdown', event => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const l = currentLayer();
    if (mode === 'cut' && l) {
      stroke = [screenToLocal(l, event.clientX, event.clientY)];
      return;
    }
    if (mode === 'boundary' && l) {
      const p = screenToLocal(l, event.clientX, event.clientY);
      if (l.boundary) {
        const pointIndex = l.boundary.points.findIndex(q => Math.hypot(q.x - p.x, q.y - p.y) < 18 / l.scale);
        if (pointIndex >= 0) {
          saveBoundaryHistory(l);
          boundaryDrag = pointIndex;
          return;
        }
        const segmentIndex = l.boundary.segments.findIndex((_, i) => distanceToSegment(p, l.boundary.points[i], l.boundary.points[i + 1]) < 14 / l.scale);
        if (segmentIndex >= 0) {
          selectedSegment = segmentIndex;
          updateModeButtons();
          Renderer.render();
          return;
        }
      }
      saveBoundaryHistory(l);
      stroke = [p];
      return;
    }
    if (pointers.size === 1) {
      const now = Date.now();
      if (now - lastTap < 280) {
        selected = null;
        lastTap = 0;
        syncControls();
        Renderer.render();
        return;
      }
      lastTap = now;
      let found = null;
      for (let i = layers.length - 1; i >= 0; i--) if (hit(layers[i], event.clientX, event.clientY)) { found = i; break; }
      if (found === null) {
        selected = null;
        syncControls();
        Renderer.render();
        return;
      }
      select(found);
      drag = { x: event.clientX, y: event.clientY, layer: layers[found] };
    } else if (pointers.size === 2 && l) {
      const p = [...pointers.values()];
      gesture = {
        distance: Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y),
        angle: Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x),
        scale: l.scale, rotation: l.rotation
      };
    }
  });

  canvas.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const l = currentLayer();
    if (!l) return;
    if (stroke && mode === 'cut') { stroke.push(screenToLocal(l, event.clientX, event.clientY)); return; }
    if (boundaryDrag !== null) { l.boundary.points[boundaryDrag] = screenToLocal(l, event.clientX, event.clientY); Renderer.render(); return; }
    if (stroke && mode === 'boundary') { stroke.push(screenToLocal(l, event.clientX, event.clientY)); return; }
    if (pointers.size === 1 && drag) {
      l.x += event.clientX - drag.x;
      l.y += event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      Renderer.render();
    } else if (pointers.size === 2 && gesture) {
      const p = [...pointers.values()];
      const distance = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
      const angle = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);
      if (!l.lockScale) l.scale = Math.max(0.1, Math.min(3, gesture.scale * distance / gesture.distance));
      if (!l.lockRotation) l.rotation = gesture.rotation + angle - gesture.angle;
      syncControls();
      Renderer.render();
    }
  });

  canvas.addEventListener('pointerup', event => {
    pointers.delete(event.pointerId);
    const l = currentLayer();
    if (stroke && mode === 'cut') { cutInside(l, stroke); stroke = null; }
    else if (stroke && mode === 'boundary') {
      const points = simplify(stroke);
      if (points.length > 1) {
        l.boundary = { points, segments: Array(points.length - 1).fill('curve') };
        selectedSegment = 0;
      }
      stroke = null;
      mode = 'normal';
      updateModeButtons();
      Renderer.render();
    }
    drag = null;
    boundaryDrag = null;
    gesture = null;
  });
  canvas.addEventListener('pointercancel', () => { pointers.clear(); stroke = null; drag = null; gesture = null; boundaryDrag = null; });

  document.querySelectorAll('[data-layer]').forEach(button => button.onclick = () => select(Number(button.dataset.layer)));
  addButton.onclick = () => { adding = selected === null ? 0 : selected; picker.click(); };
  picker.onchange = event => {
    const file = event.target.files[0];
    if (!file) return;
    const image = new Image();
    image.onload = () => {
      const l = layers[adding];
      l.image = image; l.mask = null; l.cuts = []; l.boundary = null; l.boundaryHistory = [];
      l.x = window.innerWidth / 2; l.y = window.innerHeight / 2;
      l.scale = Math.min(1, Math.min(window.innerWidth * 0.8 / image.naturalWidth, window.innerHeight * 0.7 / image.naturalHeight));
      l.rotation = 0; l.opacity = 1;
      select(adding);
    };
    image.src = URL.createObjectURL(file);
    picker.value = '';
  };
  adjustButton.onclick = () => panel.classList.toggle('panel-open');
  cutButton.onclick = () => currentLayer() ? setMode('cut') : say('先に画像を選択');
  undoCutButton.onclick = undoCut;
  saveButton.onclick = Renderer.exportPNG;
  boundaryButton.onclick = () => currentLayer() ? setMode('boundary') : say('先に画像を選択');
  boundaryUndoButton.onclick = () => { const l = currentLayer(); if (l && l.boundaryHistory.length) { l.boundary = l.boundaryHistory.pop(); Renderer.render(); } };
  boundaryDeleteButton.onclick = () => { const l = currentLayer(); if (l) { saveBoundaryHistory(l); l.boundary = null; Renderer.render(); } };
  segmentButton.onclick = () => {
    const b = currentLayer()?.boundary;
    if (!b || !b.segments.length) return;
    selectedSegment = Math.min(selectedSegment, b.segments.length - 1);
    b.segments[selectedSegment] = b.segments[selectedSegment] === 'curve' ? 'line' : 'curve';
    updateModeButtons();
    Renderer.render();
  };
  scaleSlider.oninput = () => { const l = currentLayer(); if (l) { l.scale = Number(scaleSlider.value) / 100; scaleOutput.value = scaleSlider.value + '%'; Renderer.render(); } };
  rotationSlider.oninput = () => { const l = currentLayer(); if (l) { l.rotation = Number(rotationSlider.value) * Math.PI / 180; rotationOutput.value = rotationSlider.value + '°'; Renderer.render(); } };
  opacitySlider.oninput = () => { const l = currentLayer(); if (l) { l.opacity = Number(opacitySlider.value) / 100; opacityOutput.value = opacitySlider.value + '%'; Renderer.render(); } };
  lockScaleCheckbox.onchange = () => { const l = currentLayer(); if (l) l.lockScale = lockScaleCheckbox.checked; };
  lockRotationCheckbox.onchange = () => { const l = currentLayer(); if (l) l.lockRotation = lockRotationCheckbox.checked; };
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));

  return { canvas, layers, get selected() { return selected; }, get mode() { return mode; } };
})();