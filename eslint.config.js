
import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
	// 基础推荐配置
	js.configs.recommended,

	// 全局配置
	{
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			parser: tsparser,
			globals: {
				// 浏览器环境
				window: 'readonly',
				document: 'readonly',
				console: 'readonly',
				// Node.js 环境
				process: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				module: 'readonly',
				require: 'readonly',
				exports: 'readonly',
				global: 'readonly',
			},
		},

		plugins: {
			'@typescript-eslint': tseslint,
		},

		rules: {
			// 缩进和格式
			indent: ['error', 'tab', {
				SwitchCase: 1,
				flatTernaryExpressions: true,
			}],
			'linebreak-style': ['error', 'unix'],
			quotes: ['warn', 'single'],
			semi: ['warn', 'never'],

			// 数组和对象格式
			'array-bracket-spacing': ['error', 'never'],
			'brace-style': ['error', '1tbs', { allowSingleLine: true }],
			'comma-dangle': ['warn', 'always-multiline'],
			'comma-spacing': ['error', { before: false, after: true }],
			'comma-style': ['error', 'last'],
			'object-curly-spacing': ['error', 'always'],

			// 代码质量
			'eol-last': 'error',
			'default-case': 'error',
			'no-duplicate-case': 'error',
			'no-eq-null': 'error',
			'no-floating-decimal': 'error',
			'no-mixed-spaces-and-tabs': ['error', false],
			'no-var': 'error',
			'no-unused-vars': 'off', // 由 TS 规则处理
			'no-tabs': 'off',
			'no-empty': ['error', { allowEmptyCatch: true }],
			'no-constant-condition': ['error', { checkLoops: false }],
			eqeqeq: 'error',
			'prefer-const': 'error',

			// 错误预防
			'for-direction': 'error',
			'getter-return': 'error',
			'no-compare-neg-zero': 'error',
			'no-cond-assign': 'error',
			'no-extra-semi': 'error',
			'no-irregular-whitespace': 'error',
			'no-unreachable': 'error',
			'use-isnan': 'error',
			'valid-typeof': 'error',

			// 最佳实践
			'dot-notation': ['error'],
			'guard-for-in': 'error',
			'no-extra-label': 'error',
			'require-await': 'error',
			yoda: 'error',

			// 空格和格式
			'block-spacing': 'error',
			'func-call-spacing': 'off', // 由 TS 规则处理
			'computed-property-spacing': ['error', 'never'],
			'no-whitespace-before-property': 'error',
			'padded-blocks': ['error', 'never'],
			'quote-props': ['error', 'as-needed'],
			'semi-spacing': 'off',
			'semi-style': ['error', 'last'],
			'space-before-function-paren': ['error', {
				anonymous: 'always',
				named: 'never',
				asyncArrow: 'always',
			}],
			'space-infix-ops': 'error',
			'space-in-parens': ['error', 'never'],
			'space-unary-ops': 'error',
			'unicode-bom': ['error', 'never'],

			// ES6+ 特性
			'arrow-spacing': 'error',
			'require-yield': 'error',
			'yield-star-spacing': ['error', 'after'],
			'symbol-description': 'error',
			'template-tag-spacing': 'error',
			'switch-colon-spacing': 'error',
			'keyword-spacing': 'error',
			'key-spacing': 'error',
			'jsx-quotes': 'error',
			'no-multi-spaces': 'error',
			'dot-location': ['error', 'property'],
			'no-loss-of-precision': 'error',
			'no-useless-concat': 'error',
			'object-shorthand': 'error',
			'prefer-template': 'warn',
			'template-curly-spacing': 'error',
			'multiline-ternary': 'off',
			'operator-linebreak': 'off',
			'no-trailing-spaces': ['error', { skipBlankLines: true }],
			'one-var': 'off',
			'arrow-parens': ['error', 'as-needed'],
			camelcase: 'off',
			'spaced-comment': ['error', 'always', {
				exceptions: ['+', '-', '*', '/'],
				markers: ['/', '!', '@', '#', '#region', '#endregion'],
			}],
			radix: 'error', // parseInt 必须要指明是十进制
			'no-self-assign': 'off',

			// TypeScript 特定规则（移除了已废弃的规则）
			'@typescript-eslint/no-unused-vars': ['warn', {
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
				caughtErrorsIgnorePattern: '^_',
			}],
			'@typescript-eslint/no-inferrable-types': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off',
			'@typescript-eslint/triple-slash-reference': 'off',
			'@typescript-eslint/ban-ts-comment': 'off',
			'@typescript-eslint/ban-types': 'off',
			'@typescript-eslint/no-namespace': 'off',
			'@typescript-eslint/consistent-type-assertions': ['error', {
				assertionStyle: 'as',
			}],
			'@typescript-eslint/no-duplicate-enum-values': 'error',
			'@typescript-eslint/no-empty-interface': 'error',
			'@typescript-eslint/no-explicit-any': 'error',
		},
	},

	// 忽略文件
	{
		ignores: [
			'.kirakira/**/*.js',
			'.kirakira/**/*.ts',
			'dist/**/*.js',
			'dist/**/*.ts',
			'node_modules/**',
			'docs/***',
		],
	},
]
