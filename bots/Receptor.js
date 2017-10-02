const express = require('express');
const Session = require('express-session');
const path = require('path');
const url = require('url');
const bodyParser = require('body-parser');
const multer = require('multer');
const http = require('http');
const https = require('https');
const spdy = require('spdy');
const Ecresult = require('ecresult');
const textype = require('textype');
const echashcash = require('echashcash');

const Parent = require('../bots/_Bot.js');

let logger;
let hashcashLevel;
let allowDelay = 10 * 1000;

function processLanguage(acceptLanguage = 'zh-TW') {
    const regex = /((([a-zA-Z]+(-[a-zA-Z]+)?)|\*)(;q=[0-1](\.[0-9]+)?)?)*/g;
    const l = acceptLanguage.toLowerCase().replace(/_+/g, '-');
    let la = l.match(regex);
    la = la.filter(v => v).map((v) => {
        const bits = v.split(';');
        const quality = bits[1] ? parseFloat(bits[1].split('=')[1]) : 1.0;
        return { locale: bits[0], quality };
    }).sort((a, b) => b.quality > a.quality);
    return la;
}

function getLowerCaseLang({ language }) {
    return language[0] !== undefined ? language[0].locale.toLowerCase() : '';
}

const returnData = (req, res) => {
    let session;
    let json;
    let isFile;
    let isURL;
    let isPlayURL;
    if (!res.finished) {
        json = res.result.response();
        isFile = new RegExp('^[a-zA-Z0-9-]+/[a-zA-Z0-9-.]+$').test(json.message);
        isURL = textype.isURL(json.message);
        isPlayURL = textype.isURL(json.data);
        if (res.result.isDone()) {
            session = res.result.getSession();
            if (session) {
                Object.keys(session).map((key) => {
                    if (session[key] === null) {
                        delete req.session[key];
                    } else {
                        req.session[key] = session[key];
                    }
                    return '';
                });
            }
        } else {
            res.status(404);
            res.result.setMessage('Invalid operation');
            logger.exception.warn('----- request -----');
            logger.exception.warn(req.method, req.url);
            logger.exception.warn('session:', req.headers);
            logger.exception.warn('session:', req.session);
            logger.exception.warn('params:', req.params);
            logger.exception.warn('query:', req.query);
            logger.exception.warn('body:', req.body);
            logger.exception.warn('-------------------');
        }

        if (isFile) {
            res.header('Content-Type', json.message);
            res.end(json.data);
        } else if (isPlayURL) {
            res.redirect(301, json.data);
        } else if (isURL) {
            let crawler;
            const options = url.parse(json.message);
            options.method = 'GET';
            switch (options.protocol) {
                case 'http:':
                    crawler = http;
                    break;
                case 'https:':
                default:
                    crawler = https;
                    options.rejectUnauthorized = false;
            }
            crawler.request(options, (cRes) => {
                res.header('Content-Type', cRes.headers['content-type']);
                cRes.on('data', (chunk) => {
                    res.write(chunk);
                });
                cRes.on('end', () => {
                    res.end();
                });
            }).on('error', () => { res.end(); }).end();
        } else if (json.result >= 100) {
            res.status(json.result);
            Object.keys(json.data).map(key => res.header(key, json.data[key]));
            res.end();
        } else {
            res.header('Content-Type', 'application/json');
            res.send(res.result.response());
        }
    } else {
        // timeout request
        json = res.result.response();
        res.result.resetResponse();
    }
    if (json.errorcode) {
        logger.exception.warn('----- request -----');
        logger.exception.warn(req.method, req.url);
        logger.exception.warn('session:', req.headers);
        logger.exception.warn('session:', req.session);
        logger.exception.warn('params:', req.params);
        logger.exception.warn('query:', req.query);
        logger.exception.warn('body:', req.body);
        logger.exception.warn('-------------------');
    }

    const rs = json.errorcode ? [json.result, json.errorcode].join(':') : json.result;
    logger.info(req.method, req.url, rs, req.session.ip, json.cost);
};

const checkLogin = (req, res, next) => {
    if (req.session.uid === undefined) {
        res.result.setErrorCode('10201');
        res.result.setMessage('User Not Authorized');
        returnData(req, res, next);
    } else {
        next();
    }
};

const checkHashCash = (req, res, next) => {
    const invalidHashcash = () => {
        // -- for test
        let t;
        const h = req.headers.hashcash;
        const nt = new Date().getTime();
        if (h) { t = parseInt(h.split(':')[0], 10) || nt; }
        const c = [req.url, nt, ''].join(':');
        const hc = echashcash(c);
        const d = {
            hashcash: req.headers.hashcash,
            sample: [nt, hc].join(':')
        };
        if (new Date().getTime() - t > allowDelay) { d.information = 'timeout'; }
        if (new Date().getTime() < t) { d.information = 'future time'; }

        res.result.setErrorCode('10101');
        res.result.setMessage('Invalid Hashcash');
        res.result.setData(d); // -- for test
        returnData(req, res, next);
    };

    const { hashcash } = req.headers;
    if (!hashcash) { return invalidHashcash(); }
    let cashdata = hashcash.split(':');
    cashdata = cashdata.map(v => parseInt(v, 10) || 0);
    const content = [req.url, cashdata[0], ''].join(':');
    const now = new Date().getTime();
    const check = now - cashdata[0] < allowDelay ? echashcash.check(content, cashdata[1], hashcashLevel) : false;
    if (check) {
        return next();
    } else {
        return invalidHashcash();
    }
};

