var express = require('express'),
  app = express(),
  ripple = require('ripple-lib'),
  config = require('./config');

/* Connect to ripple-lib */
var remote = new ripple.Remote(config.remoteOptions);
remote.connect();
remote.once('connect', function(){
  console.log('Connected to ripple-lib');
});

/* Initialize controllers */
var TxCtrl = require('./controllers/txCtrl')(remote);

/* Express middleware */
app.use(express.json());
app.use(express.urlencoded());

app.all('*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
});


/* Server Routes */
app.get('/api/v1/status', function(req, res){
  if (remote._connected) {
    res.send('connected');
  } else {
    res.send('disconnected');
  }
});

/* Ripple Tx Routes */
app.get('/api/v1/address/:address/tx/:txHash', TxCtrl.getTx);
app.get('/api/v1/address/:address/next_notification', TxCtrl.getNextNotification);
app.get('/api/v1/address/:address/next_notification/:prevTxHash', TxCtrl.getNextNotification);
app.post('/api/v1/address/:address/tx/', TxCtrl.submitTx);

/* Simplified Payment Routes */

var port = process.env.PORT || 5990;
app.listen(port);
console.log('Listening on port: ' + port);

/* Export for testing purposes */
module.exports = app;