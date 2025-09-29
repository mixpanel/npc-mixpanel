module.exports = {
  env: {
    browser: true,
    es2022: true,
    node: true,
    jest: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    // TypeScript-style unused variable checking
    'no-unused-vars': ['off', { 
      'vars': 'all',
      'args': 'after-used',
      'ignoreRestSiblings': false,
      'argsIgnorePattern': '^_',
      'varsIgnorePattern': '^(_|NODE_ENV)$'
    }],
	'prefer-const': 'off',
    // Code quality
    'no-console': 'off', // Allow console logs for this project
    'no-debugger': 'error',
    'no-alert': 'warn',
    'no-eval': 'off', // Allow eval for dynamic code execution
    'no-implied-eval': 'off', // Allow implied eval
    'no-new-func': 'off', // Allow new Function() constructor
    
    // Style consistency (handled by Prettier mostly)
    'semi': ['error', 'always'],
    'quotes': 'off', // Allow both single and double quotes
    
    // Modern JS best practices
   
    'no-var': 'error',
    'prefer-arrow-callback': 'warn',
    
    // Async/await
    'require-await': 'warn',
    'no-async-promise-executor': 'error',
    
    // Error handling
    'no-throw-literal': 'error',
    
    // Import/export
    'no-duplicate-imports': 'error'
  },
  globals: {
    // Browser globals for UI files
    'window': 'readonly',
    'document': 'readonly',
    'console': 'readonly',
    'setTimeout': 'readonly',
    'clearTimeout': 'readonly',
    'setInterval': 'readonly',
    'clearInterval': 'readonly',
    'io': 'readonly', // Socket.IO client
    'mixpanel': 'readonly', // Mixpanel client
    
    // Node.js globals
    'process': 'readonly',
    'Buffer': 'readonly',
    '__dirname': 'readonly',
    '__filename': 'readonly',
    'global': 'readonly',
    
    // Jest globals
    'describe': 'readonly',
    'it': 'readonly',
    'test': 'readonly',
    'expect': 'readonly',
    'beforeEach': 'readonly',
    'afterEach': 'readonly',
    'beforeAll': 'readonly',
    'afterAll': 'readonly',
    'jest': 'readonly'
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/*.spec.js'],
      env: {
        jest: true
      }
    },
    {
      files: ['ui/**/*.js'],
      env: {
        browser: true,
        node: false
      }
    },
    {
      files: ['server.js', 'meeple/**/*.js', 'utils/**/*.js'],
      env: {
        node: true,
        browser: false
      }
    }
  ]
};