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
import { logging } from "../service/loggingService.js";


const languagePacks = {
	"en": English,
	"zh-Hans-CN": ChineseSimplified,
	"zh-Hant-TW": ChineseTraditional,
	"ja": Japanese,
	"ko": Korean,
	"vi": Vietnamese,
	"id": Indonesian,
	"fr": French,
	"yue": Cantonese,
};

/** 可用的语言列表（类型） */
type SupportedLanguage = keyof typeof languagePacks

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

/**
 * 标准化客户端传入的语言标识符
 * @param clientLanguage 客户端语言
 * @returns 后端支持的语言标识符
 */
export const standardizeClientLanguageFlag = (clientLanguage: string): SupportedLanguage => {
	try {
		const lang = (clientLanguage ?? '').trim().replace(/_/g, '-');
		if (!lang) return 'zh-Hans-CN';

		switch (lang) {
			// English
			case 'en':
			case 'en-US':
			case 'en-GB':
			case 'en-AU':
			case 'en-CA':
				return 'en';

			// Simplified Chinese
			case 'zh':
			case 'cn':
			case 'ch':
			case 'chs':
			case 'zh-CN':
			case 'zh-SG':
			case 'zh-Hans':
			case 'zh-Hans-CN':
			case 'zh-Hans-SG':
				return 'zh-Hans-CN';

			// Traditional Chinese
			case 'tw':
			case 'cht':
			case 'zh-TW':
			case 'zh-HK':
			case 'zh-MO':
			case 'zh-Hant':
			case 'zh-Hant-TW':
			case 'zh-Hant-HK':
			case 'zh-Hant-MO':
				return 'zh-Hant-TW';

			// Japanese
			case 'ja':
			case 'ja-JP':
				return 'ja';

			// Korean 韩语
			case 'ko':
			case 'ko-KR':
				return 'ko';

			// Vietnamese 越南语
			case 'vi':
			case 'vi-VN':
				return 'vi';

			// Indonesian 印尼语
			case 'id':
			case 'id-ID':
			case 'in':
			case 'in-ID':
				return 'id';

			// French 法语
			case 'fr':
			case 'fr-FR':
			case 'fr-CA':
				return 'fr';

			// Cantonese 粤语
			case 'yue':
			case 'yue-HK':
			case 'zh-YUE':
			case 'zh-yue':
				return 'yue';

			// crowdin i18n mode fallback to 'en'
			case 'ii':
				return 'en';

			default:
				return 'zh-Hans-CN';
		}
	} catch (error) {
		logging('ERROR', 'Unable to standardize client language string', error, { clientLanguage });
		return 'zh-Hans-CN';
	}
}
