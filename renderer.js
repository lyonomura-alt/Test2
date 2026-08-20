/* global Editor */
window.Renderer = (() => {
  const dash = [4, 40];

  function drawBoundary(ctx, layer, showPoints) {
    const boundary = layer.boundary;
    if (!boundary || boundary.points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = '#ffe600';
    ctx.lineWidth = 3 / layer.scale;
    ctx.lineCap = 'butt';
    ctx.setLineDash(dash.map(value => value / layer.scale));
    ctx.beginPath();
    ctx.moveTo(boundary.points[0].x, boundary.points[0].y);

    for (let i = 1; i < boundary.points.length; i++) {
      const point = boundary.points[i];
      const previous = boundary.points[i - 1];
      if (boundary.segments[i - 1] === 'curve' && i < boundary.points.length - 1) {
        const next = boundary.points[i + 1];
        ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    if (showPoints && Editor.mode === 'boundary') {
      ctx.fillStyle = '#ffe600';
      boundary.points.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 7 / layer.scale, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  function drawLayer(ctx, layer, isSelected) {
    if (!layer.image) return;
    const width = layer.image.naturalWidth;
    const height = layer.image.naturalHeight;

    ctx.save();
    ctx.translate(layer.x, layer.y);
    ctx.rotate(layer.rotation);
    ctx.scale(layer.scale, layer.scale);
    ctx.globalAlpha = layer.opacity;

    if (layer.mask) {
      const temporary = document.createElement('canvas');
      temporary.width = width;
      temporary.height = height;
      const tempCtx = temporary.getContext('2d');
      tempCtx.drawImage(layer.image, 0, 0);
      tempCtx.globalCompositeOperation = 'destination-out';
      tempCtx.drawImage(layer.mask, 0, 0);
      ctx.drawImage(temporary, -width / 2, -height / 2);
    } else {
      ctx.drawImage(layer.image, -width / 2, -height / 2);
    }

    ctx.globalAlpha = 1;
    drawBoundary(ctx, layer, isSelected);

    if (isSelected) {
      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = 2 / layer.scale;
      ctx.setLineDash([7 / layer.scale, 5 / layer.scale]);
      ctx.strokeRect(-width / 2, -height / 2, width, height);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function render() {
    // 初期化途中・読み込み失敗時に例外で操作全体が止まらないよう防御する。
    if (!window.Editor || !Editor.canvas || !Editor.layers) return;
    const canvas = Editor.canvas;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    Editor.layers.forEach((layer, index) => drawLayer(ctx, layer, index === Editor.selected));
  }

  function exportPNG() {
    if (!window.Editor || !Editor.canvas) return;
    const source = Editor.canvas;
    const output = document.createElement('canvas');
    output.width = source.width;
    output.height = source.height;
    const ctx = output.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.drawImage(source, 0, 0);
    const link = document.createElement('a');
    link.download = 'two-image-composite.png';
    link.href = output.toDataURL('image/png');
    link.click();
  }

  return { render, exportPNG };
})();