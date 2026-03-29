const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
  entry: {
    "background/service-worker": "./src/background/service-worker.js",
    "content/content": "./src/content/content.js",
    "popup/popup": "./src/popup/popup.js",
    "options/options": "./src/options/options.js",
  },

  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },

  module: {
    rules: [
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
    ],
  },

  plugins: [
    new MiniCssExtractPlugin({
      filename: "[name].css",
    }),

    new CopyPlugin({
      patterns: [
        { from: "manifest.json", to: "manifest.json" },
        { from: "src/popup/popup.html", to: "popup/popup.html" },
        { from: "src/popup/popup.css", to: "popup/popup.css" },
        { from: "src/options/options.html", to: "options/options.html" },
        { from: "src/options/options.css", to: "options/options.css" },
        { from: "src/content/content.css", to: "content/content.css" },
        { from: "assets/", to: "assets/" },
      ],
    }),
  ],

  resolve: {
    extensions: [".js"],
  },

  devtool: "cheap-module-source-map",
};
