const stubTsParser = {
  parseForESLint(code) {
    const length = code?.length ?? 0;
    return {
      ast: {
        type: 'Program',
        sourceType: 'module',
        body: [],
        range: [0, length],
        loc: {
          start: { line: 1, column: 0 },
          end: { line: 1, column: length },
        },
        tokens: [],
        comments: [],
      },
      services: {},
      scopeManager: null,
      visitorKeys: {
        Program: ['body'],
      },
    };
  },
};

const commonRules = {
  'no-debugger': 'warn',
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
  'no-undef': 'off',
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: commonRules,
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: stubTsParser,
    },
    rules: {
      ...commonRules,
      'no-unused-vars': 'off',
    },
  },
];
