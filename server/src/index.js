const { createApp } = require('./app');

const app = createApp();
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`API escuchando en :${port}`);
});
