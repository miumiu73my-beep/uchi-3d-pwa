import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { initReprojection } from './reprojection.js';

const OWNER = 'miumiu73my-beep';
const REPO = 'uchi-no-ko-3d-test';
const BRANCH = 'main';
const MODEL_PATH = 'pipeline/generated/model.py';
const EDIT_URL = 'https://github.com/' + OWNER + '/' + REPO + '/edit/' + BRANCH + '/' + MODEL_PATH;

const el = (id) => document.getElementById(id);
let previewUrls = [];

function notify(message, kind = '') {
  const label = el('build-status');
  label.textContent = message;
  label.className = 'status' + (kind ? ' ' + kind : '');
}
function connectionStatus() {
  const on = navigator.onLine;
  el('connection').textContent = on ? 'オンライン' : 'オフライン';
  el('connection').className = 'network-status' + (on ? '' : ' warning');
}
window.addEventListener('online', connectionStatus);
window.addEventListener('offline', connectionStatus);
connectionStatus();
initReprojection();

registerSW({
  onNeedRefresh() {
    notify('新しいアプリ版があります。画面を再読み込みして反映してください。');
  },
  onOfflineReady() {
    el('source-review').textContent = 'オフライン用ファイルを保存しました。GitHub操作はオンラインで行ってください。';
  }
});

function checkPython(value) {
  if (!value.trim()) return 'Pythonが未入力です。';
  if (!/^\s*def\s+build_model\s*\(/m.test(value)) {
    return 'build_model() 関数が見つかりません。Gemmaの出力全文を確認してください。';
  }
  const blocked = [
    /\b(?:os\.system|subprocess\.|requests\.|urllib\.request|socket\.|eval\(|exec\(|__import__\(|sys\.exit\(|quit_blender\()/,
    /\b(?:shutil\.rmtree|os\.remove|os\.unlink)\s*\(/
  ];
  if (blocked.some((pattern) => pattern.test(value))) {
    return '実行・通信・削除の可能性がある命令を検出しました。GitHubへ送る前にコードを確認してください。';
  }
  return '';
}
function inspectSource() {
  const issue = checkPython(el('python-source').value);
  const place = el('source-review');
  place.textContent = issue || 'build_model() を確認しました。実行前にコード全体を確認してください。';
  place.className = 'notice' + (issue ? ' warning' : '');
}
el('python-source').addEventListener('input', inspectSource);
el('source-file').addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (file.size > 900000) {
    el('source-name').textContent = '900KB以下のPythonを選択してください。';
    return;
  }
  el('source-name').textContent = file.name + '（' + Math.round(file.size / 1024) + 'KB）';
  try {
    el('python-source').value = await file.text();
    inspectSource();
  } catch {
    el('source-review').textContent = 'ファイルを読み込めませんでした。';
  }
});
inspectSource();

el('copy-button').addEventListener('click', async () => {
  const source = el('python-source').value;
  const issue = checkPython(source);
  if (issue) {
    notify(issue, 'warning');
    return;
  }
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(source);
    notify('Python全文をコピーしました。次に「GitHubの編集画面を開く」を押してください。', 'success');
  } catch {
    const input = el('python-source');
    input.focus();
    input.select();
    notify('自動コピーできませんでした。Pythonを選択したので、iPadの「コピー」でコピーしてから進んでください。', 'warning');
  }
});

el('edit-button').addEventListener('click', () => {
  const issue = checkPython(el('python-source').value);
  if (issue) {
    notify(issue, 'warning');
    return;
  }
  if (!navigator.onLine) {
    notify('GitHub編集画面を開くにはネット接続が必要です。', 'warning');
    return;
  }
  notify('GitHubの編集画面を開きます。既存コードをすべて置き換え、mainブランチへ「Commit changes」で保存してください。保存後Blenderが自動起動します。');
  const link = document.createElement('a');
  link.href = EDIT_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
});

el('preview-files').addEventListener('change', (event) => {
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls = [];
  const gallery = el('gallery');
  gallery.replaceChildren();
  const files = [...(event.target.files || [])].filter((file) => file.type === 'image/png' && file.size < 15000000);
  if (!files.length) {
    const label = document.createElement('p');
    label.className = 'help';
    label.textContent = 'PNGがありません。Artifactsから出力ファイルを選択してください。';
    gallery.appendChild(label);
    return;
  }
  files.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  for (const file of files) {
    const url = URL.createObjectURL(file);
    previewUrls.push(url);
    const figure = document.createElement('figure');
    figure.className = 'preview';
    const img = document.createElement('img');
    img.src = url;
    img.alt = file.name;
    img.loading = 'lazy';
    const caption = document.createElement('figcaption');
    caption.textContent = file.name;
    figure.append(img, caption);
    gallery.appendChild(figure);
  }
});
