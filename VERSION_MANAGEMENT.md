# 版本号管理与发布指南

## 📌 背景

项目的版本号分散在以下多个文件中：
- `package.json`
- `.env` (`REACT_APP_VERSION`)
- `public/manifest.json`
- `public/manifest.firefox.json`
- `public/manifest.thunderbird.json`

为了避免手动更新多个文件的繁琐与疏漏，项目已接入**自动化版本号管理及同步方案**。

## ✨ 解决方案

### 单一版本源
**`package.json` 是项目中唯一的版本号来源**。其他所有文件的版本号均由此文件自动分发与同步。

### 自动同步机制
* **构建时自动同步：** 执行以下打包命令时，底层会自动先触发版本号同步，确保产物一致。
  ```bash
  pnpm build        # 构建前自动同步版本号
  pnpm build+zip    # 打包前自动同步版本号
  ```
* **手动强制同步：** 如果不小心手动改动了 `package.json`，可运行此命令：
  ```bash
  pnpm sync-version  # 手动触发版本号同步
  ```

## 🚀 版本号更新方法

更新版本号时，**强烈推荐**使用以下封装好的快捷命令。这些命令会自动完成 `package.json` 的修改并**同步到所有关联文件**。

```bash
# 补丁版本更新 (Patch): 2.0.19 -> 2.0.20（Bug 修复）
pnpm version:patch

# 次版本更新 (Minor): 2.0.19 -> 2.1.0（新功能引入）
pnpm version:minor

# 主版本更新 (Major): 2.0.19 -> 3.0.0（重大断代更新）
pnpm version:major

# 手动指定精确版本号: 设置为 2.1.0
pnpm version:set -- 2.1.0
```

这些命令会自动完成：
1. ✅ 更新 `package.json` 中的版本号
2. ✅ 自动同步到其他所有文件

## 📝 完整的版本发布流程（Git 规范）

为了确保分支安全，项目采用了 `master` (生产/发版) 与 `dev` (开发/集成) 双分支管理。**禁止直接向 `master` 推送代码**，必须通过 GitHub PR 合并。

以下是标准的合规发布流程：

### 阶段一：在 `dev` 分支完成发版准备
```bash
# 0. 确保当前在 dev 分支且代码最新
git checkout dev
git pull origin dev

# 1. 代码格式化检查
pnpm format

# 2. 更新版本号（自动完成所有文件的同步）
pnpm version:patch

# 3. 更新 CHANGELOG.md（手动编辑）
# 添加新版本的更新内容

# 4. 构建和打包（构建前会再次确保版本号同步）
pnpm build+zip

# 5. 提交变更代码
git add .
git commit -m "chore: bump version to 2.0.20"

# 6. 推送到远端 dev 分支
git push origin dev
```

### 阶段二：通过 GitHub PR 发布到 `master`
1. 打开 GitHub 仓库页面，发起一个 **`dev` -> `master`** 的 Pull Request。
2. PR 标题命名为 `Release v2.0.20`。
3. 确认自动化检查通过后，点击 **Merge pull request** 将代码正式合入 `master`。

### 阶段三：本地同步并在 `master` 标记 Tag（触发自动发版）
```bash
# 7. 切换到本地 master 并拉取 GitHub 确认合入的最新代码
git checkout master
git pull origin master

# 8. 基于生产分支节点打上版本 Tag
git tag -a v2.0.20 -m "Release version 2.0.20"

# 9. 推送 Tag 到远端（关键：此操作将触发 GitHub Actions 的自动发版工作流）
git push origin v2.0.20

# 10. 切换回 dev 分支继续日常开发
git checkout dev

# 11. 把 master 上的这个合并记录也同步回 dev
git pull --ff-only origin dev
git merge --ff-only origin/master
git push origin dev
```

## 🛠️ 相关脚本文件

- `src/scripts/sync-version.mjs` - 版本号同步脚本
- `src/scripts/update-version.mjs` - 版本号更新脚本

## ⚠️ 注意事项

1. **不要手动修改** `.env`、`manifest.json` 等文件中的版本号。
2. **只需修改** `package.json` 中的版本号，或者使用 `pnpm version:*` 命令（如果手动修改了 `package.json`，记得运行 `pnpm sync-version`）。
3. 每次构建前会自动同步版本号，确保所有文件版本一致。
4. 更新版本后记得同步更新 `CHANGELOG.md`，确保内容与版本号完全对应。
