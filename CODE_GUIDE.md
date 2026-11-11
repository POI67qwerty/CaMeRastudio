# コードの案内 — どのファイルを見ればいい？

Room Sketch Studioとモデル専用ビューアーのソースを、役割ごとに分けています。画面、見た目、動きの順に追うと分かりやすいです。

## 1. 画面の内容：HTML

| ファイル | 担当 |
| --- | --- |
| `index.html` | 部屋エディターの画面。上部ボタン、左の間取り・家具、中央の3Dプレビュー、右の設定、書き出し画面。 |
| `model-viewer.html` | モデル専用ビューアーの画面。GLB読み込み、3Dプレビュー、ガイド、二値線画、書き出し。 |

ボタンの文言や並びを変えたい場合は、まず各HTMLを探してください。`id` はJavaScriptから操作するための名前なので、変更したら対応するJavaScriptも変更します。

## 2. 見た目：CSS

- `src/style.css`：部屋画面のCSSを順番に読み込む入口。
- `src/styles/room/`：部屋画面用のCSS。`header.css`（上部）、`plan-and-furniture.css`（間取り・家具）、`viewport.css`（プレビュー）、`dimension-editors.css`（寸法入力）、`perspective-guides.css`（ガイド）、`model-import.css`（モデル入力）など。
- `src/model-viewer.css`：モデルビューアーのCSSを順番に読み込む入口。
- `src/styles/viewer/`：ビューアー用のCSS。`header.css`、`preview.css`、`sidebar.css`、`controls.css`、`responsive.css`など。

色、余白、文字、画面幅によるレイアウトを変えるときに編集します。CSSは後から読み込まれた設定が優先される場合があるため、入口の `@import` の順番には意味があります。

## 3. 部屋画面の動き：JavaScript

| ファイル | 担当 |
| --- | --- |
| `src/main.js` | 部屋画面の入口。シーンと編集状態を持ち、各部品をつなぐ。ドラッグ、選択、操作履歴、カメラ、ボタン操作、保存・復元の手順もここに残している。 |
| `src/room/geometry.js` | 箱・円柱・基本形と、`EdgesGeometry` による「辺の線画」。 |
| `src/room/furniture.js` | 標準家具の名前、当たり判定用サイズ、家具の3D形状。 |
| `src/room/templates.js` | ベッドルーム・和室など、各テンプレートの初期家具と位置。 |
| `src/room/room-geometry.js` | 床・壁・窓・ドアと畳の縁を3Dとして組み立てる。 |
| `src/room/openings.js` | 床の外周、窓・ドアの幅や位置の計算。 |
| `src/room/plan-drawing.js` | 2Dの間取り図や家具・警告の描画。 |
| `src/room/imported-model.js` | 読み込んだGLBの外側グループ、倍率、配置用の範囲。 |
| `src/room/project-serialization.js` | 家具とGLBをJSONに入れる形式に変換し、同じGLBをまとめる。 |
| `src/room/project-validation.js` | 読み込むプロジェクトのデータや寸法のチェック。 |
| `src/room/guide-controls.js` | 線画・ガイドのスライダーや入力欄の表示を同期する。 |
| `src/room/image-export.js` | 部屋のPNG保存・画像コピー画面の操作。 |
| `src/room/viewer-navigation.js` | 部屋とモデルビューアーの切り替え。両画面の状態を保つ。 |

`src/main.js` が各モジュールに必要な値や関数を渡します。部屋の状態は編集や読み込みで入れ替わるので、`getState` などの関数で「その時点の状態」を取得する箇所があります。

## 4. モデルビューアーの動き

| ファイル | 担当 |
| --- | --- |
| `src/model-viewer.js` | ビューアーの入口。GLB読込、画面の操作、カラー・二値線画の切り替え。 |
| `src/viewer/model-camera.js` | モデルの大きさに合わせてカメラを配置する。 |
| `src/viewer/model-resources.js` | モデルの読み替え時に不要なメッシュ・材質などを解放する。 |
| `src/viewer/png-export.js` | 3D画像と、必要なら作画ガイドを合成してPNGにする。 |

## 5. 両画面で使う部品

| ファイル | 担当 |
| --- | --- |
| `src/binary-lines.js` | 法線・深度・物体IDを使う、漫画用の二値線画。 |
| `src/perspective-guides.js` | 消失点・アイレベル・地面グリッドの計算と描画。 |
| `src/model-io.js` | GLB形式とサイズの検証、Three.jsの `GLTFLoader`、モデルデータの変換。 |
| `src/collision.js` | 回転した長方形の重なりと床外判定。 |
| `src/tatami.js` | 畳の敷き方と、床に合わせた縁の計算。 |
| `src/japanese-furniture.js` | 扇風機や和室家具の3D形状。 |

## 6. 最初に読む順番

1. `index.html` でボタンや `canvas` を探す。
2. `src/main.js` の冒頭で、`Scene`・カメラ・レンダラーが作られる流れを見る。
3. `src/room/geometry.js` と `src/room/furniture.js` で、箱から家具と辺の線を作る流れを見る。
4. `src/binary-lines.js` で、辺の線画とは別の「二値線画」の処理を見る。
5. `src/perspective-guides.js` で、カメラに合わせて作画ガイドを描く流れを見る。

## 起動・確認

Node.js 20.19以降または22.12以降で、プロジェクトのフォルダー内から実行します。

```bash
npm install
npm run dev
```

ターミナルに表示されたURLをブラウザで開きます。ビルド確認には `npx vite build` を使えます。`index.html` を直接ダブルクリックするのではなく、Viteから開いてください。
