const assert = require('assert');
const dvalue = require('dvalue');
const mongodb = require('mongodb');
const textype = require('textype');


const Database = require('../utils/Database');

const attributeRegExp = /^_[a-zA-Z0-9]+$/;

const Model = class ModelClass {
    constructor() {
        return this;
    }

    static getValidId(id) {
        return textype.isObjectID(id) ? new mongodb.ObjectID(id) : Object.assign({}, id);
    }

    get updateQuery() {
        const result = { mtime: new Date().getTime() };
        Object.keys(this).map((k) => {
            if (attributeRegExp.test(k)) {
                const key = k.substr(1);
                try {
                    assert.deepEqual(this[k], this.__oldversion[k]);
                } catch (e) {
                    result[key] = this[k];
                }
            }
            return k;
        });
        return { $set: result };
    }

    get isModefied() {
        return Object.keys(this.updateQuery.$set).length > 0;
    }

    toDB() {
        const data = { ctime: new Date().getTime() };
        Object.keys(this).map((k) => {
            if (attributeRegExp.test(k)) {
                const key = k.substr(1);
                data[key] = this[k];
            }
            return k;
        });
        return data;
    }

    toAPI() {
        const data = {};
        Object.keys(this).map((k) => {
            if (attributeRegExp.test(k)) {
                const key = k.substr(1);
                data[key] = this[key];
            }
            return k;
        });
        return data;
    }

    save() {
        const data = {};
        Object.keys(this).map((k) => {
            if (attributeRegExp.test(k)) {
                data[k] = this[k];
            }
            return k;
        });
        this.__oldversion = dvalue.clone(data);
        return true;
    }

    static collection(db, tableName) {
        return new Database({ db, tableName });
    }
};

module.exports = Model;
