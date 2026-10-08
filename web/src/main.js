import './style.css';
import { registerSW } from 'virtual:pwa-register';

const OWNER = 'miumiu73my-beep';
const REPO = 'uchi-no-ko-3d-test';
const BRANCH = 'main';
const MODEL_PATH = 'pipeline/generated/model.py';
const WORKFLOW = 'build-model.yml';
const API = 'https://api.github.com/repos/' + OWNER + '/' + REPO;
const RUN_PAGE = 'https://github.com/' + OWNER + '/' + REPO + '/actions/runs/';

const el = (id) => document.getElementById(id);
let expectedCommit = '';
let latestRunId = null;
let checking = false;
let timer = null;
let previewUrls = [];
let currentSource = '';

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

registerSW({
  onNeedRefresh() {
    notify('新しいアプリ版があります。画面を再読み込みして反映してください。');
  },
  onOfflineReady() {
    el('source-review').textContent = 'オフライン用ファイルを保存しました。GitHub操作はオンラインで行ってください。';
  }
});

function accessToken() {
  return el('github-token').value.trim();
}
async function github(path, token, options = {}) {
  if (!navigator.onLine) throw new Error('オフラインです。通信できる状態でお試しください。');
  if (!token) throw new Error('GitHubの限定権限トークンを入力してください。');
  const response = await fetch(API + path, {
    method: options.method || 'GET',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store'
  });
  if (response.status === 204) return null;
  let value = null;
  try { value = await response.json(); } catch { /* Some errors are not JSON. */ }
  if (!response.ok) {
    const apiMessage = value && value.message ? value.message : 'HTTP ' + response.status;
    throw new Error('GitHub API（' + response.status + '）: ' + apiMessage);
  }
  return value;
}
function base64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
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
  currentSource = el('python-source').value;
  const issue = checkPython(currentSource);
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

function showLink(runId) {
  const link = el('run-link');
  link.hidden = false;
  link.href = RUN_PAGE + runId;
  link.textContent = 'GitHubで実行 #' + runId + ' とArtifactsを開く ↗';
}
function stopTimer() {
  if (timer) window.clearInterval(timer);
  timer = null;
}
function formatStatus(run) {
  if (run.status !== 'completed') {
    return 'Blender実行中：' + (run.status || '準備中') + '。この画面を開いたままお待ちください。';
  }
  return run.conclusion === 'success'
    ? 'Blenderの処理が完了しました。Artifactsを確認しています。'
    : 'Blender実行に失敗しました（' + (run.conclusion || 'unknown') + '）。GitHubのログを確認してください。';
}
async function getLatestRun(commit = '') {
  const list = await github('/actions/workflows/' + WORKFLOW + '/runs?event=workflow_dispatch&branch=' + BRANCH + '&per_page=30', accessToken());
  const runs = (list && list.workflow_runs) || [];
  return commit ? runs.find((run) => run.head_sha === commit) : runs[0];
}
async function poll() {
  if (checking) return;
  checking = true;
  try {
    const run = await getLatestRun(expectedCommit);
    if (!run) {
      notify('Actionsの起動を待っています。反映には少し時間がかかります。');
      return;
    }
    latestRunId = run.id;
    showLink(run.id);
    notify(formatStatus(run), run.status === 'completed' && run.conclusion !== 'success' ? 'error' : '');
    if (run.status === 'completed') {
      stopTimer();
      if (run.conclusion === 'success') {
        const artifacts = await github('/actions/runs/' + run.id + '/artifacts?per_page=30', accessToken());
        const found = (artifacts.artifacts || []).some((item) => item.name === 'generated-3d-model' && !item.expired);
        notify(found
          ? 'GLB・PNGのArtifactを確認しました。「GitHubで実行」を開いてダウンロードできます。'
          : 'Actionsは成功ですが、Artifactがありません。生成ログの出力先を確認してください。',
          found ? 'success' : 'warning');
      }
    }
  } catch (error) {
    stopTimer();
    notify(error.message, 'error');
  } finally {
    checking = false;
  }
}
function startPolling() {
  stopTimer();
  poll();
  timer = window.setInterval(poll, 15000);
}
el('refresh-button').addEventListener('click', async () => {
  expectedCommit = '';
  await poll();
});
el('build-button').addEventListener('click', async () => {
  const source = el('python-source').value;
  const issue = checkPython(source);
  if (issue) { notify(issue, 'warning'); return; }
  if (!accessToken()) { notify('GitHubの限定権限トークンを入力してください。', 'warning'); return; }
  if (!window.confirm('選択したPythonで ' + MODEL_PATH + ' を上書きしてGitHub Actionsを実行します。\n未確認の生成コードは実行しないでください。続けますか？')) return;
  const button = el('build-button');
  button.disabled = true;
  stopTimer();
  const token = accessToken();
  try {
    notify('既存のmodel.pyを確認中…');
    const old = await github('/contents/' + MODEL_PATH + '?ref=' + BRANCH, token);
    notify('PythonをGitHubへ保存中…');
    const change = await github('/contents/' + MODEL_PATH, token, {
      method: 'PUT',
      body: {
        message: 'feat(3d): update Gemma-generated model from PWA',
        content: base64Utf8(source),
        sha: old.sha,
        branch: BRANCH
      }
    });
    expectedCommit = change.commit.sha;
    latestRunId = null;
    notify('Blenderの実行を開始しています…');
    await github('/actions/workflows/' + WORKFLOW + '/dispatches', token, {
      method: 'POST',
      body: { ref: BRANCH }
    });
    notify('実行を開始しました。GitHubの反映を待っています。');
    startPolling();
  } catch (error) {
    notify(error.message + '。GitHub Actionsのリンクから状況を確認できます。', 'error');
  } finally {
    button.disabled = false;
  }
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
