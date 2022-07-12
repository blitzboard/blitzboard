# Note for Contributing

## Initialization

```
npm install
```

## Develop JavaScript sources
Files under `src/` have to be processed by webpack.
Execute the following command to automatically reflect the change in `src/` into `dist/`:

    npm run watch

By default, index.haml refers `dist/blitzboard.bundle.min.js`, which is not for development.
Please change it to `dist/blitzboard.bundle.js` during development.   
(Be careful not to include the change in your commit.)

For production, execute the following command to update `dist/blitzboard.bundle.min.js`:

    npm run build


## Develop HTML

The `index.html` is automatically generated from `index.haml` by `watch_haml_change.sh` (requires [haml](https://github.com/haml/haml)).

