const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    background: './src/background.ts',
    'popup/popup': './src/popup/popup.ts',
    'screen-time/dashboard': './src/screen-time/dashboard.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            passes: 2,
            drop_console: ['log'],  // keeps console.error/warn in catch blocks
            pure_getters: true,
            unsafe: true,           // safe: no sparse arrays / arguments mutation / prototype changes
            unsafe_arrows: true,    // safe: no code relies on `this` binding in non-method functions
          },
          mangle: {
            properties: {
              regex: /^_/,
              // IMPORTANT: never add properties from types serialized to
              // chrome.storage.local here — mangling those names corrupts
              // persisted data on extension update (AppState, CheckInRecord, Settings,
              // ScreenTimeState, ScreenSession, ScreenTimeSettings)
            },
          },
          format: {
            comments: false,
          },
        },
        extractComments: false,
      }),
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/popup/popup.html', to: 'popup/popup.html' },
        { from: 'src/popup/popup.css', to: 'popup/popup.css' },
        { from: 'src/screen-time/dashboard.html', to: 'screen-time/dashboard.html' },
        { from: 'src/screen-time/dashboard.css', to: 'screen-time/dashboard.css' },
        { from: 'src/icons', to: 'icons' },
      ],
    }),
  ],
};
