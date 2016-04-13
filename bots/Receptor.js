const ParentBot = require('./_Bot.js');
const util = require('util');
const log4js = require('log4js');
const express = require('express');
const Session = require('express-session');
const favicon = require('serve-favicon');
const os = require('os');
const exec = require('child_process').exec;
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const bodyParser = require('body-parser');
const multer  = require('multer');
const http = require('http');
const echashcash = require('echashcash');
const dvalue = require('dvalue');
const Result = require('../classes/Result.js');

const hashcashLevel = 3;
const allowDelay = 10000;

var pathCert = path.join(__dirname, '../config/cert.pfx'),
		pathPw = path.join(__dirname, '../config/pw.txt'),
		logger;

var checkLogin, checkHashCash, errorHandler, returnData;
checkLogin = function (req, res, next) {
	if(req.session.uid === undefined) {
		var result = new Result();
		result.setResult(-1);
		result.setMessage('User No Authorized');
		res.result = result;
		returnData(req, res, next)
	}
	else {
		next();
	}
};
checkHashCash = function (req, res, next) {
	var invalidHashcash = function () {
		//-- for test
		var h = req.headers.hashcash;
		var t = new Date().getTime();
		if(h) { t = parseInt(h.split(":")[0]) || t; }
		var c = [req.url, t, ""].join(":");
		var hc = echashcash(c);
		var d = {
			hashcash: req.headers.hashcash,
			sample: [t, hc].join(":")
		};
		if(new Date().getTime() - t > allowDelay) { d.information = "timeout"; }

		var result = new Result();
		result.setResult(-2);
		result.setMessage('Invalid Hashcash');
		result.setData(d);	//-- for test
		res.result = result;
		returnData(req, res, next);
	};

	var hashcash = req.headers.hashcash;
	if(!hashcash) { return invalidHashcash(); }
	var cashdata = hashcash.split(":");
	cashdata = cashdata.map(function (v) { return parseInt(v) || 0; });
	var content = [req.url, cashdata[0], ""].join(":");
	var now = new Date().getTime();
	var check = now - cashdata[0] < allowDelay? echashcash.check(content, cashdata[1], hashcashLevel): false;
	if(check) {
		next();
	}
	else { return invalidHashcash(); }
};
errorHandler = function (err, req, res, next) {
	logger.exception.error(err);
	res.statusCode = 500;
	res.json({result: 0, message: 'oops, something wrong...'});
};
returnData = function(req, res, next) {
	var result = res.result, session;

	if(result) {
		if(typeof(result.getSession) == 'function') {
			session = result.getSession();

			for(var key in session) {
				if(session[key] === null) {
					delete req.session[key];
				}
				else {
					req.session[key] = session[key];
				}
			}
		}
	}
	else {
		res.status(404);
		result = new Result();
		result.setMessage("Invalid operation");
	}

	if(typeof(result.toJSON) == 'function') {
		var json = result.toJSON();
		var isFile = new RegExp("^[a-zA-Z0-9\-]+/[a-zA-Z0-9\-]+$").test(json.message);

		if(isFile) {
			res.header("Content-Type", json.message);
			res.send(json.data);
		}
		else if(json.result >= 100) {
			res.status(json.result);
			for(var key in json.data) {
				res.header(key, json.data[key]);
			}

			res.end();
		}
		else {
			res.send(json);
		}
	}
	else {
		res.send(result);
	}

	result.attr.data = dvalue.default(result.attr.data, {});
	var rs = result.attr.data.code? [result.attr.result, result.attr.data.code].join(':'): result.attr.result;
	logger.info.info(req.method, req.url, rs, req.session.ip);
};

var Bot = function(config) {
	this.init(config);
};

util.inherits(Bot, ParentBot);

