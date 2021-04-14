const { resolve } = require('path');

const resolveAbsolute = dir => resolve(__dirname, dir);

module.exports = {
  devServer: {
    host: 'localhost',
    port: 8001
  },
  configureWebpack: {
    resolve: {
      alias: {
        '@forbearance': resolveAbsolute('../lib/index.js'),
      }
    }
  }
};