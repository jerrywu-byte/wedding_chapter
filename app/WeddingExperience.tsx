"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

type Axis = "story" | "spectacle" | "grandeur" | "nature";
type Stage = "welcome" | "profile" | "quiz" | "reveal" | "result";

type GuestProfile = {
  name: string;
  phone: string;
  weddingDate: string;
  dateUndecided: boolean;
  session: string;
  tables: string;
};

type QuizOption = { label: string; note: string; axis: Axis };
type QuizQuestion = { eyebrow: string; title: string; options: QuizOption[] };

const fixedQuestions: QuizQuestion[] = [
  {
    eyebrow: "第一幕 · 目光",
    title: "走進一個陌生空間，你最先被什麼留住？",
    options: [
      { label: "光落下的位置", note: "它像在暗示故事從哪裡開始", axis: "story" },
      { label: "一條意外的路徑", note: "忍不住想知道下一個轉角", axis: "spectacle" },
      { label: "空間給人的氣勢", note: "第一秒就決定了這一晚的份量", axis: "grandeur" },
      { label: "材質與空氣的溫度", note: "木頭、花香與自然光讓你放鬆", axis: "nature" },
    ],
  },
  {
    eyebrow: "第二幕 · 留白",
    title: "如果回憶只能留下其中一種質地，你會選？",
    options: [
      { label: "手寫信的柔軟", note: "真實的字句，比完美更動人", axis: "story" },
      { label: "揭開禮物的驚喜", note: "期待感讓每一秒都有戲", axis: "spectacle" },
      { label: "經典珠寶的重量", note: "值得被收藏，也經得起時間", axis: "grandeur" },
      { label: "曬過太陽的棉麻", note: "舒服、不造作，剛剛好的美", axis: "nature" },
    ],
  },
  {
    eyebrow: "第三幕 · 靠近",
    title: "門打開前的十秒，你希望自己正在做什麼？",
    options: [
      { label: "和身邊的人握一下手", note: "確認彼此都在，就足夠勇敢", axis: "story" },
      { label: "等一個完美提示", note: "音樂與光線要在那一刻同時發生", axis: "spectacle" },
      { label: "深呼吸，迎接所有目光", note: "這是屬於你們的大場面", axis: "grandeur" },
      { label: "聽見自己的呼吸", note: "保留一點安靜，才感受得到幸福", axis: "nature" },
    ],
  },
  {
    eyebrow: "第四幕 · 天色",
    title: "哪一種天空，最像你們的愛情？",
    options: [
      { label: "日出前的粉金", note: "溫柔，而且每天都願意重新開始", axis: "story" },
      { label: "城市入夜的霓虹", note: "變化、節奏，永遠不會無聊", axis: "spectacle" },
      { label: "煙火盛開的夜空", note: "重要的時刻，就該燦爛一次", axis: "grandeur" },
      { label: "雨後森林的薄霧", note: "安靜生長，是你們的默契", axis: "nature" },
    ],
  },
  {
    eyebrow: "第五幕 · 回聲",
    title: "婚禮結束後，你最想聽見朋友說哪一句？",
    options: [
      { label: "『這場婚禮真的很像你們。』", note: "每個細節都有兩個人的影子", axis: "story" },
      { label: "『完全猜不到下一段會發生什麼！』", note: "驚喜一個接著一個", axis: "spectacle" },
      { label: "『像看完一部大製作電影。』", note: "氣勢和情緒都抵達最高點", axis: "grandeur" },
      { label: "『大家都好放鬆、好舒服。』", note: "自在就是最好的款待", axis: "nature" },
    ],
  },
  {
    eyebrow: "最終幕 · 收藏",
    title: "多年以後，你最想從盒子裡拿出哪件紀念？",
    options: [
      { label: "交換過的誓言卡", note: "文字會把當時的心跳帶回來", axis: "story" },
      { label: "那天的流程手稿", note: "每一個機關背後都是你們的巧思", axis: "spectacle" },
      { label: "傳承下去的戒指", note: "它見證一個家正式開始", axis: "grandeur" },
      { label: "捧花裡的一片乾燥葉", note: "簡單的東西，反而最有溫度", axis: "nature" },
    ],
  },
];