Bot.prototype.init = function(config) {
	var self = this;
	Bot.super_.prototype.init.call(this, config);
	this.serverPort = [5566];
	this.httpsPort = [7788];
	this.nodes = [];
	this.monitorData = {};
	this.monitorData.traffic = {in: 0, out: 0};
	logger = config.logger;

	var folders = config.path || {};
	var upload = folders.upload || "./uploads/";
	var shards = folders.shards || "./shards/";
	this.shardPath = shards;
	var logs = folders.logs || "./logs/";

	this.router = express.Router();
	this.app = express();
	this.http = require('http').createServer(this.app);
	this.http.on('error', function(err) {
		if(err.syscall == 'listen') {
			var nextPort = self.serverPort.pop() || self.listening + 1;
			self.startServer(nextPort);
		}
		else {
			throw err;
		}
	});
	this.http.on('listening', function() {
		config.listening = self.listening;
	});

	// if has pxf -> create https service
	if(fs.existsSync(pathCert)) {
		this.pfx = fs.readFileSync(pathCert);
		this.pfxpw = fs.readFileSync(pathPw);

		this.https = require('https').createServer({
			pfx: this.pfx,
			passphrase: this.pfxpw
		}, this.app);
		this.https.on('error', function(err) {
			if(err.syscall == 'listen') {
				var nextPort = self.httpsPort.pop() || self.listeningHttps + 1;
				self.startServer(null, nextPort);
			}
			else {
				throw err;
			}
		});

		this.https.on('listening', function() {
			config.listeningHttps = self.listeningHttps;
		});
	}

	this.session = Session({
		secret: this.randomID(),
		resave: true,
		saveUninitialized: true
	});

	this.app.set('port', this.serverPort.pop());
	this.app.set('portHttps', this.httpsPort.pop());
	this.app.use(this.session);
	this.app.use(function (req, res, next) { self.tokenParser(req, res, next); });
	this.app.use(express.static(path.join(__dirname, '../public')));
	this.app.use(bodyParser.urlencoded({ extended: false }));
	this.app.use(bodyParser.json({}));
	this.app.use(function(req, res, next) { self.filter(req, res, next); });
	this.app.use(this.router);
	this.app.use(returnData);
	this.ctrl = [];

	this.router.get('/version/', function (req, res, next) {
		var result = new Result();
		result.setResult(1);
		result.setMessage('Application Information');
		result.setData(self.config.package);
		res.result = result;
		next();
	});

	// subdomain register
	this.router.post('/subdomain/', function (req, res, next) {
		var result = new Result();
		var bot = self.getBot('tracker');
		res.result = result;
		bot.domainRegister(req.body, function (e, d) {
			if(e) {
				result.setMessage(e.message);
				result.setData(e);
			}
			else {
				result.setResult(1);
				result.setMessage('create subdomain');
				result.setData(d);
			}
			next();
		});
	});

	// tracker
	this.router.get('/node/:client', function (req, res, next) {
		var tracker = self.getBot('tracker');
		var msg = {
			"url": req._parsedOriginalUrl.pathname,
			"method": req.method,
			"params": req.params,
			"query": req.query,
			"body": req.body,
			"sessionID": req.sessionID,
			"session": req.session,
			"files": req.files
		};

		tracker.exec(msg, function(err, data) {
			if(data.length == 1) { data = data[0]; }
			res.result = new Result(data);
			next();
		});
	});
	this.router.get('/track/', function (req, res, next) {
		var tracker = self.getBot('tracker');
		var msg = {
			"url": req._parsedOriginalUrl.pathname,
			"method": req.method,
			"params": req.params,
			"query": req.query,
			"body": req.body,
			"sessionID": req.sessionID,
			"session": req.session,
			"files": req.files
		};

		tracker.exec(msg, function(err, data) {
			if(data.length == 1) { data = data[0]; }
			res.result = new Result(data);
			next();
		});
	});
};

Bot.prototype.start = function(cb) {
	Bot.super_.prototype.start.apply(this);
	var self = this;
	var httpPort = this.app.get('port');
	var httpsPort = this.app.get('portHttps');
	this.router.use(errorHandler);
	this.startServer(httpPort, httpsPort, cb);
};

Bot.prototype.startServer = function(port, httpsPort, cb) {
	if(port > 0) {
		this.listening = port;
		this.http.listen(port, function() {
				if(typeof(cb) == 'function') { cb(); }
		});
	}

	if(httpsPort > 0 && this.pfx) {
		this.listeningHttps = httpsPort;
		this.https.listen(httpsPort, function() {});
	}
}

Bot.prototype.stop = function() {
	Bot.super_.prototype.stop.apply(this);
	this.http.close();

	if(this.pfx) {
		this.https.close();
	}
};

Bot.prototype.filter = function (req, res, next) {
	var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '0.0.0.0';
	var port = req.connection.remotePort;
	parseIP = ip.match(/\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/);
	ip = !!parseIP? parseIP[0]: ip;
	if(!req.session.ip) { req.session.ip = ip; }
	if(!req.session.port) { req.session.port = port; }
	var powerby = this.config.powerby;
	res.header('X-Powered-By', powerby);
	res.header('Client-IP', ip);
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
	res.header("Access-Control-Allow-Headers", "Hashcash, Authorization, Content-Type");
	next();
};

Bot.prototype.tokenParser = function (req, res, next) {
	var bot = this.getBot('User');
	var auth = req.headers.authorization;
	var token = !!auth? auth.split(" ")[1]: '';
	bot.checkToken(token, function (e, d) {
		if(!!d) {
			req.session.uid = d.uid;
		}
		next();
	});
};

module.exports = Bot;
