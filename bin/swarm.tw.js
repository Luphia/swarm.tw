#!/usr/bin/env node
const fs = require('fs');
const url = require('url');
const path = require('path');
const pem = require('pem');
const log4js = require('log4js');
const i18n = require('i18n');
const dvalue = require('dvalue');
const mongodb = require('mongodb').MongoClient;

const packageInfo = require('../package.json');
const ConfigReader = require('../utils/ConfigReader');
const Code = require('../models/Code');

const initialFolder = function (options) {
    const folderArray = [];
    const projectName = options.name;
    const homePath = path.join(process.env.HOME || process.env.USERPROFILE, projectName);
    const configPath = path.join(homePath, 'config/');
    const nodePath = path.join(homePath, 'node/');
    const uploadPath = path.join(homePath, 'uploads/');
    const contentPath = path.join(homePath, 'contents/');
    const logPath = path.join(homePath, 'logs/');
    const datasetPath = path.join(homePath, 'dataset/');
    const tmpPath = path.join(homePath, 'tmp/');
    const pathPID = path.join(homePath, 'PID');
    const pathUUID = path.join(homePath, 'UUID');
    let UUID = dvalue.guid();

    const createFolder = function (folder) {
        return new Promise((resolve, reject) => {
            fs.exists(folder, (rs) => {
                if (!rs) {
                    fs.mkdir(folder, (e, d) => {
                        if (e) {
                            reject(e);
                        } else {
                            resolve(folder);
                        }
                    });
                } else {
                    resolve(folder);
                }
            });
        });
    };

    const createPID = function (v) {
        new Promise((resolve, reject) => {
            const PID = process.pid;
            fs.writeFile(pathPID, PID, (e) => {
                if (e) {
                    reject(e);
                } else {
                    resolve(v);
                }
            });
        });
    };
    const createUUID = function (homepath) {
        if (!fs.existsSync(pathUUID)) {
            fs.writeFile(pathUUID, UUID, (err) => {});
        } else {
            UUID = fs.readFileSync(pathUUID).toString();
        }
        return Promise.resolve();
    };

    folderArray.push(
    { key: 'config', path: configPath },
        { key: 'node', path: nodePath },
    { key: 'upload', path: uploadPath },
    { key: 'content', path: contentPath },
    { key: 'log', path: logPath },
    { key: 'dataset', path: datasetPath },
    { key: 'tmp', path: tmpPath }
  );
    return folderArray.reduce((pre, curr) => pre.then((res) => {
        res = res || { UUID, path: { home: homePath } };
        return createFolder(curr.path).then((nextRes) => {
            res.path[curr.key] = curr.path;
            return res;
        });
    }), createFolder(homePath).then(createPID).then(createUUID));
};

const initialConfig = function (config) {
  // read package.json
    config.package = {
        name: packageInfo.name,
        version: packageInfo.version
    };
    config.powerby = `${packageInfo.name} v${packageInfo.version}`;

    const defaultConfigFolder = path.join(__dirname, '../config');
    const customConfigFolder = config.path.config;

    return new Promise((resolve, reject) => {
    // load certification
        const certFiles = [path.join(defaultConfigFolder, 'certification', 'cert.pem'), path.join(defaultConfigFolder, 'certification', 'key.pem')];
        let certFilesExists;
        try { certFilesExists = !certFiles.find(v => !(fs.lstatSync(v).size > 64)); } catch (e) {}
        if (certFilesExists) {
            config.cert = {
                cert: fs.readFileSync(certFiles[0]),
                key: fs.readFileSync(certFiles[1])
            };
            resolve(config);
        } else {
            pem.createCertificate({ days: 365, selfSigned: true }, (e, d) => {
                config.cert = {
                    cert: d.certificate,
                    key: d.serviceKey
                };
                resolve(config);
            });
        }
    }).then(() => Promise.resolve(
        Object.assign({}, config, ConfigReader.read({
            defFolderPath: defaultConfigFolder,
            customFolderPath: customConfigFolder
        }))
    ));
};

