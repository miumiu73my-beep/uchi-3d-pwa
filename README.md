# 3Dモデル生成 PWA

iPad / iPhone の Safari から、Google Gemmaで作ったBlender PythonをプライベートなGitHubリポジトリへ送信し、GitHub ActionsでGLBと確認用PNGを生成する個人用PWAです。

## 安全な分離
- **このリポジトリ（Public）** は PWA のHTML・CSS・JavaScriptとPWAビルド用ワークフローのみを公開します。
- **uchi-no-ko-3d-test（Private）** に座標データ、造形Python、Blender実行ワークフロー、GLB・PNGを保持します。PrivateリポジトリをPublicに変更する必要はありません。
- 認証用のPersonal Access Token（PAT）は実行中に一時入力します。HTML/JSに固定記述したり、端末に永続保存したりしません。リロード時は再入力になります。
- 画面自体は公開されます。PATを知らない第三者はPrivateリポジトリの内容を読み取ったり書き込んだりできません。
- **ただしPATをブラウザーに入力する方式にはリスクがあります。** 信頼できるGitHub PagesのURLでのみ使用し、短い有効期限・最小権限のトークンを使い、利用しないときはGitHub側で失効してください。生成Pythonも実行前にレビューしてください。

## 最初のGitHub Pages公開
1. このリポジトリの **Settings → Pages** を開き、**Build and deployment → Source** を **GitHub Actions** に変更します。
2. **Actions → Build 3D PWA** の最新実行が緑か確認します。必要なら **Run workflow** で再実行します。
3. Pagesデプロイが成功すれば、公開先は **https://miumiu73my-beep.github.io/uchi-3d-pwa/** です。
4. iPadのSafariで開き、共有メニューの **ホーム画面に追加** からPWAとして登録できます。
5. スマートフォン上で一度ネット接続して読み込めば、画面本体はオフラインでも開けます。ただし新規のBlender生成とGitHub APIの利用にはインターネット接続が必要です。

## GitHub認証（暫定）
GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens で発行します。

- Resource owner: **miumiu73my-beep**
- Repository access: **Only select repositories → uchi-no-ko-3d-test**
- Repository permissions: **Contents: Read and write**, **Actions: Read and write**
- Expiration: できれば短期間（例：7日）

PATをコード・README・チャットに貼り付けないでください。公開PWAには、GitHub APIに対して実行時にのみ入力して使用します。

## 使い方
1. Gemmaが生成した `build_model()` を持つPython全文を、`model.py` または `.txt` として選択（またはテキスト欄へ貼り付け）。
2. Pythonを目視で確認してからPATを入力。
3. **Pythonを保存 → Blenderで生成** を押す。
4. 実行ページのArtifactsから `generated-3d-model` をダウンロード。PNGとGLB・BLENDを確認。
5. PNGはPWAのプレビュー欄へ複数選択して表示できます。GLBはNomad Sculptなどで開けます。

## 実装と制限
- `web/` は Vanilla JavaScript・Vite・vite-plugin-pwa によるPWAです。
- `.github/workflows/build-pwa.yml` がビルドし、GitHub Pagesに公開します。
- 画像から座標JSONを抽出する処理はPWAには含まれません。画像・設定文をGemmaへ渡す手順は別途実施してください。
- 初期版ではArtifactsの自動取得・GLBのアプリ内表示・GitHub認証の自動化は未対応です。
- **CodespacesおよびCloudflareはPWA利用時に不要**です。
- PrivateリポジトリのActionsに投入するGemma生成Pythonは、任意コードとして実行されるため、安全と断定しないでください。

## ローカル開発（必要になった場合）
```bash
cd web
npm install
npm run build
```

このリポジトリの `web/` 以外に Private 制作データを追加しないでください。
