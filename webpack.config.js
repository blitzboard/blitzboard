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
    filename: "blitzboard.js",
    libraryTarget: "umd",
    library: "Blitzboard",
    
  }
};