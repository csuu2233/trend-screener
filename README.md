# 四点趋势 · 多市场选股器

GitHub Pages 展示 A 股、美股与加密市场的四个上涨候选池，只显示入选标的。点击标的可查看主、次周期 a/b/c/d 收盘价、近5根最低价、形态、分数、行情日期与隔离状态。页面同时显示实际扫描覆盖与失败数。

## 策略口径

四池分别为日线/60分钟、周线/日线、月线/周线、季线/月线。主、次周期均用最近连续4根K线收盘价 a、b、c、d 判断：c>a、d>b、d>近5根最低价。次周期从主周期 a 点所在周期起点开始计算，并须命中阳阴阳、四种实体大小排列或四连阳。此口径对应原“四点趋势股票池”的实际运行代码；四池判定不使用 ZigZag。

A 股沿用实际生效的行情隔离：近20日平均成交额至少5000万元、价格至少2元；近5/20日涨幅不超过30%/50%、近20日平均换手不超过15%、近10日按9.8%近似识别的涨停少于2次。ST、利润、审计和市值数据未接入，因此不宣称已核验。美股和加密不套用 A 股隔离。原分数公式只用于排序或展示，高分不代表趋势更强。

## 数据范围

- A 股：仓库中的中证1000与中证2000成分股快照；baostock 前复权日线和60分钟线。成分名单需人工替换以更新。
- 美股：data/us_core.json 中明确列出的30只大盘核心股；Yahoo Finance 日线和60分钟线。数据源可能限流，失败数会显示。
- 加密：每次从 CoinGecko 读取市值前100，排除常见稳定币，只扫描在 Binance 有 USDT 现货K线的币。实际覆盖数量可能少于100。

## 本地运行

1. 建立 Python 3.11 虚拟环境并安装 requirements.txt。
2. 执行 python build.py --market crypto；也可选 ashare、us 或 all。
3. 执行 python -m http.server 8000 --directory site，打开 http://localhost:8000。

第一次 A 股全量抓取较久。云端将3000只股票分成10个批次并行抓取，全部完成后合并发布；后续每批使用 GitHub Actions 缓存增量更新。运行不需要交易账户。

## 发布与手动更新

将仓库 Pages 发布源设为 GitHub Actions。推送 main 后由 Publish website 工作流发布 site 目录；Scan markets and publish Pages 工作流按市场定时扫描并发布。网页的“更新数据”按钮可使用仅授权本仓库、具备 Actions 写入权限的 Fine-grained GitHub Token 启动扫描；Token 只保存在当前页面内存中。也可到仓库 Actions → Scan markets and publish Pages → Run workflow 无 Token 手动运行。

GitHub Pages 是静态站点，从点击更新到后台扫描并重新部署有延迟。请以页面显示的生成时间、逐只行情日期与覆盖数量判断新鲜度。本工具只提供候选池，不提供交易指令。
