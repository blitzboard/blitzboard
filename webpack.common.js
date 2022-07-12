module.exports = {
  entry: `./src/blitzboard.js`,
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          "style-loader",
          "css-loader"
        ],
      },
    ],
  },
  output: {
    path: `${__dirname}/dist`,
    filename: "blitzboard.bundle.js",
    libraryTarget: "umd",
    library: "Blitzboard",
  },
  devtool: 'source-map'
};