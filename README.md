# JetBrains Git - VS Code Extension

为 VS Code 提供类似 JetBrains IDE 的 Git 操作体验。

## 功能特性

### ✅ Compare with Revision（与历史版本比较）
右键点击文件 → **Git (JetBrains Style)** → **Compare with Revision...**
- 显示该文件的所有提交历史
- 选择任意历史版本与当前文件进行 Diff 对比

### ✅ Compare with Branch/Tag（与分支/标签比较）
右键点击文件 → **Git (JetBrains Style)** → **Compare with Branch or Tag...**
- 显示所有本地分支、远程分支和标签
- 选择任意引用与当前文件进行 Diff 对比

## 使用方法

### 开发调试

1. 在 VS Code 中打开此项目
2. 按 `F5` 启动扩展开发宿主
3. 在新窗口中对任意 Git 仓库中的文件右键测试

### 安装使用

```bash
# 打包扩展
npm install -g @vscode/vsce
vsce package

# 安装生成的 .vsix 文件
# VS Code: Extensions → ... → Install from VSIX
```

## 项目结构

```
├── src/
│   ├── extension.ts              # 扩展入口
│   ├── gitService.ts             # Git 操作服务
│   ├── gitContentProvider.ts     # 历史版本内容提供者
│   └── commands/
│       ├── compareWithRevision.ts
│       └── compareWithBranch.ts
├── out/                          # 编译输出
├── package.json                  # 扩展清单
└── tsconfig.json
```

## 技术实现

- **TextDocumentContentProvider**: 自定义 `jb-git` scheme 读取 Git 历史版本内容
- **QuickPick UI**: 友好的版本/分支选择界面
- **vscode.diff**: 调用 VS Code 原生 Diff 视图

## License

MIT
