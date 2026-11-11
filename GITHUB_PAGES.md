# GitHub Pagesへの公開方法

このプロジェクトはViteとthree.jsを使っています。GitHubに元の `index.html` を置くだけでは動かないので、GitHub Actionsでビルドし、生成された `dist` をPagesへ公開します。

## 1. GitHubにファイルを置く

ダウンロードしたZIPを展開し、**中身**をリポジトリの一番上に置いてください。ZIPそのものや、プロジェクトを包んでいるフォルダーを一段深く置くのではありません。GitHub上で次のファイルが同じ階層に見えるのが正しい状態です。

```text
リポジトリの一番上
├── index.html
├── model-viewer.html
├── package.json
├── package-lock.json
├── vite.config.js
├── src/
├── .gitignore
└── .github/
    └── workflows/
        └── deploy.yml
```

**`.github/workflows/deploy.yml` は必須**です。ドットで始まるフォルダーはPC上で隠れていることがあります。macOSのFinderでは `Command + Shift + .` で表示を切り替えられます。GitHubのファイル一覧でも `.github/workflows/deploy.yml` があるか確認してください。

元のファイルがすでにある場合は、更新版で置き換えます。`node_modules` と `dist` はGitHubにアップロードする必要はありません。GitHub Actionsが作成します。

## 2. Pagesの公開方法を設定する

1. GitHubのリポジトリを開き、**Settings → Pages** を選びます。
2. **Build and deployment → Source** で **GitHub Actions** を選びます。`Deploy from a branch` ではありません。
3. 変更したファイルを `main` または `master` ブランチにコミット・プッシュします。ファイルを先にコミット済みの場合は、次の手動実行を行ってください。
4. リポジトリの **Actions** タブで「GitHub Pagesへ公開」を開き、実行が成功するまで待ちます。設定変更後に実行がない場合は **Run workflow** から `main` または `master` を選んで手動実行します。
5. **Settings → Pages** に表示された公開URLを開きます。

このワークフローは `main` または `master` へのプッシュで自動実行します。別のブランチを使う場合は、`.github/workflows/deploy.yml` の `branches` を変更するか、Actionsからそのブランチを選んで手動実行してください。リポジトリの設定によっては、GitHub Actionsの利用を許可する必要があります。

## 3. URLの形

通常のプロジェクト用Pagesでは、たとえば次の形です。

```text
https://実際のユーザー名.github.io/実際のリポジトリ名/
```

ユーザー名とリポジトリ名はそれぞれ1回ずつです。`ユーザー名` や `リポジトリ名` は説明用の文字なので、実際の名前に置き換えます。公開URLはリポジトリの **Settings → Pages** で確認してください。ユーザーサイト・組織サイトやカスタムドメインでは形が異なることがあります。

サイトを開いたら、Room Sketch Studioの右上「モデル専用ビュー」で別画面へ移れます。

## うまく動かないとき

- **文字やボタンだけで見た目がない**：SourceがGitHub Actionsか、Actionsが成功したか、ファイル一式がリポジトリの一番上にあるか確認します。元のHTMLをそのまま公開しただけではViteの依存関係を処理できません。
- **Actionsにワークフローが出ない**：`.github/workflows/deploy.yml` が正しいブランチのリポジトリ直下にあるか確認します。
- **Actionsが赤く失敗する**：失敗した実行を開き、赤くなっているステップとそのログを確認します。
- **404になる**：デプロイが成功した後、Settings → Pagesに表示されるURLを開きます。反映まで少し時間がかかる場合があります。
- **古い画面が出る**：新しいコミットのワークフローが成功したか確認してからブラウザを再読み込みしてください。

公開処理はGitHub側で実行されるため、環境や権限によっては設定が必要です。このファイルを置いただけでは自動的にGitHubへアップロードされません。
