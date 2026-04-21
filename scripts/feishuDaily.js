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

async function fetchThePaper() {
    try {
        const res = await axios.get('https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar');
        return res.data.data.hotNews.slice(0, 5).map(v => ({ title: v.name, url: `https://www.thepaper.cn/newsDetail_forward_${v.contId}` }));
    } catch (e) { return []; }
}

async function fetchSinaFinance() {
    try {
        const res = await axios.get('https://top.finance.sina.com.cn/ws/GetTopDataList.php?top_type=day&top_cat=finance_0_suda&top_show_num=5');
        const jsonStr = res.data.match(/var data = (.*);/)[1];
        return JSON.parse(jsonStr).data.slice(0, 5).map(v => ({ title: v.title, url: v.url }));
    } catch (e) { return []; }
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

    const [politics, finance, github] = await Promise.all([fetchThePaper(), fetchSinaFinance(), fetchGitHub()]);
    const translatedGitHub = await Promise.all(github.map(async v => ({ ...v, translatedDesc: await translate(v.desc) })));

    const card = {
        header: { title: { content: "🕵️ Intelligence Report (Daily)", tag: "plain_text" }, template: "blue" },
        elements: [
            { tag: "div", text: { tag: "lark_md", content: "**🏛️ Politics (The Paper)**" } },
            ...politics.map((v, i) => ({ tag: "div", text: { tag: "lark_md", content: `${i + 1}. [${v.title}](${v.url})` } })),
            { tag: "hr" },
            { tag: "div", text: { tag: "lark_md", content: "**📉 Finance (Sina)**" } },
            ...finance.map((v, i) => ({ tag: "div", text: { tag: "lark_md", content: `${i + 1}. [${v.title}](${v.url})` } })),
            { tag: "hr" },
            { tag: "div", text: { tag: "lark_md", content: "**🌐 GitHub Trending**" } },
            ...translatedGitHub.map((v, i) => ({ tag: "div", text: { tag: "lark_md", content: `${i + 1}. **${v.name}**\n_${v.translatedDesc}_\n🔗 [View](${v.url})` } })),
            { tag: "hr" },
            { tag: "note", elements: [{ tag: "plain_text", content: `Daily Automation | Time: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}` }] }
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