const branchQuestions: Record<Axis, QuizQuestion[]> = {
  story: [
    {
      eyebrow: "分支篇章 · 心的筆跡",
      title: "如果賓客只能帶走一個瞬間，你希望是哪一幕？",
      options: [
        { label: "誓言說到一半的眼神", note: "沒有排練，卻最像你們", axis: "story" },
        { label: "驚喜揭曉的那一秒", note: "所有人同時屏住呼吸", axis: "spectacle" },
        { label: "全場舉杯的壯闊畫面", note: "祝福在同一刻匯聚", axis: "grandeur" },
        { label: "家人自在笑成一團", note: "沒有鏡頭感，只有真實", axis: "nature" },
      ],
    },
    {
      eyebrow: "分支篇章 · 回聲",
      title: "哪一種聲音，會讓你立刻回到婚禮那天？",
      options: [
        { label: "輕聲讀出的誓言", note: "一句話就足以讓時間停下", axis: "story" },
        { label: "音樂切換前的倒數", note: "知道驚喜正要開始", axis: "spectacle" },
        { label: "門開時響起的掌聲", note: "那是被世界見證的聲音", axis: "grandeur" },
        { label: "餐桌旁自然的笑聲", note: "舒服，比完美更難忘", axis: "nature" },
      ],
    },
    {
      eyebrow: "分支篇章 · 留光",
      title: "如果只能把最後一束光留給一處，你會照亮？",
      options: [
        { label: "寫著兩個名字的信", note: "故事從文字裡慢慢展開", axis: "story" },
        { label: "尚未揭曉的入口", note: "下一幕值得被期待", axis: "spectacle" },
        { label: "承接誓言的主舞台", note: "重要時刻需要被隆重看見", axis: "grandeur" },
        { label: "家人坐著的那張桌", note: "所有幸福都從這裡長出來", axis: "nature" },
      ],
    },
  ],
  spectacle: [
    {
      eyebrow: "分支篇章 · 未知",
      title: "謝幕以前，你還想藏著哪一張牌？",
      options: [
        { label: "一段從未說過的話", note: "安靜，卻足以翻動全場情緒", axis: "story" },
        { label: "一次完全意外的登場", note: "沒有人能猜到下一秒", axis: "spectacle" },
        { label: "全場燈光同時亮起", note: "讓氣氛抵達最高點", axis: "grandeur" },
        { label: "一首大家自然合唱的歌", note: "沒有安排，反而最動人", axis: "nature" },
      ],
    },
    {
      eyebrow: "分支篇章 · 節奏",
      title: "你希望整場婚禮，像哪一種節奏？",
      options: [
        { label: "一封分章讀完的長信", note: "慢慢靠近故事的核心", axis: "story" },
        { label: "一張讓人猜不到的歌單", note: "每次轉場都有新鮮感", axis: "spectacle" },
        { label: "一首層層推進的交響曲", note: "最後留下盛大的餘韻", axis: "grandeur" },
        { label: "一場跟著呼吸前進的散步", note: "舒服，不需要趕場", axis: "nature" },
      ],
    },
    {
      eyebrow: "分支篇章 · 驚嘆",
      title: "你最期待大家在哪一秒發出驚呼？",
      options: [
        { label: "聽見你們真正的故事", note: "原來那些細節都有原因", axis: "story" },
        { label: "第二次進場突然現身", note: "意想不到的位置最有趣", axis: "spectacle" },
        { label: "大門開啟、全場看見你們", note: "主角登場就該有份量", axis: "grandeur" },
        { label: "夕陽或自然光剛好落下", note: "最美的畫面不一定能安排", axis: "nature" },
      ],
    },
  ],
  grandeur: [
    {
      eyebrow: "分支篇章 · 份量",
      title: "對你而言，真正的盛大更接近哪一種感受？",
      options: [
        { label: "每個人都聽懂你們的故事", note: "情感讓這一天有了重量", axis: "story" },
        { label: "空間一次次改變模樣", note: "驚喜讓賓客忘記時間", axis: "spectacle" },
        { label: "所有目光都為承諾停下", note: "儀式感是認真的證明", axis: "grandeur" },
        { label: "每位賓客都被好好照顧", note: "舒服的款待也是一種氣派", axis: "nature" },
      ],
    },
    {
      eyebrow: "分支篇章 · 登場",
      title: "踏上走道的時候，你希望時間怎麼流動？",
      options: [
        { label: "慢到能看清重要的眼神", note: "每一步都在回望故事", axis: "story" },
        { label: "跟著光影突然加速", note: "讓進場像電影轉場", axis: "spectacle" },
        { label: "在掌聲中被拉得很長", note: "好好享受唯一的一次", axis: "grandeur" },
        { label: "像平常牽手那樣自然", note: "不表演，也足夠動人", axis: "nature" },
      ],
    },
    {
      eyebrow: "分支篇章 · 象徵",
      title: "哪件事最能代表『我們正式成為一家人』？",
      options: [
        { label: "把誓言親口交給彼此", note: "承諾需要被說出來", axis: "story" },
        { label: "共同完成一場驚喜", note: "默契藏在每個機關裡", axis: "spectacle" },
        { label: "在眾人面前交換戒指", note: "經典儀式永遠不會過時", axis: "grandeur" },
        { label: "兩邊家人坐在一起聊天", note: "家的形狀在那刻出現", axis: "nature" },
      ],
    },
  ],
  nature: [
    {
      eyebrow: "分支篇章 · 呼吸",
      title: "一場讓你覺得舒服的婚禮，最需要什麼？",
      options: [
        { label: "每個細節都有自己的故事", note: "少一點裝飾，多一點真心", axis: "story" },
        { label: "偶爾出現不按牌理的驚喜", note: "自然不代表沒有玩心", axis: "spectacle" },
        { label: "保留完整而莊重的儀式", note: "從容也可以很有份量", axis: "grandeur" },
        { label: "光線、空氣與自在的距離", note: "身體放鬆，情緒才會靠近", axis: "nature" },
      ],
    },
    {
      eyebrow: "分支篇章 · 花與光",
      title: "你希望花與光在婚禮裡扮演什麼角色？",
      options: [
        { label: "陪襯故事，不搶走目光", note: "真正的主角始終是人", axis: "story" },
        { label: "在不同時刻突然變換", note: "空間也能參與表演", axis: "spectacle" },
        { label: "構成一幅完整的大畫面", note: "一眼就看見盛典的氣勢", axis: "grandeur" },
        { label: "像本來就生長在那裡", note: "沒有刻意痕跡最耐看", axis: "nature" },
      ],
    },
    {
      eyebrow: "分支篇章 · 慢下來",
      title: "哪一個片刻，最值得讓時間慢下來？",
      options: [
        { label: "讀出只屬於彼此的話", note: "讓情緒完整抵達", axis: "story" },
        { label: "驚喜發生前的安靜", note: "期待本身就是體驗", axis: "spectacle" },
        { label: "全場共同見證的那一刻", note: "讓承諾留下清楚的重量", axis: "grandeur" },
        { label: "和親友沒有安排的相處", note: "最自然的片段最接近幸福", axis: "nature" },
      ],
    },
  ],
};

