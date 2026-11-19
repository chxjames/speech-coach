# 评分怎么算

两个文件：`js/prosody.js` 出指标，`js/score.js` 把指标换成分数。
这里列出全部公式，抄的就是代码。

记号：`gauss(x, μ, σ, max) = max · exp(−((x−μ)/σ)²)`，`clamp(x,a,b)` 把 x 夹在 [a,b]。

## 权重

| 维度 | 对镜头 `camera` | 讲台 `stage` |
|---|---|---|
| 内容与结构 content | 25 | 25 |
| 语速与节奏 pacing | 20 | 20 |
| 语调与表现力 prosody | 15 | 20 |
| 清晰度 clarity | 15 | 15 |
| 身体语言 body | 5 | 15 |
| 制作与镜头 production | 20 | 5 |

讲台形态里，镜头是专业的、身体在画面里更重要，所以身体 15、制作 5；
对镜头形态反过来——机位你自己管，所以制作扣得多，身体看得少。

## 节奏（pacing）

```
rateScore  = gauss(wpm, 150, 40, 10)          // 净语速，目标 150 wpm
pauseScore = gauss(pauseAvg, 1.2, 0.9, 10)    // 平均停顿 1.2 秒最舒服
if 停顿次数 < 5: pauseScore ×= 0.6            // 太少说明没换气机会
longPenalty = clamp((longest − 12) / 6, 0, 1) × 3
pacing = max(0, rateScore + pauseScore − longPenalty)
```

`wpm` 是净语速 = 词数 ÷ 说话总时长（不含句子之间的停顿）。
`longest` 是单句最长秒数，超过 12 秒开始扣，18 秒扣满 3 分。

## 语调（prosody）

```
rangeScore = gauss(rangeSt, 10.5, 4, 6)       // 音域，10.5 半音最好
sdScore    = gauss(segSdSt, 3, 1.5, 8)        // 句间音高的标准差
finalScore = 6 × clamp(fallShare / 0.45, 0, 1)
               × (1 − 0.6 × clamp((riseShare − 0.35) / 0.35, 0, 1))
prosody = rangeScore + sdScore + finalScore
```

`fallShare` / `riseShare` 是句尾下坠 / 上扬占全部句子的比例。
陈述句句尾该往下落：落的比例到 45% 给满分；上扬超过 35% 开始扣。

## 清晰（clarity）

```
articScore = gauss(articWpm, 240, 55, 8)      // 发音速率，240 wpm 附近最好
cleanScore = gauss(fillerRate, 1.5, 2, 7)     // 软化词密度，每百词 1.5 个最好
clarity = articScore + cleanScore
```

`articWpm` = 词数 ÷ 真正发声的时长（把句子内部的静音也去掉），只反映"开口时能有多快"。
`fillerRate` 统计 like / just / actually / basically / really / pretty，单位是每 100 词。

## 身体（body）

```
body = W.body × clamp(motion / 10, 0, 1)
```

`motion` 是 160×90 灰度图逐帧差的平均值（0–255 尺度）。
参考值：专业对镜头演讲者 9–10，坐在那里不动 2–3。

## 制作（production）

自动部分最多 12 分，三等分给三项：

```
resScore = 4 × clamp(√(宽×高) / 720, 0, 1)
bitScore = 4 × clamp((码率kbps / 2000)^0.6, 0, 1)
expScore = 4 × exp(−((中位亮度 − 115) / 50)²)
auto = resScore + bitScore + expScore
production = auto + 构图滑杆（对镜头 0–8，讲台 0）
```

构图和灯光（天花板占多少、顶灯是否逆光、手有没有进画）自动看不出来，
所以留给滑杆。开源的检测器也能做，但那要再下一个模型，先不做。

## 这些 μ 是怎么定的

`150 wpm`、`1.2 s`、`10.5 半音`、`240 wpm`、`1.5 /100 词` 不是论文数，是拿
7 段视频校准出来的：Jobs 斯坦福演讲、Watson 联合国演讲、一位专业讲解类 up 主、
一位学生、一节 Zoom 课、两段自己的录像。校准过程写在
`../评分标准v2与样本对比.md`。

**它不是标准答案。** 想让分数更贴合某一种场合（课堂讲演、面试、路演），
改 `js/score.js` 里的这几个数就行，改完刷新页面立刻生效。
