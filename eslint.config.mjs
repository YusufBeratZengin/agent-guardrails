export default [{
  ignores: ['node_modules/**', 'coverage/**', 'is/**'],
}, {
  files: ['**/*.mjs'],
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-constant-condition': 'error',
    'no-unreachable': 'error',
    'no-dupe-keys': 'error',
    'no-eval': 'error',
    'eqeqeq': 'error',
    'curly': ['error', 'all'],
    'semi': ['error', 'always'],
  },
}];