const equipmentQuestion: QuizQuestion = {
  eyebrow: "最終幕 · 場景偏好",
  title: "如果只能保留一項場景亮點，你最想選哪一個？",
  options: [
    { label: "投影幕與第二舞台", note: "讓影像、誓言或二進有更多表現空間", axis: "story" },
    { label: "星光走道與空中纜車", note: "進場本身就是全場最期待的一幕", axis: "spectacle" },
    { label: "天降鉛錘驚喜", note: "讓小禮物或橋段從空中登場", axis: "grandeur" },
    { label: "色系與整體氛圍", note: "材質、光線與舒適感比設備更重要", axis: "nature" },
  ],
};

const personalities: Record<Axis, { name: string; en: string; description: string; vow: string }> = {
  story: {
    name: "柔光敘事者",
    en: "THE TENDER STORYTELLER",
    description: "你們在意的不是排場，而是每個細節是否真的屬於兩個人。誓言、眼神與相處的痕跡，會讓婚禮像一封慢慢展開的情書。",
    vow: "把重要的話，留在光最溫柔的地方。",
  },
  spectacle: {
    name: "星幕策展家",
    en: "THE MOMENT CURATOR",
    description: "你們天生懂得製造期待。光影、音樂、進場與驚喜環環相扣，婚禮不是照表操課，而是一場只演一次的沉浸式作品。",
    vow: "讓每一次心跳，都有值得期待的下一幕。",
  },
  grandeur: {
    name: "盛典夢想家",
    en: "THE GRAND DREAMER",
    description: "你們相信重要的承諾值得被隆重看見。經典、氣勢與儀式感不是炫耀，而是對這段關係最認真的致敬。",
    vow: "以一場盛典，宣告一生的選擇。",
  },
  nature: {
    name: "森光共鳴者",
    en: "THE QUIET HARMONIST",
    description: "你們偏愛舒服、真實且能自在呼吸的相聚。自然材質、暖光與親友的笑聲，會比繁複安排更接近幸福的樣子。",
    vow: "不追趕完美，只收藏真實的溫度。",
  },
};

