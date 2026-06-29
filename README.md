# X Followback Marker

一个轻量的 Tampermonkey 用户脚本，用来在 X/Twitter 的关注列表里标记互关状态。

它只修改你本地浏览器里的页面显示，不会自动关注、取关、点赞、转发或调用 X 的接口。

## 功能

- ✅ 已回关：绿色背景和绿色边框
- ❌ 未回关：红色背景和红色边框
- ↩️ 待回关：在关注者/认证关注者页面里，标记“对方关注你但你还没关注对方”的账号
- 🔵 蓝 V 未回关：红色标记，并在统计面板里单独计数
- 只扫描中间的 following/followers 主列表，不扫描右侧推荐关注
- 支持中英文页面里的 `关注了你` / `Follows you`
- 右下角显示统计面板
- 支持手动重新扫描
- 不做任何自动点击行为

## 安装

1. 安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)。
2. 新建用户脚本。
3. 复制 `x-followback-marker.user.js` 的全部内容。
4. 保存脚本。
5. 打开 X/Twitter 的关注列表页面，例如：

   ```text
   https://x.com/your_username/following
   ```

6. 页面右下角出现 `互关标记` 面板后即可使用。

## 支持页面

脚本会在以下页面启用：

- `/following`
- `/followers`
- `/verified_followers`
- `/followers_you_follow`

主要测试页面是：

```text
https://x.com/<username>/following
```

## 使用建议

- 慢慢往下滚动，X 会动态加载更多用户卡片，脚本会自动标记新加载的卡片。
- 如果发现漏标，点击右下角面板里的 `重新扫描`。
- 建议只用它辅助人工判断，不要配合批量取关脚本。

## 安全边界

这个脚本只做本地 DOM 标记：

- 不读取你的密码
- 不发送私信
- 不自动关注/取关
- 不批量请求 X 接口
- 不上传你的关注列表

它类似一个本地页面高亮工具。是否取关仍然由你手动决定。

## 已知限制

- X/Twitter 经常改页面结构，未来可能需要更新选择器。
- 判断是否回关依赖页面里是否出现 `关注了你` / `Follows you`。
- 在关注者/认证关注者页面，判断是否待回关依赖按钮文案 `正在关注` / `回关` / `Following` / `Follow back`。
- 如果 X 页面语言或文案变化，可能需要补充关键词。

## 文件

- `x-followback-marker.user.js`：Tampermonkey 脚本本体
- `x-followback-marker-README.md`：项目说明
- `x-followback-marker-LICENSE.txt`：MIT License
- `x-followback-marker-CHANGELOG.md`：更新记录

## License

MIT