const initialTranslator = function (config) {
    const localeFolder = path.join(__dirname, '../locales');
    i18n.configure({
        locales: ['en', 'zh', 'zh-tw', 'zh-cn'],
        directory: localeFolder
    });
    config.i18n = i18n;
    return Promise.resolve(config);
};

const initialLogger = function (config) {
    const logFolder = config.path.log;
    const infoPath = path.join(logFolder, 'info.log');
    const exceptionPath = path.join(logFolder, 'exception.log');
    const threatPath = path.join(logFolder, 'threat.log');
    log4js.configure({
        appenders: [
      { type: 'console' },
      { type: 'file', filename: infoPath, category: 'info', maxLogSize: 10485760, backups: 365 },
      { type: 'file', filename: exceptionPath, category: 'exception', maxLogSize: 10485760, backups: 10 },
      { type: 'file', filename: threatPath, category: 'threat', maxLogSize: 10485760, backups: 10 }
        ],
        replaceConsole: true
    });
    config.logger = {
        trace() {
            if (config.main.debug) {
                const currLogger = log4js.getLogger('info');
                currLogger.trace(...Array.prototype.slice.call(arguments));
            }
        },
        debug() {
            if (config.main.debug) {
                const currLogger = log4js.getLogger('info');
                currLogger.debug(...Array.prototype.slice.call(arguments));
            }
        },
        info() {
            const currLogger = log4js.getLogger('info');
            currLogger.info(...Array.prototype.slice.call(arguments));
        },
        warn() {
            const currLogger = log4js.getLogger('info');
            currLogger.warn(...Array.prototype.slice.call(arguments));
        },
        error() {
            const currLogger = log4js.getLogger('info');
            currLogger.error(...Array.prototype.slice.call(arguments));
        },
        fatal() {
            const currLogger = log4js.getLogger('info');
            currLogger.fatal(...Array.prototype.slice.call(arguments));
        },
        exception: log4js.getLogger('exception'),
        threat: log4js.getLogger('threat')
    };
    return Promise.resolve(config);
};

const initialDB = function (config) {
    options = dvalue.default(config.db, {});
    return new Promise((resolve, reject) => {
        switch (options.type) {
            case 'mongodb':
                var path;
                if (options.user && options.password) {
                    const tmpURL = url.parse(options.path);
                    tmpURL.auth = dvalue.sprintf('%s:%s', options.user, options.password);
                    path = url.format(tmpURL);
                } else {
                    path = options.path;
                }
                mongodb.connect(path, (e, d) => {
                    if (e) { reject(e); } else {
                        config.db = d;
                        resolve(config);
                    }
                });
                break;
            default:
            var DB = require('tingodb')().Db;
            db = new DB(config.path.dataset, {});
            resolve(config);
        }
    });
};

const initialBot = function (config) {
    const botFolder = path.join(__dirname, '../bots');
    const sub = 'js';
    const reg = new RegExp(`\.${sub}$`);
    const createBot = function (botPath) {
        const Bot = require(botPath);
        const bot = new Bot();
        return bot.init(config);
    };

    return new Promise((resolve, reject) => {
        fs.readdir(botFolder, (e, d) => {
            if (Array.isArray(d)) {
                resolve(d);
            } else {
                reject(e);
            }
        });
    }).then((d) => {
        d = d.filter(v => reg.test(v) && v.indexOf('_') == -1 && v != 'Receptor.js');
        d.unshift('Receptor.js');
        return d.reduce((pre, curr) => pre.then((res) => {
            const botPath = path.join(botFolder, curr);
            return createBot(botPath).then((nextRes) => {
                res.push(nextRes);
                return res;
            });
        }), Promise.resolve([]));
    });
};