const halls = [
  { name: "法蘿", floor: "1F", min: 10, max: 20, axes: ["story", "nature"], feature: "空中閣樓可作第二舞台或二進出場位置", equipment: "投影幕 2 組 · 空中閣樓" },
  { name: "沐曦", floor: "2F", min: 6, max: 23, axes: ["nature", "story"], feature: "米白奶茶色系 · 溫潤典雅", equipment: "米白奶茶色系" },
  { name: "雅諾", floor: "2F", min: 5, max: 13, axes: ["story"], feature: "法式新古典 · 小型精緻婚禮", equipment: "120 吋電視 · 無 LED 螢幕" },
  { name: "亞瑟", floor: "3F", min: 9, max: 29, axes: ["grandeur", "story"], feature: "內斂歐式 · 經典儀式感", equipment: "天降鉛錘 15 個" },
  { name: "伊麗莎白", floor: "3F", min: 5, max: 20, axes: ["story", "grandeur"], feature: "夢幻童話 · 英式優雅", equipment: "天降鉛錘 10 個" },
  { name: "愛丁堡", floor: "3F", min: 15, max: 37, axes: ["grandeur", "spectacle"], feature: "英倫城堡 · 星光大道", equipment: "星光走道 · 鉛錘 20 個" },
  { name: "格林", floor: "3F", min: 5, max: 13, axes: ["nature"], feature: "綠意木質 · 自然婚禮", equipment: "天降鉛錘 10 個" },
  { name: "紫艷好事", floor: "5F", min: 9, max: 30, axes: ["spectacle", "story"], feature: "都會時尚 · 派對婚禮", equipment: "星光走道 · 空中纜車 · 鉛錘 25 個" },
  { name: "紫艷喜事", floor: "5F", min: 15, max: 38, axes: ["spectacle", "grandeur"], feature: "時尚派對 · 大型驚喜", equipment: "星光走道 · 空中纜車 · 鉛錘 30 個" },
  { name: "紫艷盛事", floor: "5F", min: 10, max: 30, axes: ["spectacle", "grandeur"], feature: "都會時尚 · 沉浸光影", equipment: "星光走道 · 空中纜車 · 鉛錘 25 個" },
  { name: "紫艷盛事合併廳", floor: "5F", min: 42, max: 100, axes: ["spectacle", "grandeur"], feature: "大型合併廳 · 都會時尚盛宴", equipment: "星光走道 · 空中纜車 · 鉛錘依合併方式調整" },
  { name: "世紀", floor: "6F", min: 20, max: 50, axes: ["grandeur", "spectacle"], feature: "皇家盛典 · 巨星登場", equipment: "星光走道 · 空中纜車 · 鉛錘 40 個" },
  { name: "盛典", floor: "6F", min: 21, max: 52, axes: ["grandeur", "spectacle"], feature: "氣派宮廷 · 大型盛宴", equipment: "星光走道 · 空中纜車 · 鉛錘 40 個" },
  { name: "世紀盛典廳", floor: "6F", min: 42, max: 100, axes: ["grandeur", "spectacle"], feature: "世紀與盛典合併 · 百桌大型盛宴", equipment: "星光走道 · 空中纜車 · 鉛錘 80 個" },
] as const;

const initialProfile: GuestProfile = {
  name: "",
  phone: "",
  weddingDate: "",
  dateUndecided: false,
  session: "",
  tables: "",
};

