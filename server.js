import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname,'public', 'index.html'));
});

function zodiac(date) { 
  const m = date.getUTCMonth() + 1, d = date.getUTCDate(); 
  const cuts = [[1,20,'水瓶座'],[2,19,'魚座'],[3,21,'牡羊座'],[4,20,'牡牛座'],[5,21,'双子座'],[6,22,'蟹座'],[7,23,'獅子座'],[8,23,'乙女座'],[9,23,'天秤座'],[10,24,'蠍座'],[11,23,'射手座'],[12,22,'山羊座']]; 
  for (const [month, day, name] of cuts) if (m < month || (m === month && d < day)) return name; 
  return '山羊座'; 
}

function lifePath(date) { 
  let n = date.toISOString().slice(0,10).replaceAll('-','').split('').reduce((a,x) => a + Number(x), 0); 
  while (n > 9 && n !== 11 && n !== 22 && n !== 33) n = String(n).split('').reduce((a,x) => a + Number(x), 0); 
  return n; 
}

function hash(s) { 
  let n = 17; 
  for (const c of s) n = (n * 31 + c.charCodeAt(0)) >>> 0; 
  return n; 
}

function validateDate(s) { 
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; 
  const d = new Date(`${s}T00:00:00Z`); 
  return Number.isNaN(+d) || d.toISOString().slice(0,10) !== s ? null : d; 
}

app.post('/api/reading', (req, res) => {
  const { yourBirth, partnerBirth, yourCulture, partnerCulture } = req.body || {}; 
  const a = validateDate(yourBirth), b = validateDate(partnerBirth);
  if (!a || !b || !['日本','韓国'].includes(yourCulture) || !['日本','韓国'].includes(partnerCulture)) {
    return res.status(400).json({ error: '生年月日と文化圏を確認してください。' });
  }
  const za = zodiac(a), zb = zodiac(b), na = lifePath(a), nb = lifePath(b);
  const seed = hash([yourBirth, partnerBirth, yourCulture, partnerCulture].join('|'));
  const base = 62 + (seed % 30), scores = [base, 55 + (seed >>> 3) % 42, 52 + (seed >>> 5) % 45, 58 + (seed >>> 7) % 39, 50 + (seed >>> 9) % 47];
  const cultures = yourCulture === partnerCulture 
    ? `${yourCulture}の生活感覚を共有しやすい一方、察してほしい気持ちが重なると確認不足になりがち。` 
    : `${yourCulture}と${partnerCulture}の違いが、新しい発見につながりそう。連絡頻度や愛情表現の好みを言葉で確かめると安心です。`;
  
  const traits = {
    牡羊座:'まっすぐで行動が早い', 牡牛座:'誠実で心地よさを大切にする', 双子座:'会話上手で好奇心旺盛', 蟹座:'思いやり深く安心感を育てる',
    獅子座:'華やかで愛情表現が豊か', 乙女座:'細やかで相手をよく見ている', 天秤座:'調和上手でセンスが光る', 蠍座:'一途で深い信頼を求める',
    射手座:'自由で前向きな冒険家', 山羊座:'堅実で長期的な関係を築く', 水瓶座:'独創的で対等な関係を好む', 魚座:'共感力が高くロマンチスト'
  };

  res.json({
    you: { zodiac: za, number: na },
    partner: { zodiac: zb, number: nb },
    scores: { 恋愛: scores[0], 会話: scores[1], ときめき: scores[2], 信頼: scores[3], 将来性: scores[4] },
    summary: `${za}のあなた（${traits[za]}）と${zb}のお相手。数秘${na}と${nb}の組み合わせは、お互いのペースを知るほど魅力が育つ相性です。`,
    perspective: `相手からは「${traits[za]}で、そばにいると自分らしくいられる人」と映りやすそう。`,
    friction: `気持ちを伝えるタイミングや連絡のテンポに差が出るかも。推測で決めつけず、小さな希望を具体的に共有して。`,
    cultureNote: cultures,
    tips: ['相手の話を最後まで聞いてから、自分の希望も一つ伝える', '「いつか」ではなく日付を決めて次の楽しみを作る', '文化の違いは正解探しでなく、お互いの心地よさを聞く'],
    questions: ['相手といるとき、どんな瞬間に一番安心しますか？', '最近、相手に伝えられずにいる気持ちはありますか？', '二人で半年後に実現したいことは何ですか？']
  });
});

// AI個別鑑定エンドポイント
app.post(['/api/ai-analysis', '/api/deep-reading'], async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI個別鑑定には .env の OPENAI_API_KEY 設定が必要です。' });
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'あなたは温かく現実的な恋愛カウンセラーです。占いは娯楽として扱い、断定・文化的ステレオタイプ・相手の心理の決めつけを避けてください。日本語で、共感的かつ具体的に、300〜500字程度の個別鑑定を書いてください。診断結果と回答を踏まえ、良い点、気をつける点、次に試せる会話例を含めてください。' },
        { role: 'user', content: JSON.stringify(req.body) }
      ],
      max_tokens: 700
    });

    const text = result.choices[0]?.message?.content || '鑑定文を作成できませんでした。';
    res.json({ text, reading: text });
  } catch (err) {
    console.error('AI reading failed:', err.message);
    res.status(502).json({ error: 'AI鑑定を作成できませんでした。時間をおいて再度お試しください。' });
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Server is running at http://localhost:${port}`));