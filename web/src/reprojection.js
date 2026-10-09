// Image/UV verification is local-only. It NEVER infers or changes coordinates.
const $ = (id) => document.getElementById(id);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_JSON_BYTES = 3 * 1024 * 1024;
const MAX_PIXELS = 25_000_000;
const COLORS = Object.freeze({
  face: '#ff5638', hair: '#9d4bd7', body: '#21a9a9',
  clothes: '#147ce4', species_feature: '#47a438',
  accessory: '#e4a500', surface_pattern: '#8c5638'
});
const GEOMETRY = new Set(['point', 'polyline', 'closed_polyline', 'polygon']);
const state = { picture: null, fileName: '', json: null, imageName: '', errors: [], warnings: [], metrics: null };

function setMessage(message, type = '') {
  const target = $('reproject-status');
  target.textContent = message;
  target.className = 'status' + (type ? ' ' + type : '');
}
function validUV(uv) {
  return Array.isArray(uv) && uv.length === 2
    && uv.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1000);
}
function project(uv, W, H) {
  return { x: uv[0] * W / 1000, y: uv[1] * H / 1000 };
}
function validate(json, W, H) {
  const errors = [];
  const warnings = [];
  const data = { landmarks: [], features: [], pointCount: 0, skipped: 0 };
  if (!json || Array.isArray(json) || typeof json !== 'object') {
    return { errors: ['JSONの最上位はオブジェクトである必要があります。'], warnings, data };
  }
  if (json.schema_version !== '2.0') errors.push('schema_version は "2.0" である必要があります。');
  if (!['front', 'side', 'back'].includes(json.view)) errors.push('view は front / side / back にしてください。');
  if (json.coordinate_system !== 'image_uv_1000') errors.push('coordinate_system は image_uv_1000 にしてください。');
  const sz = json.image_size_px;
  if (sz === null) {
    warnings.push('image_size_px が null です。画像全体への相対UVとして仮表示しますが、原画との対応・測定精度は未保証です。');
  } else if (!Array.isArray(sz) || sz.length !== 2 || !sz.every(Number.isInteger) || sz[0] <= 0 || sz[1] <= 0) {
    errors.push('image_size_px は [幅, 高さ] または null にしてください。');
  } else if (sz[0] !== W || sz[1] !== H) {
    errors.push('JSON記載の画像サイズ ' + sz[0] + '×' + sz[1] + ' と読み込んだ原画 ' + W + '×' + H + ' が一致しません。同じ視点の同じ切り出し画像を選んでください。');
  }
  if (!json.landmarks || Array.isArray(json.landmarks) || typeof json.landmarks !== 'object') {
    errors.push('landmarks はオブジェクトである必要があります。');
  } else {
    for (const [name, item] of Object.entries(json.landmarks)) {
      if (!item || typeof item !== 'object') {
        errors.push('landmarks.' + name + ' は無効です。');
        continue;
      }
      if (item.uv === null) { data.skipped++; continue; }
      if (!validUV(item.uv)) {
        errors.push('landmarks.' + name + ' のUVは [0〜1000, 0〜1000] で指定してください。');
        continue;
      }
      if (item.status === 'occluded') { data.skipped++; continue; }
      data.landmarks.push({ id: name, uv: item.uv, estimated: item.status !== 'observed' });
      data.pointCount++;
    }
  }
  if (!Array.isArray(json.features)) {
    errors.push('features は配列である必要があります。');
  } else {
    json.features.forEach((feature, i) => {
      if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
        errors.push('features[' + i + '] がオブジェクトではありません。');
        return;
      }
      if (!GEOMETRY.has(feature.geometry)) {
        errors.push('features[' + i + '] のgeometryが不正です。');
        return;
      }
      if (!Array.isArray(feature.points_uv) || feature.points_uv.length === 0) {
        errors.push('features[' + i + '] のpoints_uvが空または不正です。');
        return;
      }
      if (!feature.points_uv.every(validUV)) {
        errors.push('features[' + i + '] にUV範囲外・不正な点があります。');
        return;
      }
      if (feature.visibility === 'inferred') {
        data.skipped += feature.points_uv.length;
        warnings.push('推定されたfeature「' + String(feature.id || i) + '」は重ね描画から除外しました。');
        return;
      }
      const estimated = feature.visibility === 'partially_occluded';
      data.features.push({
        id: String(feature.id || 'feature_' + i).slice(0, 80),
        category: String(feature.category || ''),
        geometry: feature.geometry,
        points: feature.points_uv,
        estimated
      });
      data.pointCount += feature.points_uv.length;
    });
  }
  if (!Array.isArray(json.needs_review) || !json.needs_review.every((x) => typeof x === 'string')) {
    errors.push('needs_review は文字列配列である必要があります。');
  } else if (json.needs_review.length) {
    warnings.push('JSON内に未確認事項が' + json.needs_review.length + '件あります。');
  }
  if (!data.pointCount) errors.push('描画可能なUV点がありません。');
  return { errors, warnings, data };
}
function lineColor(feature) {
  if (feature.id.toLowerCase().includes('shell')) return '#85532c';
  return COLORS[feature.category] || '#f25898';
}
function drawDot(ctx, x, y, color, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, r / 3);
  ctx.stroke();
}
function drawText(ctx, str, x, y, size) {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#202020';
  ctx.lineWidth = Math.max(2, size / 3);
  ctx.lineJoin = 'round';
  ctx.font = '600 ' + size + 'px sans-serif';
  ctx.strokeText(str, x, y);
  ctx.fillText(str, x, y);
  ctx.restore();
}
function paint(image, json) {
  const W = image.naturalWidth;
  const H = image.naturalHeight;
  if (!W || !H || W * H > MAX_PIXELS) throw new Error('画像が大きすぎます（2500万ピクセル以下にしてください）。');
  const result = validate(json, W, H);
  state.errors = result.errors;
  state.warnings = result.warnings;
  const summary = '原画: ' + W + '×' + H + 'px / VIEW: ' + String(json?.view ?? '?')
    + ' / ランドマーク: ' + result.data.landmarks.length + ' / パーツ: '
    + result.data.features.length + ' / 表示する座標点: ' + result.data.pointCount + '点。';
  $('reproject-report').textContent = summary + '\n'
    + (result.errors.length ? 'エラー: ' + result.errors.join(' / ') + '\n' : '')
    + (result.warnings.length ? '注意: ' + result.warnings.join(' / ') + '\n' : '')
    + (Array.isArray(json.needs_review) ? '未確認: ' + json.needs_review.join(' / ') : '');
  $('reproject-report').hidden = false;
  if (result.errors.length) {
    $('reproject-preview-wrap').hidden = true;
    $('reproject-download').disabled = true;
    setMessage('検証を停止しました。エラーを確認してください。', 'error');
    return;
  }
  const canvas = $('reproject-canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvasを使用できません。');
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(image, 0, 0, W, H);
  const r = Math.max(2.5, Math.min(5, W / 240));
  const strokeWidth = Math.max(1.7, Math.min(3.8, W / 330));
  const fontSize = Math.max(10, Math.min(16, W / 75));
  const labels = $('reproject-labels').checked;
  const showLandmarks = $('reproject-landmarks').checked;

  for (const feature of result.data.features) {
    const pts = feature.points.map((uv) => project(uv, W, H));
    const col = lineColor(feature);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (feature.geometry === 'point') {
      drawDot(ctx, pts[0].x, pts[0].y, col, r);
    } else {
      pts.slice(1).forEach((pt) => ctx.lineTo(pt.x, pt.y));
      if (feature.geometry === 'closed_polyline' || feature.geometry === 'polygon') ctx.closePath();
      if (feature.geometry === 'polygon') {
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.12;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = strokeWidth;
      ctx.setLineDash(feature.estimated ? [strokeWidth * 3, strokeWidth * 2] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const pt of pts) drawDot(ctx, pt.x, pt.y, col, r * 0.6);
    }
    if (labels) drawText(ctx, feature.id, pts[0].x + r + 3, pts[0].y - r - 2, fontSize);
  }
  if (showLandmarks) {
    for (const p of result.data.landmarks) {
      const pt = project(p.uv, W, H);
      drawDot(ctx, pt.x, pt.y, p.estimated ? '#fbad47' : '#f52222', r + 0.8);
      if (labels) drawText(ctx, p.id, pt.x + r + 4, pt.y + r + 4, fontSize);
    }
  }
  $('reproject-preview-wrap').hidden = false;
  $('reproject-download').disabled = false;
  setMessage((json.image_size_px === null ? '仮表示：' : '再投影：')
    + summary + (json.image_size_px === null ? ' 座標と原画の一致は未確認です。' : ' 元絵と線の一致を目視で確認してください。'),
    json.image_size_px === null ? 'warning' : 'success');
}
async function fileImage(file) {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('画像は20MB以下を選択してください。');
  if (!file.type.startsWith('image/')) throw new Error('画像形式のファイルを選んでください。');
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('画像を読み込めません。'));
      img.src = url;
    });
    return img;
  } finally {
    // An already-loaded Image keeps the decoded pixels; the URL is no longer needed.
    URL.revokeObjectURL(url);
  }
}
async function preview() {
  if (!state.picture || !state.json) {
    $('reproject-download').disabled = true;
    $('reproject-preview-wrap').hidden = true;
    setMessage('加工前の原画と、その画像に対応するJSONを1つずつ選んでください。');
    return;
  }
  try {
    paint(state.picture, state.json);
  } catch (error) {
    $('reproject-download').disabled = true;
    $('reproject-preview-wrap').hidden = true;
    setMessage('再投影に失敗しました: ' + error.message, 'error');
  }
}
export function initReprojection() {
  $('reproject-image').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    state.picture = null;
    state.imageName = file?.name || '';
    if (!file) return preview();
    setMessage('原画を読み込み中…');
    try {
      state.picture = await fileImage(file);
      preview();
    } catch (error) { setMessage(error.message, 'error'); }
  });
  $('reproject-json').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    state.json = null;
    state.fileName = file?.name || '';
    if (!file) return preview();
    try {
      if (file.size > MAX_JSON_BYTES) throw new Error('JSONは3MB以下にしてください。');
      const json = JSON.parse(await file.text());
      state.json = json;
      preview();
    } catch (error) { setMessage('JSONの読み取りに失敗しました: ' + error.message, 'error'); }
  });
  $('reproject-landmarks').addEventListener('change', preview);
  $('reproject-labels').addEventListener('change', preview);
  $('reproject-download').addEventListener('click', () => {
    const canvas = $('reproject-canvas');
    if ($('reproject-download').disabled || !canvas.width) return;
    canvas.toBlob((blob) => {
      if (!blob) { setMessage('PNGを作成できませんでした。', 'error'); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const view = ['front', 'side', 'back'].includes(state.json?.view) ? state.json.view : 'view';
      link.download = 'overlay_' + view + '.png';
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    }, 'image/png');
  });
}
