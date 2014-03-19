/* Dependencies */
require('rconsole');

console.set({
  facility:        'local7',
  title:           'ripple-rest-server',
  stdout:          false,
  stderr:          true,
  syslog:          true,
  syslogHashtags:  false,
  showTime:        true,
  showLine:        false,
  showFile:        true,
  showTags:        true
});

var fs               = require('fs');
var https            = require('https');
var ripple           = require('ripple-lib');
var config           = require('./config/config-loader');
var express          = require('express');
var app              = express();

/* Express middleware */
if (config.get('NODE_ENV') !== 'production') {
  app.set('json spaces', 2);
}
app.disable('x-powered-by');
app.use(function(req,res,next) {
    console.log("url is : " + req.url);
    next();
});
app.use(express.json());
app.use(express.urlencoded());
app.use(function(req, res, next){
  var match = req.path.match(/\/api\/(.*)/);
  if (match) {
    res.redirect(match[1]);
  } else {
    next();
  }
});
app.use(function(req, res, next){
  var new_path = req.path.replace('addresses', 'accounts').replace('address', 'account');
  if (new_path !== req.path) {
    res.redirect(new_path);
  } else {
    next();
  }
});

app.all('*', function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'X-Requested-With');
  next();
});

var remote;

/* Connect to db */
var dbinterface = require('./lib/db-interface')({
  config: config,
  remote: remote
});

/* Connect to ripple-lib Remote */
var remote_opts = {
  local_signing: true,
  servers: config.get('rippled_servers'),
  storage: {
    saveTransaction: dbinterface.saveTransaction,
    getPendingTransactions: dbinterface.getPendingTransactions
  }
};
remote = new ripple.Remote(remote_opts);

remote.on('error', function(err) {
  console.error('ripple-lib Remote error: ', err);
});

remote.on('disconnect', function() {
  console.log('Disconnected from rippled');
});

remote.on('connect', function() {
  console.log('Waiting for confirmation of ripple connection...');
  remote.once('ledger_closed', function() {
    if (remote._getServer()) {
      console.log('Connected to rippled server at: ', remote._getServer()._opts.url);
      console.log('ripple-rest server ready');
    }
  });
});

console.log('Attempting to connect to the Ripple Network...');
remote.connect();


/* Initialize controllers */
var controller_opts = {
  remote: remote,
  dbinterface: dbinterface,
  config: config
};
var ServerController        = require('./controllers/server-controller')(controller_opts);
var SubmissionController    = require('./controllers/submission-controller')(controller_opts);
var GetPaymentsController   = require('./controllers/get-payments-controller')(controller_opts);
var GetTxController         = require('./controllers/get-tx-controller')(controller_opts);
var NotificationsController = require('./controllers/notifications-controller')(controller_opts);
var UtilsController         = require('./controllers/utils-controller')(controller_opts);


/* Endpoints */
app.get('/', function(req, res){
  res.redirect('/v1');
});
app.get('/v1', function(req, res){
  var url_base = req.protocol + '://' + req.host + (config.get('NODE_ENV') === 'development' && config.get('PORT') ? ':' + config.get('PORT') : '');

  res.json({
    ripple_rest_api: 'v1',
    documentation: 'https://github.com/ripple/ripple-rest',
    endpoints: {
      payments: {
        submit:                url_base + '/v1/payments',
        account_payments:      url_base + '/v1/accounts/{account}/payments/{hash,client_resource_id}',
        payment_paths:         url_base + '/v1/accounts/{account}/payments/paths/{destination_account}/{destination_amount as value+currency+issuer}', 
      },
      notifications: {
        account_notifications: url_base + '/v1/accounts/{account}/notifications/{hash,client_resource_id}'
      },
      standard_ripple_transactions: {
        transaction:           url_base + '/v1/tx/{hash}'
      },
      server: {
        status:                url_base + '/v1/server',
        connected:             url_base + '/v1/server/connected'
      },
      utils: {
        uuid_generator:        url_base + '/v1/uuid'
      }
    }
  });
});
/* Server */
app.get('/v1/server', ServerController.getStatus);
app.get('/v1/server/connected', ServerController.isConnected);

/* Payments */
app.post('/v1/payments', SubmissionController.submitPayment);
app.get('/v1/accounts/:account/payments', GetPaymentsController.getPayment);
app.get('/v1/accounts/:account/payments/:identifier', GetPaymentsController.getPayment);
app.get('/v1/accounts/:account/payments/paths/:destination_account/:destination_amount_string', GetPaymentsController.getPathfind);

/* Notifications */
app.get('/v1/accounts/:account/notifications', NotificationsController.getNotification);
app.get('/v1/accounts/:account/notifications/:identifier', NotificationsController.getNotification);
app.get('/v1/accounts/:account/next_notification/:identifier', NotificationsController.getNextNotification);

/* Standard Ripple Transactions */
app.get('/v1/tx/:hash', GetTxController.getTx);

/* Utils */
app.get('/v1/uuid', UtilsController.getUuid);


/* Configure SSL, if desired */
if (typeof config.get('ssl') === 'object') {
  var key_path  = config.get('ssl').key_path || './certs/server.key';
  var cert_path = config.get('ssl').cert_path || './certs/server.crt';

  if (!fs.existsSync(key_path)) {
    throw new Error('Must provide key file and a key_path in the config.json in order to use SSL');
  }

  if (!fs.existsSync(cert_path)) {
    throw new Error('Must provide certificate file and a cert_path in the config.json in order to use SSL');
  }

  var sslOptions = {
    key:   fs.readFileSync(key_path),
    cert:  fs.readFileSync(cert_path)
  };

  https.createServer(sslOptions, app).listen(config.get('PORT'), function() {
    console.log('ripple-rest listening over HTTPS at port: ' + config.get('PORT'));
  });
} else {
  app.listen(config.get('PORT'), function() {
    console.log('ripple-rest listening over UNSECURED HTTP at port: ' + config.get('PORT'));
  });
}
