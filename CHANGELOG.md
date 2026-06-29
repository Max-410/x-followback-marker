# Changelog

## v0.3.0

- 修复 X following 页面扫描范围。
- 只扫描 `data-testid="primaryColumn"` 中的 `UserCell`。
- 排除右侧 `data-testid="sidebarColumn"` 推荐关注区域。
- 统计面板增加脚本版本和扫描卡片数量。
- 增加错误提示，方便排查 DOM 变化。

## v0.2.0

- 尝试排除右侧栏和窄卡片。
- 增加主栏过滤逻辑。

## v0.1.0

- 初始版本。
- 支持已回关/未回关颜色标记。
- 支持蓝 V 未回关统计。
- 支持右下角控制面板。
