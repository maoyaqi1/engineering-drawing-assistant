# Third-Party Notices

> 核对日期：2026-10-31
> 适用范围：`G:\HFJH\cloudfunctions\api`、`G:\HFJH\cloudfunctions\teacher`

## 直接依赖

| Package | Version | License |
| --- | ---: | --- |
| `wx-server-sdk` | 2.6.3 | MIT |

精确依赖树已分别固定于：

- `cloudfunctions/api/npm-shrinkwrap.json`
- `cloudfunctions/teacher/npm-shrinkwrap.json`

按锁文件重新安装后的审计结果：每个云函数安装 143 个依赖包，许可证为 MIT、Apache-2.0、ISC、BSD-2-Clause、BSD-3-Clause、0BSD、BlueOak-1.0.0、Unlicense，以及 `json-schema` 的 `(AFL-2.1 OR BSD-3-Clause)` 双许可。未发现 GPL、AGPL、LGPL、SSPL、CDDL、EPL 或 MPL 依赖。

依赖包的版权声明与许可证正文随各自的 npm 包安装；发布或分发云函数依赖时不得删除这些文件。`assert-plus@1.0.0` 与 `tcb-admin-node@1.23.0` 的发布包没有独立 `LICENSE` 文件，但 npm 元数据均声明 MIT；`assert-plus` 的版权主体为 Mark Cavage，`tcb-admin-node` 的版权主体为 Tencent CloudBase。

**待上游确认**：腾讯内部的 `@cloudbase/signature-nodejs@1.0.0-beta.0` 没有在 npm 元数据或发布包中声明许可证，且它被 `wx-server-sdk@2.6.3` 的传递依赖引入。当前教育用途和企业云环境使用风险较低，但正式商业分发前应取得腾讯云团队书面确认，或将 SDK 升级到经实际部署验证、许可证信息完整的版本。

## MIT License

The following license text applies to the MIT-licensed packages identified above. The copyright notice and this permission notice must be retained in copies or substantial portions of those packages.

```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

其余许可证的完整文本保存在对应 npm 包的 `LICENSE`、`LICENCE`、`COPYING` 或 `NOTICE` 文件中。