const Bot = class extends Parent {
    constructor() {
        super();
        this.name = path.parse(__filename).base.replace(/.js$/, '');
        this.router = express.Router();
        this.app = express();
    }

    setTokenParser(value) {
        this._tokenParser = value;
    }

    init(config) {
        return super.init(config).then((v) => {
            const { content, upload } = config.path;
            const { allowDelay: myAllowDelay, session, listen } = config.main;
            const { logger: mylogger } = config;
            logger = mylogger;
            allowDelay = myAllowDelay;

            // initial token parser
            this._tokenParser = (req, res, next) => { next(); };

            // listen port
            this.listen = listen;
            this.testPorts = { http: [5566, listen.http], https: [7788, listen.https] };

            // http & https
            this.http = http.createServer(this.app);
            this.https = spdy.createServer(config.cert, this.app);

            // session
            this.session = Session({
                secret: session,
                resave: true,
                saveUninitialized: true
            });

            // session
            this.app.use(this.session);
            // preprocess
            this.app.use((req, res, next) => { this.filter(req, res, next); });
            // static file
            this.app.use(express.static(path.join(__dirname, '../public')));
            this.app.use('/resources/', express.static(path.join(__dirname, '../resources')));
            this.app.use('/content/', express.static(content));
            // form-data parser
            this.app.use(bodyParser.urlencoded({ extended: false }));
            // json parser
            this.app.use(bodyParser.json({}));
            // file parser
            this.app.use(multer({ dest: upload }).any());
            this.app.use(['/admin/*', '/admin'], (req, res) => {
                res.sendFile(path.resolve(__dirname, '../public', 'index.html'));
            });
            this.app.use(this.router);
            this.app.use(returnData);

            this.register({ method: 'get' }, ['/', '/version'], () => Promise.resolve(config.package));

            return Promise.resolve(v);
        });
    }
    start() {
        return this.startHttp()
            .then(() => this.startHttps());
    }
    ready() {
        return super.ready().then(v => Promise.resolve(v));
    }

    startHttp(retry) {
        this.http.once('error', (e) => {
            if (e.syscall === 'listen') {
                this.listen.http = this.testPorts.http.pop() || this.listen.http + 1;
                this.startHttp(true);
            } else {
                // unknown error
                this.logger.exception.warn(e);
                throw e;
            }
        });
        return new Promise((resolve) => {
            const listener = () => {
                this.logger.info('HTTP:', this.listen.http);
                resolve();
            };
            if (!retry) { this.http.on('listening', listener); }
            this.http.listen(this.listen.http, () => {});
        });
    }
    startHttps(retry) {
        this.https.once('error', (e) => {
            if (e.syscall === 'listen') {
                this.listen.https = this.testPorts.https.pop() || this.listen.https + 1;
                this.startHttps(true);
            } else {
                // unknown error
                this.logger.exception.warn(e);
                throw e;
            }
        });
        return new Promise((resolve) => {
            const listener = () => {
                this.logger.info('HTTPS:', this.listen.https);
                resolve();
            };
            if (!retry) { this.https.on('listening', listener); }
            this.https.listen(this.listen.https, () => {
                resolve();
            });
        });
    }

    filter(req, res, next) {
        let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '0.0.0.0';
        const port = req.connection.remotePort;
        const parseIP = ip.match(/\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/);
        ip = parseIP ? parseIP[0] : ip;
        if (!req.session.ip) { req.session.ip = ip; }
        if (!req.session.port) { req.session.port = port; }
        const { powerby } = this.config;
        req.language = processLanguage(req.headers['accept-language']);
        this.i18n.setLocale(getLowerCaseLang(req));

        res.result = new Ecresult();
        res.header('X-Powered-By', powerby);
        res.header('Client-IP', ip);
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Hashcash, Authorization, Content-Type');

        // parse token
        this._tokenParser(req, res, next);
    }
    // options: method, authorization, hashcash
    register(...args2) {
        const params = Array.prototype.slice.call(args2);
        const options = params.splice(0, 1)[0];
        const method = (options.method || 'get').toLowerCase();
        const authorization = !!options.authorization;
        const hashcash = !!options.hashcash;
        const registerPath = params[0];
        const executeProcess = params[1];
        const args = [registerPath];
        if (hashcash) { args.push(checkHashCash); }
        if (authorization) { args.push(checkLogin); }
        args.push((req, res, next) => {
            executeProcess({
                url: req.url,
                params: req.params,
                query: req.query,
                body: req.body,
                files: req.files,
                sid: req.sessionID,
                session: req.session,
                lang: getLowerCaseLang(req)
            }).then((d) => {
                res.result.setResult(1);
                if (Array.isArray(d)) {
                    res.result.setData(d);
                } else if (typeof (d) === 'object') {
                    const data = {};
                    const session = {};
                    Object.keys(d).map((k) => {
                        // session data
                        if (/^_session_/.test(k)) {
                            const key = k.substr(9);
                            session[key] = d[k];
                        } else if (/^_url$/.test(k)) {
                            res.result.setMessage(d[k]);
                        } else {
                            data[k] = d[k];
                        }
                        return '';
                    });

                    res.result.setData(data);
                    res.result.setSession(session);
                } else {
                    res.result.setData(d);
                }
                next();
            }).catch((e) => {
                this.logger.error(e);
                res.result.setError(e);
                next();
            });
        });
        this.router[method](...args);
    }

    getServer() {
        return [this.http, this.https];
    }

    getSession() {
        return this.session;
    }
};

module.exports = Bot;
