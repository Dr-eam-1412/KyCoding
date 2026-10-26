# 05 · 网页选择图片、核对与人工提交

只在当前任务授权上传时读本文件；创建技能、只生图或只读任务不操作上传。

## 上传前

使用Computer Use，先读取本轮浏览器/原生app文档，绑定当前正确的普通作业页。确认课程、作业标题、题目数量/ID/题号、上传入口、已有照片和对应本地文件哈希。已有图片不自动覆盖、追加或删除，先核对用户是否要求替换。

选择器只能来自已读取的页面：本次题卡形态为question-card-数字、输入为answer-同一数字，必须每次现场验证。旧数字或固定坐标不是回放计划。

## 首选受支持的文件选择器API

先读file-uploads文档，实际方法按当前工具能力：

~~~javascript
const p = tab.playwright.waitForEvent('filechooser', { timeoutMs: 10000 });
await tab.playwright.locator(observedInputSelector).click();
const chooser = await p;
await chooser.setFiles([verifiedAbsolutePhotoPath]);
~~~

一次只给当前题的映射文件；多图先确认控件支持multiple和当前上限。每次选择后检查网页状态，不能只看API调用成功。

## 本次已验证的原生系统选择器替代

浏览器setFiles曾因Allow access to file URLs未开失败。读当前chrome-file-upload-troubleshooting文档，并按它要求告知设置说明。不要自动扩大文件权限。

如果当前工具允许原生选择器替代，可通过Computer Use：
1. 点击同一已验证题目的上传控件，读取Chrome原生AX，确认出现系统“打开”面板。此前单次点击无效时先看状态/截图，不能连续盲点。
2. 在该面板按Command+Shift+G，读取AX，找到真实PathTextField。
3. 填入本题图片绝对路径，Return。重新读AX，确认选中的文件名及预览与目标一致。
4. 点击该面板的“打开”（OKButton），这是选择图片，不是网页最终提交。
5. 回网页检查当前题号、等待提交状态、照片数量、complete与naturalWidth>0。
6. 按映射继续其余题；每次检查，发生不匹配/状态不明立即停止，不重传同一题。

原生UI入口是Chrome app的系统文件面板；不使用osascript、raw CDP或任意页面JS模拟写入。浏览器上传已被明确安全策略禁止时，不能把原生选择器当作绕过同一禁令的方法。这里的历史失败是文件API权限不足，原生面板是工具文档允许的正常替代。

可根据新AX动态识别“打开”和路径框；不要保存旧AX数字，图片参考确认后再批量。不要用最终提交按钮测试“是否可点击”。

## 只读核对示意

现场确认结构后，通过受支持的只读evaluate读取：

~~~javascript
const audit = await tab.playwright.locator('[id^="question-card-"]').evaluateAll(cards =>
  cards.map(c => ({
    id: c.id,
    title: c.querySelector('h4')?.textContent,
    waiting: c.textContent.includes('等待提交'),
    images: [...c.querySelectorAll('img')]
      .filter(i => !i.closest('.space-y-0'))
      .map(i => ({ loaded: i.complete && i.naturalWidth > 0,
                   width: i.naturalWidth, height: i.naturalHeight }))
  }))
);
~~~

确保所有目标题均有正确数量的已加载照片、没有多选旧版/漏题；结合每题实际选择文件日志核对映射。只检查相同尺寸不能证明内容相同。核对图像内容的hash仅在工具支持正常读取且不涉及禁用接口时使用，不能越过工具权限。

## 交接

保存并在回复中嵌入真实网页截图，包含作业身份、等待提交预览和最终按钮的可见上下文。保留/markHandoff当前页，避免刷新或导航导致临时blob丢失。

给出题目→页码表、已就绪题数、本地文件与“未点击最终提交”的状态。请用户核对后自己点击“提交作业”和之后的确认；本技能不打开提交弹窗来代替用户确认。

blob、FileList、上传中图片alt、等待提交或按钮可用只表示预览状态，不能报告服务端完成。用户若自行提交后要求检查，另做只读核对，同课程/作业的正数且完整进度才可认定成功。

