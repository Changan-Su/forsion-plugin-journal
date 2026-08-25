#!/usr/bin/env bash
# 装/更新「周期笔记台」(journal-desk)到 Forsion 家目录。
#   用法:sh install.sh [dev|prod]     缺省 dev(~/.forsion-dev);prod=~/.forsion
# 本目录即插件本体:整目录拷到 <home>/plugins/journal-desk/ 一处即完成——
#   桌面识别 manifest.json(UI 插件)+ spaces/(内嵌 Space,随插件启停显隐)。
# 本插件是纯 UI 插件:没有 agents/、没有 skills/、没有引擎侧内容。
# ⚠️ 用户的周期笔记住在**笔记库**里(默认 Journal/…),与本目录无关,重装/卸载都不会碰到它们。
set -euo pipefail
MODE="${1:-dev}"
case "$MODE" in
  dev)  HOME_DIR="$HOME/.forsion-dev" ;;
  prod) HOME_DIR="$HOME/.forsion" ;;
  *) echo "用法:sh install.sh [dev|prod]" >&2; exit 2 ;;
esac
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME_DIR/plugins/journal-desk"

# 不许从已安装目录内自更新:下面的 rm -rf 会先删掉复制源(自己),把插件卸成空壳
if [ "$HERE" = "$(cd "$DEST" 2>/dev/null && pwd || true)" ]; then
  echo "❌ 正在从已安装目录运行,请从源码仓的 forsion-plugin-journal/ 目录执行 install.sh" >&2
  exit 2
fi

mkdir -p "$HOME_DIR/plugins"
rm -rf "$DEST"
cp -R "$HERE" "$DEST"

# 迁移:若曾把 Space 单独装在顶层 spaces/journal-desk,它会以「用户 Space 优先」遮蔽插件内嵌版。
# 只在它确是本插件的配方(引用 plugin:journal-desk: 视图)时改名备份令其不再注册——
# 目录与用户其他文件原样保留,绝不无差别删除同名用户资产。
OLD_SPACE="$HOME_DIR/spaces/journal-desk/space.json"
if grep -q 'plugin:journal-desk:' "$OLD_SPACE" 2>/dev/null; then
  mv "$OLD_SPACE" "$OLD_SPACE.pre-bundle.bak"
  echo "   (旧版顶层 Space 配方已备份为 space.json.pre-bundle.bak,不再遮蔽插件内嵌版)"
fi

echo "✅ 已安装 → $DEST"
echo "重开 Forsion(dev:重启 desktop)后:命令面板「周期笔记台:今天」,或工作台切到「周期笔记台」Space。"
