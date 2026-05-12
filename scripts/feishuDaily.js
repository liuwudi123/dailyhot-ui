import axios from 'axios';
import * as cheerio from 'cheerio';

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const CHAT_ID = process.env.FEISHU_DEFAULT_CHAT_ID;

const LINGVA_INSTANCES = ['https://lingva.ml', 'https://translate.garudalinux.org'];

async function getTenantAccessToken() {
    try {
        const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
            app_id: APP_ID,
            app_secret: APP_SECRET
        });
        if (res.data.code === 0) return res.data.tenant_access_token;
        throw new Error(res.data.msg);
    } catch (e) {
        console.error("Token Error:", e.message);
        return null;
    }
}

async function fetchWSCN() {
    try {
        const res = await axios.get('https://api-prod.wallstcn.com/v1/it/newsflash?channel=global-lib&limit=5', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return res.data.data.items.map(v => ({
            title: v.content_text.replace(/<[^>]+>/g, '').slice(0, 100).trim() + '...',
            url: v.uri || 'https://wallstreetcn.com/newsflash'
        }));
    } catch (e) { return []; }
}

async function fetchCLS() {
    try {
        const res = await axios.get('https://www.cls.cn/nodeapi/telegraphList?rn=5&os=web', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return res.data.data.roll_data.map(v => ({
            title: (v.title || v.content).slice(0, 100).trim() + '...',
            url: `https://www.cls.cn/detail/${v.id}`
        }));
    } catch (e) { return []; }
}

async function fetchTwitter(user = 'BreakingNews') {
    try {
        // 使用 RSSHub 公共实例获取 Twitter 信息
        const res = await axios.get(`https://rsshub.app/twitter/user/${user}`, { timeout: 5000 });
        const $ = cheerio.load(res.data, { xmlMode: true });
        const items = [];
        $('item').slice(0, 5).each((i, el) => {
            items.push({
                title: $(el).find('title').text().trim(),
                url: $(el).find('link').text().trim()
            });
        });
        return items;
    } catch (e) { 
        console.log(`Twitter (${user}) fetch failed, skipping...`);
        return []; 
    }
}

async function fetchGitHub() {
    try {
        const res = await axios.get('https://github.com/trending', { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(res.data);
        const repos = [];
        $('article.Box-row').slice(0, 5).each((i, el) => {
            const $el = $(el);
            repos.push({
                name: $el.find('h2 a').text().replace(/\s+/g, '').trim(),
                desc: $el.find('p').text().trim(),
                url: 'https://github.com' + $el.find('h2 a').attr('href')
            });
        });
        return repos;
    } catch (e) { return []; }
}

async function translate(text) {
    if (!text) return "";
    for (const inst of LINGVA_INSTANCES) {
        try {
            const res = await axios.get(`${inst}/api/v1/auto/zh/${encodeURIComponent(text)}`, { timeout: 3000 });
            return res.data.translation;
        } catch (e) { continue; }
    }
    return text;
}

async function run() {
    if (!APP_ID || !APP_SECRET || !CHAT_ID) {
        console.error("Env vars missing");
        return;
    }
    const token = await getTenantAccessToken();
    if (!token) return;

    // 获取高质量情报源
    const [wscn, cls, github, twitter] = await Promise.all([
        fetchWSCN(), 
        fetchCLS(), 
        fetchGitHub(),
        fetchTwitter('DeItaone') // Deltaone 是 Twitter 上极高质量的实时金融情报源
    ]);
    
    const translatedGitHub = await Promise.all(github.map(async v => ({ ...v, translatedDesc: await translate(v.desc) })));

    const card = {
        header: { title: { content: "🕵️ Global Intelligence Report", tag: "plain_text" }, template: "purple" },
        elements: [
            { tag: "div", text: { tag: "lark_md", content: "**🌍 Global Macro (Wall Street Insight)**" } },
            ...wscn.map((v, i) => ({ tag: "div", text: { tag: "lark_md", content: `${i + 1}. [${v.title}](${v.url})` } })),
            { tag: "hr" },
            { tag: "div", text: { tag: "lark_md", content: "**🇨🇳 China Intelligence (Cailianpress)**" } },
            ...cls.map((v, i) => ({ tag: "div", text: { tag: "lark_md", content: `${i + 1}. [${v.title}](${v.url})` } })),
            { tag: "hr" },
            { tag: "div", text: { tag: "lark_md", content: "**🐦 Real-time Twitter (DeItaone)**" } },
            ...(twitter.length > 0 
                ? twitter.map((v, i) => ({ tag: "div", text: { tag: "lark_md", content: `${i + 1}. [${v.title}](${v.url})` } }))
                : [{ tag: "div", text: { tag: "lark_md", content: "_Twitter feed temporarily unavailable_" } }]),
            { tag: "hr" },
            { tag: "div", text: { tag: "lark_md", content: "**💻 GitHub Trending**" } },
            ...translatedGitHub.map((v, i) => ({ tag: "div", text: { tag: "lark_md", content: `${i + 1}. **${v.name}**\n_${v.translatedDesc}_\n🔗 [View](${v.url})` } })),
            { tag: "hr" },
            { tag: "note", elements: [{ tag: "plain_text", content: `Intelligence Engine | Time: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}` }] }
        ]
    };

    try {
        await axios.post('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
            receive_id: CHAT_ID,
            content: JSON.stringify(card),
            msg_type: "interactive"
        }, { headers: { Authorization: `Bearer ${token}` } });
        console.log("Success!");
    } catch (e) {
        console.error("Error:", e.message);
    }
}

run();
