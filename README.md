# 小遥工作台

这是一个面向 Android 手机使用的个人工作台 App，当前包含：

- 个人主页：头像、昵称、出生日期、求职方向和自我介绍。
- 每日单词速记：四级高频词汇、短语、例句翻译、学习状态、默写和三选一复盘。
- 每日任务：按日期管理任务，支持批量导入、编辑、完成后自动进入下一天。
- 记账：按月记录收入和支出，支持生活费固定、补账、分类和余额统计。

## 技术栈

- React
- Vite
- Capacitor
- Android Gradle Project

## 本地运行

```bash
npm install
npm run dev
```

默认预览地址：

```text
http://localhost:5173/
```

## 构建网页资源

```bash
npm run build
```

## 同步 Android 工程

```bash
npx cap sync android
```

## 构建 Android Debug APK

进入 Android 工程目录后构建：

```bash
cd android
gradlew.bat --no-daemon assembleDebug
```

APK 默认输出位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## 维护说明

- `src/App.jsx` 是主要功能逻辑。
- `src/App.css` 是主要样式。
- `src/data/cet4.json` 是四级词库数据。
- `src/data/dailyDeck.json` 是短语和补充词条数据。
- `src/data/google-20k.txt` 用于词频排序参考。
- `xyw-workbench-builder-SKILL.md` 是给其他 AI 使用的工作台生成说明。

## 不上传的文件

仓库不应提交以下内容：

- `node_modules`
- `dist`
- Android `build` 目录
- `.gradle`
- `local.properties`
- APK、AAB 等构建产物
- 个人隐私数据、Token、密码和本机路径配置

