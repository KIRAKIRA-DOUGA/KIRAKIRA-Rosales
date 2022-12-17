/* eslint-disable quote-props */
module.exports = {
	root: true,
	env: {
		browser: true,
		es2021: true,
		node: true,
	},
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
	],
	overrides: [],
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 'latest',
		sourceType: 'module',
	},
	plugins: [
		'@typescript-eslint',
	],
	rules: {
		'indent': ['error', 'tab', {
			'SwitchCase': 1,
			'flatTernaryExpressions': true,
			'ignoredNodes': ['Program > .body'],
			'ignoreComments': true,
		}],
		'linebreak-style': ['error', 'unix'],
		'quotes': ['warn', 'single'],
		'semi': ['warn', 'never'],
		'array-bracket-spacing': ['error', 'never'],
		'brace-style': ['error', '1tbs', { 'allowSingleLine': true }],
		'comma-dangle': ['warn', 'always-multiline'],
		'comma-spacing': ['error', { 'before': false, 'after': true }],
		'comma-style': ['error', 'last'],
		'eol-last': 'error',
		'default-case': 'error',
		'no-duplicate-case': 'error',
		'no-eq-null': 'error',
		'no-floating-decimal': 'error',
		'no-mixed-spaces-and-tabs': ['error', false],
		'no-var': 'error',
		'no-unused-vars': 'off',
		'no-tabs': 'off',
		'no-empty': ['error', { 'allowEmptyCatch': true }],
		'no-constant-condition': ['error', { 'checkLoops': false }],
		'eqeqeq': 'error',
		'prefer-const': 'error',
		'for-direction': 'error',
		'getter-return': 'error',
		'no-compare-neg-zero': 'error',
		'no-cond-assign': 'error',
		'no-extra-semi': 'error',
		'no-irregular-whitespace': 'error',
		'no-unreachable': 'error',
		'use-isnan': 'error',
		'valid-typeof': 'error',
		'curly': ['error', 'multi'],
		'dot-notation': ['error', { 'allowKeywords': false }],
		'guard-for-in': 'error',
		'no-extra-label': 'error',
		'require-await': 'error',
		'yoda': 'error',
		'block-spacing': 'error',
		'func-call-spacing': 'off', // 开启后会与 ts 产生冲突！使用 ts 版的代替。
		'computed-property-spacing': ['error', 'never'],
		'no-whitespace-before-property': 'error',
		'object-curly-spacing': ['error', 'always'],
		'padded-blocks': ['error', 'never'],
		'quote-props': ['error', 'as-needed', { 'keywords': true }],
		'semi-spacing': 'off',
		'semi-style': ['error', 'last'],
		'space-before-function-paren': ['error', { 'anonymous': 'always', 'named': 'never', 'asyncArrow': 'always' }],
		'space-infix-ops': 'error',
		'space-in-parens': ['error', 'never'],
		'space-unary-ops': 'error',
		'unicode-bom': ['error', 'never'],
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
		'no-trailing-spaces': ['error', { 'skipBlankLines': true }],
		'one-var': 'off',
		'arrow-parens': ['error', 'as-needed'],
		'camelcase': 'off',
		'spaced-comment': ['error', 'always', { 'exceptions': ['+', '-', '*', '/'], 'markers': ['/', '!', '@', '#', '#region', '#endregion'] }],
		'radix': 'error', // parseInt 必须要指明是十进制。
		'no-self-assign': 'off',
		'@typescript-eslint/no-unused-vars': ['warn', { // 非要使用未使用变量，前面加下划线。
			'argsIgnorePattern': '^_',
			'varsIgnorePattern': '^_',
			'caughtErrorsIgnorePattern': '^_',
		}],
		'@typescript-eslint/no-inferrable-types': 'off',
		'@typescript-eslint/no-non-null-assertion': 'off',
		'@typescript-eslint/triple-slash-reference': 'off',
		'@typescript-eslint/ban-ts-comment': 'off',
		'@typescript-eslint/ban-types': 'off',
		'@typescript-eslint/no-namespace': 'off',
		'@typescript-eslint/func-call-spacing': ['error', 'never'],
		'@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'as' }],
		'@typescript-eslint/no-confusing-non-null-assertion': 'error',
		'@typescript-eslint/no-duplicate-enum-values': 'error',
		'@typescript-eslint/no-empty-interface': 'error',
		'@typescript-eslint/member-delimiter-style': ['error', {
			'multiline': {
				'delimiter': 'semi',
				'requireLast': true,
			},
			'singleline': {
				'delimiter': 'semi',
				'requireLast': false,
			},
		}],
		'@typescript-eslint/semi': ['warn', 'never'],
		'@typescript-eslint/no-explicit-any': 'error',
		// '@typescript-eslint/no-confusing-void-expression': 'error',
		// '@typescript-eslint/no-floating-promises': 'error',
		// 嗯对这几个不晓得怎么用不了。
	},
}
