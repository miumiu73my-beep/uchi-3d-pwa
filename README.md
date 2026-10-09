# 3Dモデル生成PWA — GitHubログイン利用版

iPad / iPhone向け。Gemmaが生成したBlender用Pythonを、GitHubのWeb編集画面で保存することで、GitHub ActionsがGLB・BLEND・確認用PNGを自動生成します。

## 公開先と非公開データ
- PWA画面（Public）：[uchi-3d-pwa](https://github.com/miumiu73my-beep/uchi-3d-pwa)
- 生成処理とモデルファイル（Private）：`uchi-no-ko-3d-test`
- 一歌V8等の既存制作資料はPublicへ移しません。

## 認証方法（追加トークン不要）

**iPhone/iPad用のGitHubアプリやChatGPTのGitHub連携は、PWAのGitHub API認証に直接使えません。**

現行版では代わりにGitHub Web版（Safari等）にログインし、GitHubの編集画面から保存します。PWAはGitHubトークン・パスワード・秘密鍵を要求せず、コード内にも含みません。

1. [PWA](https://miumiu73my-beep.github.io/uchi-3d-pwa/) を開く。
2. Gemmaから受け取った`model.py` / `.txt` を選ぶか、Python全文を貼る。
3. 内容を確認し **「① Python全文をコピー」** を押す。
4. **「② GitHubの編集画面を開く」** を押す。Safari側でGitHubにログイン済みであれば認証が引き継がれます。GitHubアプリへの切替で編集できない場合、Safariで直接ファイルを開いて鉛筆アイコンから編集してください。
5. Privateリポジトリの `pipeline/generated/model.py` で既存の全文を置き換え、**Commit changes** から **main** ブランチへ保存する。
6. Privateリポジトリの[Build 3D model](https://github.com/miumiu73my-beep/uchi-no-ko-3d-test/actions/workflows/build-model.yml)を開く。**model.py に変更を加えたコミット**を検出すると、Blenderが自動実行されます。コードに差分がなければ実行は開始しません（Actions画面から手動実行できます）。
7. 緑のチェックが表示されたら、実行履歴のArtifactsから `generated-3d-model` をダウンロード。GLBはNomad Sculptで開けます。
8. 取得したPNGをPWAの「PNGで結果を見る」から選べば端末内でプレビューできます。

## 座標JSONの原画再投影（Blender前の品質チェック）

PWAに「座標JSONの再投影」欄を追加しました。**画像もJSONもGitHubにアップロードせず、iPad/iPhoneのブラウザー内だけで処理**します。

1. 正面／側面／背面のうち**1視点だけの無加工原画**を選ぶ（横に3枚並んだ三面図そのものではなく、計測対象にした1枚）。
2. その原画と同じ視点の `front.json` / `side.json` / `back.json` を選ぶ。
3. ランドマーク・部位名の表示を切り替え、原画上に色線と点を重ねて確認する。
4. 「重ね合わせPNGを保存」から `overlay_front.png` などを取得し、元絵の目・顔・髪・服・甲羅・手・杖に沿っているか目視確認する。

### JSONと画像の前提

- `coordinate_system: "image_uv_1000"` は画像幅・高さを0〜1000に正規化したUVです。原画の実寸W/Hを読み取って `x = u*W/1000`、`y = v*H/1000` で再投影します。
- `image_size_px: null` でも画像から取得したW/Hを使った**相対UVの仮表示は可能**です。ただし、そのJSONが同じ原画・切り出し範囲から求められた保証はありません。精密に測った座標である証明にもなりません。
- `image_size_px: [W,H]` がある場合は原画の寸法と完全一致しなければ描画を停止。サイズ不一致を勝手に縮尺変換しません。
- `schema_version: "2.0"`、`features`配列、`needs_review`文字列配列、各UVの0〜1000などを検査します。推定・遮蔽された点は区別／除外します。
- JSONの点を動かす、輪郭を補正する、画像をAIで描き直す処理は**ありません**。点がずれていたらGemini等で再計測してください。
- 先に生成された色分け画像や、リサイズ・再生成された絵を原画として入力しないでください。
- ここでは座標JSONからのBlender造形は行いません。今のモデル生成処理とは独立した検証機能です。

## セキュリティ上の注意
- Gemmaが生成したPythonはGitHub Actionsで実行されます。**必ずコードを確認してからcommit**してください。PWAにある簡易チェックは安全性を保証しません。
- 「Commit changes」後に自動でモデル生成が始まるので、意図しないコード変更を保存しないよう注意してください。
- 公開PWAからPrivateリポジトリのファイルは読み取りません。GitHub上で必要な操作をユーザー自身が行います。
- Cloudflareや独自の認証サーバーは使っていません。完全なワンボタン実行にはGitHub OAuthと安全な認証バックエンドなど、別の構成が必要です。

## 技術構成
- Vanilla JS / Vite / vite-plugin-pwa のオフライン対応UI
- GitHub Pagesで公開
- Privateリポジトリの `pipeline/generated/model.py` の保存を `push.paths` で検出し、GitHub ActionsでBlenderを実行
- `pipeline/run_pipeline.py` が `model.glb`, `model.blend`, 複数のPNGを出力

## 動作チェック
- [ ] Public PWAにPAT入力欄がない
- [ ] Python全文をコピーできる
- [ ] GitHub Webの編集画面を開ける
- [ ] Privateのmodel.pyだけを更新してmainへ保存できる
- [ ] Build 3D modelが自動起動する
- [ ] ArtifactsからGLBとPNGを取得できる

## 将来の改善
- GitHub Appを開発者設定で登録し、適切なバックエンド経由でOAuth認証することでWeb編集の手間を削減
- ArtifactのPWA内ダウンロード、GLBプレビュー、生成物の履歴管理

GitHub PagesのHTMLとPWAキャッシュはオフライン表示可能ですが、GitHubへの保存やBlenderの生成にはネット接続が必要です。
