// The app's only lint gate: names that are used and never declared.
//
// Metro bundles such a file without complaint — an undeclared identifier is a
// runtime ReferenceError, not a resolution failure — so CI's `expo export` was
// green for three weeks while Edit Profile threw on render (`<Avatar>` with no
// import). The web has gated on the same rule since the same bug took down its
// admin moderation list. Nothing stylistic is enforced here.
const globals = require('globals');
const react = require('eslint-plugin-react');

module.exports = [
  { ignores: ['node_modules/**', '.expo/**', 'dist/**', 'android/**', 'ios/**'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, __DEV__: 'readonly', ErrorUtils: 'readonly' },
    },
    plugins: { react },
    rules: {
      'no-undef': 'error',
      'react/jsx-no-undef': 'error',
      'no-dupe-keys': 'error',
      // Advisory. Without the two react rules every component import reads as unused.
      'react/jsx-uses-vars': 'warn',
      'react/jsx-uses-react': 'warn',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^(React|_)', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
];
