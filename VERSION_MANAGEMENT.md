# 版本号管理说明

## 📌 背景

项目的版本号分散在多个文件中：
- `package.json`
- `.env` (REACT_APP_VERSION)
- `public/manifest.json`
- `public/manifest.firefox.json`
- `public/manifest.thunderbird.json`

为了避免手动更新多个文件的麻烦，现已实现自动化版本号管理方案。

## ✨ 解决方案

### 单一版本源

**`package.json` 是唯一的版本号来源**，其他文件的版本号会自动从 `package.json` 同步。

### 自动同步机制

构建时会自动同步版本号：

```bash
pnpm build        # 构建前自动同步版本号
pnpm build+zip    # 打包前自动同步版本号
```

手动同步版本号：

```bash
pnpm sync-version  # 手动触发版本号同步
```

## 🚀 版本号更新方法

### 方法一：使用快捷命令（推荐）

```bash
# 补丁版本更新: 2.0.19 -> 2.0.20
pnpm version:patch

# 次版本更新: 2.0.19 -> 2.1.0
pnpm version:minor

# 主版本更新: 2.0.19 -> 3.0.0
pnpm version:major

# 手动指定版本号: 设置为 2.1.0
pnpm version:set -- 2.1.0
```

这些命令会自动完成：
1. ✅ 更新 `package.json` 中的版本号
2. ✅ 自动同步到其他所有文件

### 方法二：手动更新（不推荐）

如果你手动修改了 `package.json` 的版本号，记得运行：

```bash
pnpm sync-version
```

## 📝 完整的版本发布流程

```bash
# 0. 格式化
pnpm format

# 1. 更新版本号（自动完成所有文件的同步）
pnpm version:patch

# 2. 更新 CHANGELOG.md（手动编辑）
# 添加新版本的更新内容

# 3. 构建和打包（构建前会再次确保版本号同步）
pnpm build+zip

# 4. 提交更改
git add .
git commit -m "chore: bump version to 2.0.20"

# 5. 推送代码
git push origin dev

# 6. 合并到 master
git checkout master
git merge dev

# 7. 打 tag
git tag -a v2.0.20 -m "Release version 2.0.20"
git push origin master v2.0.20

# 8. 切换回 dev 分支
git checkout dev
```

## 🛠️ 相关脚本文件

- `src/scripts/sync-version.mjs` - 版本号同步脚本
- `src/scripts/update-version.mjs` - 版本号更新脚本

## ⚠️ 注意事项

1. **不要手动修改** `.env`、`manifest.json` 等文件中的版本号
2. **只需修改** `package.json` 中的版本号，或者使用 `pnpm version:*` 命令
3. 每次构建前会自动同步版本号，确保所有文件版本一致
4. 更新版本后记得同步更新 `CHANGELOG.md`
