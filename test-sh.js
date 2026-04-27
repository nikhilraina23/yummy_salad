import serverless from 'serverless-http';
import express from 'express';

const app = express();
app.use(express.json());
app.post('/', (req, res) => res.json({body: req.body}));

const handler = serverless(app);

handler({
  httpMethod: 'POST',
  path: '/',
  headers: {'content-type': 'application/json'},
  body: '{"test": 123}'
}).then(res => {
  console.log('Plain body:', res);
});

handler({
  httpMethod: 'POST',
  path: '/',
  headers: {'content-type': 'application/json'},
  body: Buffer.from('{"test": 123}').toString('base64'),
  isBase64Encoded: true
}).then(res => {
  console.log('Base64 body:', res);
});
