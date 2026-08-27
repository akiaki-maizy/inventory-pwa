在庫・賞味期限管理 PWA Ver.1.4

■ 含まれるファイル
index.html
manifest.webmanifest
service-worker.js
icon-192.png
icon-512.png

■ AndroidでPWAとして使う条件
PWAのインストールとService Workerによるオフライン動作には、原則としてHTTPSで配信する必要があります。
Androidの「ダウンロード」から content:// で index.html を直接開く方法では正常動作しません。

■ 基本手順
1. このフォルダの中身をHTTPS対応のWebサーバーへアップロードする
2. Android Chromeで index.html を開く
3. Chromeメニューから「ホーム画面に追加」または「アプリをインストール」
4. 一度起動して初期設定またはデモデータを登録
5. 以後はホーム画面のアイコンから起動
6. オフラインでも基本機能を利用可能

■ データ保存
在庫データは、その端末・そのPWAのIndexedDBに保存されます。
端末故障・アプリデータ削除に備え、設定画面からJSONバックアップを定期的に書き出してください。

■ 店舗間
店舗Aと店舗Bは別々の端末内データとして運用します。
集計時は各店舗からCSVを書き出し、別途集計ツールで合算します。