const startService = function (Bots) {
    const start = function (bot) {
        return bot.start();
    };
    const ready = function (bot) {
        return bot.ready();
    };

    return Bots.reduce((pre, curr) => pre.then(res => start(curr).then((nextRes) => {
        res.push(nextRes);
        return res;
    })), Promise.resolve([])).then(v => Bots.reduce((pre, curr) => pre.then(res => ready(curr).then((nextRes) => {
        res.push(nextRes);
        return res;
    })), Promise.resolve([])));
};


// service start
initialFolder(packageInfo)
.then(initialConfig)
.then(initialTranslator)
.then(initialLogger)
.then(initialDB)
.then(initialBot)
.then(startService)
.catch((e) => {
    console.error(e);
});







/*
const os = require('os');
const fs = require('fs');
const path = require('path');
const log4js = require('log4js');
const dvalue = require('dvalue');
const ecDB = require('ecdb');
const packageInfo = require('../package.json');

var mongodb = require('mongodb').MongoClient;
var ecdb = new ecDB();
var UUID, config, folders;

// initial folder
var homepath = path.join(process.env.HOME || process.env.USERPROFILE, packageInfo.name);
var upload = path.join(homepath, "uploads/");
var logs = path.join(homepath, "logs/");
var dataset = path.join(homepath, "dataset/");
var tmp = path.join(homepath, "tmp/");
folders = {
  home: homepath,
  upload: upload,
  logs: logs,
  dataset: dataset,
  tmp: tmp
};
if (!fs.existsSync(homepath)) { fs.mkdirSync(homepath); }
if (!fs.existsSync(upload)) { fs.mkdirSync(upload); }
if (!fs.existsSync(logs)) { fs.mkdirSync(logs); }
if (!fs.existsSync(tmp)) { fs.mkdirSync(tmp); }

// initial logger
var infoPath = path.join(logs, 'info.log');
var exceptionPath = path.join(logs, 'exception.log');
var threatPath = path.join(logs, 'threat.log');
log4js.configure({
  "appenders": [
    { "type": "console" },
    { "type": "file", "filename": infoPath, "category": "info", "maxLogSize": 10485760, "backups": 365 },
    { "type": "file", "filename": exceptionPath, "category": "exception", "maxLogSize": 10485760, "backups": 10 },
    { "type": "file", "filename": threatPath, "category": "threat", "maxLogSize": 10485760, "backups": 10 }
  ],
  "replaceConsole": true
});
var logger = {
  info: log4js.getLogger('info'),
  exception: log4js.getLogger('exception'),
  threat: log4js.getLogger('threat')
};

// check is open?
var pathPID = path.join(homepath, 'PID');
var oldPID;

try {
  oldPID = parseInt(fs.readFileSync(pathPID));
  if(process.kill(oldPID, 0)) {
    process.exit();
  }
}
catch(e) {

}

// create PID file
var PID = process.pid;
fs.writeFile(pathPID, PID, function(err) {});

// load config
config = {
  UUID: UUID,
  path: folders,
  logger: logger,
  package: {
    name: packageInfo.name,
    version: packageInfo.version
  },
  powerby: packageInfo.name + " v" + packageInfo.version
};

// start all bot
var botFolder = path.join(__dirname, "../bots");
var files = fs.readdirSync(botFolder);
var bots = [];
var getBot = function (name) {
  var rs;
  for(var i in bots) {
    if(bots[i].name.toLowerCase() == name.toLowerCase()) { return bots[i]; }
  }
};
var startBot = function () {
  ecdb.connect({url: dataset}, function() {});
  mongodb.connect("mongodb://127.0.0.1:27056/simple", function (e, db) {
    var sub = "js";
    var reg = new RegExp('\.' + sub + '$');
    for(var key in files) {
      if(reg.test(files[key]) && files[key].indexOf("_") == -1) {
        var Bot = require(path.join(botFolder, files[key]));
        var bot = new Bot(config);
        bots.push(bot);
        bot.name = files[key].split('.' + sub)[0];
        bot.db = db;
        bot.ecdb = ecdb;
        bot.getBot = getBot;
      }
    }

    bots.map(function (b) {
      b.start();
    });
  });
};
startBot();
*/
