import EmailTemplate from "./EmailTemplate.js";

// 语言文件
import English from "../locales/English.js"; // 英语
import ChineseSimplified from "../locales/Chinese Simplified.js"; // 简体中文
import French from "../locales/French.js"; // 法语
import Japanese from "../locales/Japanese.js"; // 日语
import Cantonese from "../locales/Cantonese.js"; // 粤语
import Indonesian from "../locales/Indonesian.js"; // 印尼语
import Korean from "../locales/Korean.js"; // 韩语
import ChineseTraditional from "../locales/Chinese Traditional.js"; // 繁体中文
import Vietnamese from "../locales/Vietnamese.js"; // 越南语


const languagePacks = {
	"zh-Hans-CN": ChineseSimplified,
	"zht": ChineseTraditional,
	"en": English,
	"fr": French,
	"ja": Japanese,
	"yue": Cantonese,
	"id": Indonesian,
	"ko": Korean,
	"vi": Vietnamese,
};

/** 可用的语言列表 */
export const supportedLanguageList = Object.keys(languagePacks);

/**
 * 判断客户端的语言并返回对应的语言包
 * @param clientLanguage 客户端的语言
 * @param targetMail 目标邮件
 * @returns 对应的语言包内容或 null
 */
export const getI18nLanguagePack = (clientLanguage: string, targetMail: string) => {
	const languagePack = languagePacks[clientLanguage as keyof typeof languagePacks] ?? English;
	let messages = languagePack[targetMail as keyof typeof languagePack] as Record<string, string>;
	if (!messages) {
		messages = English[targetMail as keyof typeof English] as Record<string, string>;
		if (!messages) return null;
	}
	const { mailTitle } = messages;
	let mailHtml = EmailTemplate;
	Object.entries(messages).forEach(([key, value]) => mailHtml = mailHtml.replaceAll(`{{${key}}}`, value.replaceAll("\n", "<br>")));
	return { mailTitle, mailHtml };
};