function RingsIcon() {
  return <span className="rings-icon" aria-hidden="true"><i /><i /></span>;
}

const versionNames = {
  khaki: "鎏金篇章",
  moonlight: "月光詩境版",
  mist: "柔霧詩箋版",
  lively: "彩霧歡聚版",
  romantic: "霧玫誓言版",
  artsy: "紙上微光版",
} as const;

function getDominantAxis(values: Axis[]) {
  const totals: Record<Axis, number> = { story: 0, spectacle: 0, grandeur: 0, nature: 0 };
  values.forEach((value) => totals[value]++);
  return (Object.keys(totals) as Axis[]).sort((a, b) => totals[b] - totals[a])[0];
}

function equipmentFit(text: string, preference?: Axis) {
  if (!preference) return 0;
  if (preference === "story" && /(投影幕|閣樓|電視)/.test(text)) return 16;
  if (preference === "spectacle" && /(星光走道|空中纜車)/.test(text)) return 16;
  if (preference === "grandeur" && /鉛錘/.test(text)) return 16;
  if (preference === "nature" && /(奶茶|木質|自然|色系)/.test(text)) return 16;
  return 0;
}

export default function WeddingExperience({ theme }: { theme: keyof typeof versionNames }) {
  const [stage, setStage] = useState<Stage>("welcome");
  const [profile, setProfile] = useState<GuestProfile>(initialProfile);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Axis[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const branchAxis = useMemo(() => getDominantAxis(answers.slice(0, 3)), [answers]);
  const questions = useMemo(
    () => [...fixedQuestions.slice(0, 3), ...branchQuestions[branchAxis], equipmentQuestion],
    [branchAxis],
  );

  const scores = useMemo(() => {
    const value: Record<Axis, number> = { story: 0, spectacle: 0, grandeur: 0, nature: 0 };
    answers.forEach((answer) => value[answer]++);
    return value;
  }, [answers]);

  const primaryAxis = (Object.keys(scores) as Axis[]).sort((a, b) => scores[b] - scores[a])[0];
  const personality = personalities[primaryAxis];

  const recommendations = useMemo(() => {
    const tables = Number(profile.tables || 0);
    return halls
      .filter((hall) => tables >= hall.min && tables <= hall.max)
      .map((hall) => {
        const midpoint = (hall.min + hall.max) / 2;
        const halfRange = (hall.max - hall.min) / 2 + 1;
        const closeness = Math.max(0, 1 - Math.abs(tables - midpoint) / halfRange);
        const capacity = 32 + Math.round(closeness * 12);
        const character = hall.axes.reduce((sum, axis) => sum + scores[axis] * 6, 0);
        const equipment = equipmentFit(`${hall.feature} ${hall.equipment}`, answers[6]);
        return { ...hall, match: Math.min(98, 10 + capacity + character + equipment) };
      })
      .sort((a, b) => b.match - a.match)
      .slice(0, 3);
  }, [answers, profile.tables, scores]);

  function submitProfile(event: FormEvent) {
    event.preventDefault();
    setStage("quiz");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseAnswer(axis: Axis) {
    const next = [...answers.slice(0, questionIndex), axis];
    setAnswers(next);
    if (questionIndex < questions.length - 1) {
      window.setTimeout(() => setQuestionIndex((current) => current + 1), 220);
    } else {
      setStage("reveal");
      window.setTimeout(() => {
        setStage("result");
        void saveVisit(next);
      }, 1800);
    }
  }

  async function saveVisit(finalAnswers: Axis[]) {
    setSaveState("saving");
    const resultScores: Record<Axis, number> = { story: 0, spectacle: 0, grandeur: 0, nature: 0 };
    finalAnswers.forEach((answer) => resultScores[answer]++);
    const resultAxis = (Object.keys(resultScores) as Axis[]).sort((a, b) => resultScores[b] - resultScores[a])[0];
    try {
      const response = await fetch("/api/visits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...profile,
          personality: resultAxis,
          answers: finalAnswers,
          scores: resultScores,
          version: theme,
        }),
      });
      if (!response.ok) throw new Error("save failed");
      setSaveState("saved");
    } catch {
      setSaveState("offline");
    }
  }

  function restart() {
    setStage("welcome");
    setProfile(initialProfile);
    setQuestionIndex(0);
    setAnswers([]);
    setSaveState("idle");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (stage === "welcome") {
    if (theme === "moonlight") return <MoonlightWelcome onStart={() => setStage("profile")} />;
    if (theme === "mist") return <MistWelcome onStart={() => setStage("profile")} />;
    return (
      <main className={`welcome-shell theme-${theme}`}>
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <header className="site-header">
          <div className="brand"><span className="brand-mark">✦</span><span>月光詩人</span></div>
          <Link className="brand-sub" href="/">{versionNames[theme]} · 切換六版</Link>
        </header>

        <section className="welcome-grid">
          <div className="welcome-copy">
            <p className="eyebrow">YOUR WEDDING CHAPTER · 01</p>
            <h1>找到屬於<br />你們的婚禮篇章</h1>
            <p className="lead">循著直覺回答幾個問題，我們會讀出你們的婚禮性格，並找到最適合故事發生的廳房。</p>
            <button className="primary-cta" onClick={() => setStage("profile")}>
              <span>開始探索</span><span className="cta-star">✦</span>
            </button>
            <div className="welcome-meta"><span>約 3 分鐘</span><i /><span>沒有標準答案</span><i /><span>專屬廳房推薦</span></div>
          </div>

          <div className="card-stage" aria-hidden="true">
            <div className="back-card back-card-one"><span>VOW</span></div>
            <div className="back-card back-card-two"><span>LOVE</span></div>
            <div className="hero-card">
              <div className="hero-card-top"><span>月光詩人</span><span>✦</span></div>
              <div className="arch arch-one" />
              <div className="arch arch-two" />
              <div className="rings-wrap"><RingsIcon /></div>
              <p>THE WEDDING CHAPTER</p>
              <strong>屬於你們的故事<br />正在展開</strong>
              <div className="ribbon-line" />
            </div>
          </div>
        </section>

        <div className="step-ribbon" aria-label="體驗流程">
          <span><b>01</b> 填寫相遇資訊</span><span><b>02</b> 回答心靈提問</span><span><b>03</b> 開啟婚禮篇章</span>
        </div>
      </main>
    );
  }

  if (stage === "profile") {
    return (
      <main className={`experience-shell profile-shell theme-${theme}`}>
        <ExperienceHeader step="01 / 03" onBack={() => setStage("welcome")} />
        <section className="form-layout">
          <div className="form-intro">
            <p className="eyebrow">BEFORE THE STORY BEGINS</p>
            <h1>先留下你們的<br />相遇座標</h1>
            <p>這些資料會交給接待你們的婚禮顧問，日期還沒決定也完全沒關係。</p>
            <div className="mini-vow"><RingsIcon /><span>每一段故事，都從兩個名字開始。</span></div>
          </div>
          <form className="guest-form" onSubmit={submitProfile}>
            <label><span>怎麼稱呼你？</span><input required autoComplete="name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="例：陳小姐" /></label>
            <label><span>聯絡電話</span><input required inputMode="tel" autoComplete="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="09xx-xxx-xxx" /></label>
            <div className="date-field">
              <label><span>預計婚禮日期</span><input type="text" inputMode="numeric" autoComplete="off" placeholder="yyyy/mm/dd" aria-label="預計婚禮日期，格式為年／月／日" disabled={profile.dateUndecided} required={!profile.dateUndecided} value={profile.weddingDate} maxLength={10} onChange={(e) => { const digits=e.target.value.replace(/\D/g,"").slice(0,8); const formatted=[digits.slice(0,4),digits.slice(4,6),digits.slice(6,8)].filter(Boolean).join("/"); setProfile({ ...profile, weddingDate: formatted }); }} /></label>
              <label className="check-row"><input type="checkbox" checked={profile.dateUndecided} onChange={(e) => setProfile({ ...profile, dateUndecided: e.target.checked, weddingDate: "" })} /><span>日期還沒確定</span></label>
            </div>
            <fieldset><legend>偏好的婚宴時段</legend><div className="choice-row">{["午宴", "晚宴", "都可以"].map((item) => <label className={profile.session === item ? "selected" : ""} key={item}><input required type="radio" name="session" value={item} checked={profile.session === item} onChange={(e) => setProfile({ ...profile, session: e.target.value })} /><span>{item}</span></label>)}</div></fieldset>
            <label><span>預計桌數</span><div className="input-suffix"><input required min="1" max="120" type="number" inputMode="numeric" value={profile.tables} onChange={(e) => setProfile({ ...profile, tables: e.target.value })} placeholder="例：20" /><b>桌</b></div></label>
            <button className="form-submit" type="submit"><span>進入婚禮性格測驗</span><span>→</span></button>
            <p className="privacy-note">資料僅供典華婚禮顧問與你聯繫及提供廳房建議使用。</p>
          </form>
        </section>
      </main>
    );
  }

  if (stage === "quiz") {
    const question = questions[questionIndex];
    return (
      <main className={`experience-shell quiz-shell theme-${theme}`}>
        <ExperienceHeader step={`02 / 03 · ${String(questionIndex + 1).padStart(2, "0")}`} onBack={() => questionIndex ? setQuestionIndex(questionIndex - 1) : setStage("profile")} />
        <div className="progress-track"><span style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} /></div>
        <section className="quiz-layout" key={questionIndex}>
          <div className="question-number"><span>{String(questionIndex + 1).padStart(2, "0")}</span><i /></div>
          <div className="question-content">
            <p className="eyebrow">{question.eyebrow}</p>
            <h1>{question.title}</h1>
            <p className="question-hint">不要想太久，第一個讓你有感覺的答案，通常最接近你。</p>
            <div className="answers-grid">
              {question.options.map((option, index) => (
                <button key={option.label} className={answers[questionIndex] === option.axis ? "answer-card active" : "answer-card"} onClick={() => chooseAnswer(option.axis)}>
                  <span className="answer-letter">{String.fromCharCode(65 + index)}</span><span><strong>{option.label}</strong><small>{option.note}</small></span><span className="answer-arrow">↗</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (stage === "reveal") {
    return (
      <main className={`reveal-shell theme-${theme}`}>
        <div className="reveal-orbit orbit-one" /><div className="reveal-orbit orbit-two" />
        <div className="reveal-center"><RingsIcon /><p>正在展開你們的婚禮篇章</p><span>讀取光線、節奏與心的方向⋯</span></div>
      </main>
    );
  }

  return (
    <main className={`result-shell theme-${theme}`}>
      <header className="result-header"><div className="brand"><span className="brand-mark">✦</span><span>月光詩人</span></div><span>{saveState === "saved" ? "✓ 結果已為你保存" : saveState === "saving" ? "正在保存結果⋯" : saveState === "offline" ? "結果已顯示，顧問可現場協助記錄" : ""}</span></header>
      <section className="result-hero">
        <div className="result-title"><p className="eyebrow">YOUR WEDDING PERSONALITY</p><span className="result-index">03 / 03</span><h1>{profile.name}，你們是<br /><em>{personality.name}</em></h1><p>{personality.description}</p></div>
        <article className={`personality-card axis-${primaryAxis}`}>
          <div className="personality-card-top"><span>月光詩人</span><span>NO. {String(new Date().getMonth() + 1).padStart(2, "0")}</span></div>
          <div className="personality-rings"><RingsIcon /></div>
          <p>{personality.en}</p><h2>{personality.name}</h2><blockquote>「{personality.vow}」</blockquote>
          <div className="score-bars">{(Object.keys(scores) as Axis[]).map((axis) => <span key={axis} style={{ height: `${28 + scores[axis] * 10}px` }} />)}</div>
        </article>
      </section>

      <section className="recommend-section">
        <div className="section-heading"><div><p className="eyebrow">CURATED FOR YOUR STORY</p><h2>最適合你們的廳房篇章</h2></div><p>先依 {profile.tables} 桌容量排除不適用空間，再依婚禮性格與設備偏好選出最多三個推薦。</p></div>
        <div className="hall-grid">{recommendations.length === 0 ? (
          <div className="no-hall-match"><span>✦</span><h3>目前沒有符合 {profile.tables} 桌容量的廳房</h3><p>我們不會推薦超出容納桌數的空間，請由婚禮顧問協助確認其他安排。</p></div>
        ) : recommendations.map((hall, index) => (
          <article className="hall-card" key={hall.name}>
            <div className="hall-visual"><span>{hall.floor}</span><b>{String(index + 1).padStart(2, "0")}</b><div className="hall-arch" /><RingsIcon /></div>
            <div className="hall-copy"><div><p>推薦契合度 {hall.match}%</p><h3>{hall.name}</h3></div><span className="match-badge">{index === 0 ? "首選" : "推薦"}</span><p>{hall.feature}</p><ul><li>可容納 {hall.min}–{hall.max} 桌</li><li>{hall.equipment}</li></ul></div>
          </article>
        ))}</div>
      </section>

      <section className="result-footer"><div><p className="eyebrow">THE NEXT CHAPTER</p><h2>把推薦帶給婚禮顧問，<br />一起走進真正的場景。</h2></div><button onClick={restart}>重新探索一次 <span>↻</span></button></section>
    </main>
  );
}

function ExperienceHeader({ step, onBack }: { step: string; onBack: () => void }) {
  return <header className="experience-header"><button onClick={onBack} aria-label="返回上一頁">←</button><div className="brand"><span className="brand-mark">✦</span><span>月光詩人</span></div><span>{step}</span></header>;
}

function MoonlightWelcome({ onStart }: { onStart: () => void }) {
  return (
    <main className="moonlight-welcome theme-moonlight">
      <header className="variant-header">
        <div className="brand"><span className="moon-symbol">☾</span><span>月光詩人</span></div>
        <div className="variant-progress"><span>月光詩境版</span><i /><i /><i /></div>
      </header>
      <section className="moonlight-hero">
        <div className="moonlight-copy">
          <p className="eyebrow">A WEDDING WRITTEN IN MOONLIGHT</p>
          <h1>找到屬於你們的<br />婚禮篇章</h1>
          <p>讓月光照見你們真正嚮往的婚禮，從直覺出發，遇見最契合的典華廳房。</p>
          <button onClick={onStart}>開始探索 <span>✦</span></button>
          <div className="moonlight-notes"><span>7 道分支提問</span><span>14 間廳房資料</span><span>專屬推薦</span></div>
        </div>
        <div className="moonlight-panel">
          <div className="panel-progress"><span>體驗預覽</span><b>01 / 07</b></div>
          <p>當你們想像婚禮的那一天，<br />最希望被什麼氛圍包圍？</p>
          <div className="moonlight-preview-options"><span>靜謐月光<small>浪漫 · 私密</small></span><span>溫暖燈火<small>溫度 · 歡聚</small></span><span>自然之境<small>自由 · 純粹</small></span></div>
        </div>
      </section>
    </main>
  );
}

function MistWelcome({ onStart }: { onStart: () => void }) {
  return (
    <main className="mist-welcome theme-mist">
      <header className="variant-header">
        <div className="brand"><span className="moon-symbol">☾</span><span>月光詩人</span></div>
        <span className="mist-version">柔霧詩箋版</span>
      </header>
      <section className="mist-hero">
        <div className="mist-copy">
          <p className="eyebrow">WEDDING PERSONALITY QUIZ</p>
          <h1>找到屬於你們的<br />婚禮篇章</h1>
          <p>透過直覺提問，探索你們的愛情故事，遇見最契合的典華婚禮廳房。</p>
          <button onClick={onStart}>開始探索 <span>→</span></button>
          <div className="mist-notes"><span>◷ 約 3 分鐘</span><span>♢ 無標準答案</span><span>✦ 即時推薦</span></div>
        </div>
        <div className="mist-stack">
          <div className="mist-paper paper-back-two" />
          <div className="mist-paper paper-back-one" />
          <div className="mist-paper paper-front">
            <div className="mist-question-count"><b>01</b><span>/ 07</span></div>
            <h2>閉上眼睛，<br />你們的婚禮最像哪一幕？</h2>
            <span className="mist-answer">○　浪漫的月光晚宴，星光灑落</span>
            <span className="mist-answer selected">✓　溫暖的家人時光，真摯動人</span>
            <span className="mist-answer">○　自然的戶外儀式，清新自在</span>
            <div className="mist-paper-progress"><i /><span>→</span></div>
          </div>
        </div>
      </section>
    </main>
  );
}
